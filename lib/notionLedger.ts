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

/** Find the month's parent row (sub-items container), creating it if missing. */
async function findOrCreateParent(monthStart: string): Promise<string | null> {
  const label = monthLabel(monthStart)
  const existing = await queryAll(LEDGER_DB, {
    filter: { property: 'Entry', title: { equals: label } },
  })
  if (existing.length > 0) return existing[0].id
  const res = await fetch(`${NOTION}/pages`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ parent: { database_id: LEDGER_DB }, properties: {
      Entry: { title: [{ text: { content: label } }] },
      Month: { date: { start: monthStart } },
    } }),
  })
  if (!res.ok) return null
  const j = await res.json()
  return j.id ?? null
}

/** "Kimedics → Salesforce" / "job_board (DentBoard)" → "Kimedics" / "job_board". */
function shortLabel(setupTitle: string): string {
  return setupTitle.split(' → ')[0].split(' (')[0]
}

/** Create a ledger page; returns its id or null. */
async function createPage(properties: object): Promise<string | null> {
  const res = await fetch(`${NOTION}/pages`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ parent: { database_id: LEDGER_DB }, properties }),
  })
  if (!res.ok) return null
  const j = await res.json()
  return j.id ?? null
}

/** Find the month's project-group row (e.g. "2026-07 · Shared"), creating it if missing. */
async function findOrCreateGroup(tag: string, label: string, monthStart: string, monthParentId: string | null): Promise<string | null> {
  const entry = `${tag} · ${label}`
  const existing = await queryAll(LEDGER_DB, {
    filter: { property: 'Entry', title: { equals: entry } },
  })
  if (existing.length > 0) return existing[0].id
  return createPage({
    Entry: { title: [{ text: { content: entry } }] },
    Month: { date: { start: monthStart } },
    'Parent item': { relation: monthParentId ? [{ id: monthParentId }] : [] },
  })
}

/** Snapshot every Cost Tracker row into the Monthly Costs ledger for the given month
 * (YYYY-MM-01), as Month ▸ Project-group ▸ cost. A service used by exactly one project
 * goes under that project's label; multi-project services go under "Shared". Group rows
 * carry the subtotal in Amount, so the month parent's rollup equals the real (dedup) bill.
 * Idempotent: skips services that already have a row for that month.
 * Returns count of cost rows created. */
export async function snapshotMonth(monthStart: string): Promise<number> {
  if (!LEDGER_DB) return 0
  const tag = monthStart.slice(0, 7)
  const parentId = await findOrCreateParent(monthStart)
  const existing = await queryAll(LEDGER_DB, {
    filter: { property: 'Month', date: { equals: monthStart } },
  })
  const have = new Set<string>()
  for (const r of existing) {
    have.add(r.properties?.Entry?.title?.[0]?.plain_text?.split(' · ')[1] ?? '')
  }

  // bucket every service by project group (one project → its label; several → Shared)
  const services = await queryAll(COST_DB, {})
  const setupTitleCache = new Map<string, string>()
  const buckets = new Map<string, { rowId: string; service: string; amount: number; clients: { name: string }[] }[]>()
  const subtotals = new Map<string, number>()
  for (const r of services) {
    const p = r.properties
    const service: string = p?.Service?.title?.[0]?.plain_text ?? ''
    if (!service || service === 'OpenRouter') continue
    const projs: { id: string }[] = p?.Projects?.relation ?? []
    let label = 'Shared'
    if (projs.length === 1) {
      const pid = projs[0].id
      if (!setupTitleCache.has(pid)) {
        const res = await fetch(`${NOTION}/pages/${pid}`, { headers: headers() })
        const j = res.ok ? await res.json() : null
        setupTitleCache.set(pid, j?.properties?.Project?.title?.[0]?.plain_text ?? 'Shared')
      }
      label = shortLabel(setupTitleCache.get(pid) ?? 'Shared')
    } else if (projs.length === 0) {
      label = 'Other'
    }
    const amount = p?.['Monthly Cost']?.number ?? 0
    subtotals.set(label, (subtotals.get(label) ?? 0) + amount)
    if (have.has(service)) continue
    const members = buckets.get(label) ?? []
    members.push({
      rowId: r.id,
      service,
      amount,
      clients: (p?.Clients?.multi_select ?? []).map((o: { name: string }) => ({ name: o.name })),
    })
    buckets.set(label, members)
  }

  let created = 0
  for (const [label, members] of buckets) {
    const groupId = await findOrCreateGroup(tag, label, monthStart, parentId)
    for (const m of members) {
      const id = await createPage({
        Entry: { title: [{ text: { content: `${tag} · ${m.service}` } }] },
        Month: { date: { start: monthStart } },
        Service: { relation: [{ id: m.rowId }] },
        Amount: { number: m.amount },
        Clients: { multi_select: m.clients },
        Source: { select: { name: 'Auto' } },
        'Parent item': { relation: groupId ? [{ id: groupId }] : [] },
      })
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
  return created
}
