const NOTION = 'https://api.notion.com/v1'
const LEDGER_DB = process.env.NOTION_LEDGER_DB_ID || ''
const COST_DB = process.env.NOTION_COST_DB_ID || '38f23b11-7dfb-819a-a164-f7972d7fe0e2'

function headers() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  }
}

async function queryAll(db: string, body: object) {
  const res = await fetch(`${NOTION}/databases/${db}/query`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) return []
  const j = await res.json()
  return j.results ?? []
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "2026-08-01" → "August 2026" — the display title of a month's parent row. */
function monthLabel(monthStart: string): string {
  const [y, m] = monthStart.split('-')
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`
}

/** One emoji per project group — keeps ledger rows visually scannable. */
const PROJECT_EMOJI: Record<string, string> = {
  Kimedics: '🏥',
  DJC: '🦷',
  job_board: '📋',
  'dental-agent': '🤖',
  'automation-hub': '🛠️',
}
const MONTH_EMOJI = '📅'
const FALLBACK_EMOJI = '📦'

/** "Kimedics → Salesforce" / "job_board (DentBoard)" → "Kimedics" / "job_board". */
function shortLabel(setupTitle: string): string {
  return setupTitle.split(' → ')[0].split(' (')[0]
}

/** Create a ledger page; returns its id or null. */
async function createPage(properties: object, emoji?: string): Promise<string | null> {
  const res = await fetch(`${NOTION}/pages`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      parent: { database_id: LEDGER_DB },
      ...(emoji ? { icon: { type: 'emoji', emoji } } : {}),
      properties,
    }),
  })
  if (!res.ok) return null
  const j = await res.json()
  return j.id ?? null
}

/** Find the month's parent row (sub-items container), creating it if missing. */
async function findOrCreateParent(monthStart: string): Promise<string | null> {
  const label = monthLabel(monthStart)
  const existing = await queryAll(LEDGER_DB, {
    filter: { property: 'Entry', title: { equals: label } },
  })
  if (existing.length > 0) return existing[0].id
  return createPage({
    Entry: { title: [{ text: { content: label } }] },
    Month: { date: { start: monthStart } },
  }, MONTH_EMOJI)
}

/** Find the month's project-group row (e.g. "2026-08 · DJC"), creating it if missing.
 * The client lands in the Clients field, not the title. */
async function findOrCreateGroup(tag: string, label: string, clients: string[], emoji: string, monthStart: string, monthParentId: string | null): Promise<string | null> {
  const entry = `${tag} · ${label}`
  const existing = await queryAll(LEDGER_DB, {
    filter: { property: 'Entry', title: { equals: entry } },
  })
  if (existing.length > 0) return existing[0].id
  return createPage({
    Entry: { title: [{ text: { content: entry } }] },
    Month: { date: { start: monthStart } },
    Clients: { multi_select: clients.map(name => ({ name })) },
    'Parent item': { relation: monthParentId ? [{ id: monthParentId }] : [] },
  }, emoji)
}

/** Snapshot every Cost Tracker row into the Monthly Costs ledger for the given month
 * (YYYY-MM-01), as Month ▸ "project (Client)" ▸ cost with FULL showback: a service used
 * by N projects gets a full-amount row under each project's group, so every project
 * shows its true footprint. Group rows carry their (overlapping) subtotal; the month
 * parent's Amount is the REAL de-duplicated bill (each service counted once) — so the
 * month total intentionally does not equal the sum of its groups.
 * Group labels/emoji derive from the Setup row (project name + Client select).
 * Idempotent per (project, service): re-runs create nothing new.
 * `usageOverrides` maps service name → exact calendar-month amount (LLM APIs): rows
 * for those services are created with — or, if they already exist, UPDATED to — the
 * override, so usage lands in the month it actually happened.
 * Returns count of cost rows created. */
export async function snapshotMonth(monthStart: string, usageOverrides: Record<string, number> = {}): Promise<number> {
  if (!LEDGER_DB) return 0
  const tag = monthStart.slice(0, 7)
  const parentId = await findOrCreateParent(monthStart)

  // existing rows this month → titles by id, then (label|service) pairs already present
  const existing = await queryAll(LEDGER_DB, {
    filter: { property: 'Month', date: { equals: monthStart } },
  })
  const titleById = new Map<string, string>()
  for (const r of existing) {
    titleById.set(r.id, r.properties?.Entry?.title?.[0]?.plain_text ?? '')
  }
  const have = new Set<string>()
  for (const r of existing) {
    if (!r.properties?.Service?.relation?.length) continue // group/month rows
    const service = (titleById.get(r.id) ?? '').split(' · ')[1] ?? ''
    const groupTitle = titleById.get(r.properties?.['Parent item']?.relation?.[0]?.id ?? '') ?? ''
    const label = groupTitle.split(' · ')[1] ?? ''
    have.add(`${label}|${service}`)
  }

  // Setup page id → { label: "DJC", client: "Proxi", emoji }
  const setupCache = new Map<string, { label: string; client: string; emoji: string }>()
  async function projectInfo(setupPageId: string): Promise<{ label: string; client: string; emoji: string }> {
    const cached = setupCache.get(setupPageId)
    if (cached) return cached
    const res = await fetch(`${NOTION}/pages/${setupPageId}`, { headers: headers() })
    const j = res.ok ? await res.json() : null
    const label = shortLabel(j?.properties?.Project?.title?.[0]?.plain_text ?? 'Unknown')
    const client = j?.properties?.Client?.select?.name ?? '?'
    const info = { label, client, emoji: PROJECT_EMOJI[label] ?? FALLBACK_EMOJI }
    setupCache.set(setupPageId, info)
    return info
  }

  // plan: project label → services (full showback); real total counts each service once.
  // A service attributed to EVERY tracked project goes to a single "Shared Cost" group
  // instead of being duplicated into each project's toggle.
  const services = await queryAll(COST_DB, {})
  const union = new Set<string>()
  for (const r of services) {
    const service: string = r.properties?.Service?.title?.[0]?.plain_text ?? ''
    if (!service || service === 'OpenRouter') continue
    for (const proj of r.properties?.Projects?.relation ?? []) union.add(proj.id)
  }
  const SHARED_LABEL = 'Shared Cost'
  const SHARED_EMOJI = '🧩'
  const plan = new Map<string, { clients: string[]; emoji: string; members: { rowId: string; service: string; amount: number }[] }>()
  const subtotals = new Map<string, number>()
  let realTotal = 0
  for (const r of services) {
    const p = r.properties
    const service: string = p?.Service?.title?.[0]?.plain_text ?? ''
    if (!service || service === 'OpenRouter') continue
    const amount = usageOverrides[service] ?? p?.['Monthly Cost']?.number ?? 0
    realTotal += amount
    const projs: { id: string }[] = p?.Projects?.relation ?? []
    const isShared = union.size > 1 && projs.length === union.size && projs.every(x => union.has(x.id))
    if (isShared) {
      subtotals.set(SHARED_LABEL, (subtotals.get(SHARED_LABEL) ?? 0) + amount)
      if (!have.has(`${SHARED_LABEL}|${service}`)) {
        const sharedClients: string[] = []
        for (const id of union) {
          const { client } = await projectInfo(id)
          if (!sharedClients.includes(client)) sharedClients.push(client)
        }
        const bucket = plan.get(SHARED_LABEL) ?? { clients: sharedClients, emoji: SHARED_EMOJI, members: [] }
        bucket.members.push({ rowId: r.id, service, amount })
        plan.set(SHARED_LABEL, bucket)
      }
      continue
    }
    for (const proj of projs) {
      const { label, client, emoji } = await projectInfo(proj.id)
      subtotals.set(label, (subtotals.get(label) ?? 0) + amount)
      if (have.has(`${label}|${service}`)) continue
      const bucket = plan.get(label) ?? { clients: [client], emoji, members: [] }
      bucket.members.push({ rowId: r.id, service, amount })
      plan.set(label, bucket)
    }
  }

  // update pass: existing rows for overridden services get the exact-month amount
  for (const r of existing) {
    if (!r.properties?.Service?.relation?.length) continue
    const service = (titleById.get(r.id) ?? '').split(' · ')[1] ?? ''
    if (!(service in usageOverrides)) continue
    await fetch(`${NOTION}/pages/${r.id}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ properties: { Amount: { number: usageOverrides[service] } } }),
    })
  }

  let created = 0
  for (const [label, { clients, emoji, members }] of plan) {
    const groupId = await findOrCreateGroup(tag, label, clients, emoji, monthStart, parentId)
    for (const m of members) {
      const id = await createPage({
        Entry: { title: [{ text: { content: `${tag} · ${m.service}` } }] },
        Month: { date: { start: monthStart } },
        Service: { relation: [{ id: m.rowId }] },
        Amount: { number: m.amount },
        Clients: { multi_select: clients.map(name => ({ name })) },
        Source: { select: { name: 'Auto' } },
        'Parent item': { relation: groupId ? [{ id: groupId }] : [] },
      }, emoji)
      if (id) created++
    }
    if (groupId) {
      await fetch(`${NOTION}/pages/${groupId}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ properties: { Amount: { number: Math.round((subtotals.get(label) ?? 0) * 100) / 100 } } }),
      })
    }
  }
  // refresh subtotals on groups that existed before this run (e.g. truing up a month)
  for (const r of existing) {
    if (r.properties?.Service?.relation?.length) continue
    const label = (titleById.get(r.id) ?? '').split(' · ')[1] ?? ''
    if (!label || !subtotals.has(label)) continue
    await fetch(`${NOTION}/pages/${r.id}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ properties: { Amount: { number: Math.round((subtotals.get(label) ?? 0) * 100) / 100 } } }),
    })
  }
  if (parentId) {
    await fetch(`${NOTION}/pages/${parentId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ properties: { Amount: { number: Math.round(realTotal * 100) / 100 } } }),
    })
  }
  return created
}
