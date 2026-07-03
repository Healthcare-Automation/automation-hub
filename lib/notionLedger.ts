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

/** Snapshot every Cost Tracker row into the Monthly Costs ledger for the given month
 * (YYYY-MM-01), nested under the month's parent row. Idempotent: skips services that
 * already have a row for that month. Returns count of rows created. */
export async function snapshotMonth(monthStart: string): Promise<number> {
  if (!LEDGER_DB) return 0
  const parentId = await findOrCreateParent(monthStart)
  const existing = await queryAll(LEDGER_DB, {
    filter: { property: 'Month', date: { equals: monthStart } },
  })
  const have = new Set<string>()
  for (const r of existing) {
    have.add(r.properties?.Entry?.title?.[0]?.plain_text?.split(' · ')[1] ?? '')
  }
  const services = await queryAll(COST_DB, {})
  let created = 0
  for (const r of services) {
    const p = r.properties
    const service: string = p?.Service?.title?.[0]?.plain_text ?? ''
    if (!service || service === 'OpenRouter' || have.has(service)) continue
    const res = await fetch(`${NOTION}/pages`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ parent: { database_id: LEDGER_DB }, properties: {
        Entry: { title: [{ text: { content: `${monthStart.slice(0, 7)} · ${service}` } }] },
        Month: { date: { start: monthStart } },
        Service: { relation: [{ id: r.id }] },
        Amount: { number: p?.['Monthly Cost']?.number ?? 0 },
        Clients: { multi_select: (p?.Clients?.multi_select ?? []).map((o: { name: string }) => ({ name: o.name })) },
        Source: { select: { name: 'Auto' } },
        'Parent item': { relation: parentId ? [{ id: parentId }] : [] },
      } }),
    })
    if (res.ok) created++
  }
  return created
}
