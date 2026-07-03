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

/** One emoji per client group — keeps ledger rows visually scannable. */
const CLIENT_EMOJI: Record<string, string> = {
  Proxi: '🏢',
  Ignite: '🔥',
  Internal: '🏠',
}
const MONTH_EMOJI = '📅'
const FALLBACK_EMOJI = '📦'

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

/** Find the month's client-group row (e.g. "2026-08 · Proxi"), creating it if missing. */
async function findOrCreateGroup(tag: string, client: string, monthStart: string, monthParentId: string | null): Promise<string | null> {
  const entry = `${tag} · ${client}`
  const existing = await queryAll(LEDGER_DB, {
    filter: { property: 'Entry', title: { equals: entry } },
  })
  if (existing.length > 0) return existing[0].id
  return createPage({
    Entry: { title: [{ text: { content: entry } }] },
    Month: { date: { start: monthStart } },
    'Parent item': { relation: monthParentId ? [{ id: monthParentId }] : [] },
  }, CLIENT_EMOJI[client] ?? FALLBACK_EMOJI)
}

/** Snapshot every Cost Tracker row into the Monthly Costs ledger for the given month
 * (YYYY-MM-01), as Month ▸ Client ▸ cost with FULL showback: a service used by N
 * clients gets a full-amount row under each client's group, so every client shows its
 * true footprint. Client-group rows carry their (overlapping) subtotal; the month
 * parent's Amount is the REAL de-duplicated bill (each service counted once) — so the
 * month total intentionally does not equal the sum of its client groups.
 * Idempotent per (client, service): re-runs create nothing new.
 * Returns count of cost rows created. */
export async function snapshotMonth(monthStart: string): Promise<number> {
  if (!LEDGER_DB) return 0
  const tag = monthStart.slice(0, 7)
  const parentId = await findOrCreateParent(monthStart)

  // existing rows this month → titles by id, then (client|service) pairs already present
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
    const client = groupTitle.split(' · ')[1] ?? ''
    have.add(`${client}|${service}`)
  }

  // plan: client → services (full showback); real total counts each service once
  const services = await queryAll(COST_DB, {})
  const plan = new Map<string, { rowId: string; service: string; amount: number }[]>()
  const subtotals = new Map<string, number>()
  let realTotal = 0
  for (const r of services) {
    const p = r.properties
    const service: string = p?.Service?.title?.[0]?.plain_text ?? ''
    if (!service || service === 'OpenRouter') continue
    const amount = p?.['Monthly Cost']?.number ?? 0
    realTotal += amount
    const clients: string[] = (p?.Clients?.multi_select ?? []).map((o: { name: string }) => o.name)
    for (const client of clients.length ? clients : ['Unattributed']) {
      subtotals.set(client, (subtotals.get(client) ?? 0) + amount)
      if (have.has(`${client}|${service}`)) continue
      const members = plan.get(client) ?? []
      members.push({ rowId: r.id, service, amount })
      plan.set(client, members)
    }
  }

  let created = 0
  for (const [client, members] of plan) {
    const groupId = await findOrCreateGroup(tag, client, monthStart, parentId)
    for (const m of members) {
      const id = await createPage({
        Entry: { title: [{ text: { content: `${tag} · ${m.service}` } }] },
        Month: { date: { start: monthStart } },
        Service: { relation: [{ id: m.rowId }] },
        Amount: { number: m.amount },
        Clients: { multi_select: [{ name: client }] },
        Source: { select: { name: 'Auto' } },
        'Parent item': { relation: groupId ? [{ id: groupId }] : [] },
      }, CLIENT_EMOJI[client] ?? FALLBACK_EMOJI)
      if (id) created++
    }
    if (groupId) {
      await fetch(`${NOTION}/pages/${groupId}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ properties: { Amount: { number: Math.round((subtotals.get(client) ?? 0) * 100) / 100 } } }),
      })
    }
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
