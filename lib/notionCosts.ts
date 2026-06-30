import type { ActualCost } from './aiBilling'

const NOTION = 'https://api.notion.com/v1'
const COST_DB = process.env.NOTION_COST_DB_ID || '38f23b11-7dfb-819a-a164-f7972d7fe0e2'

export interface CostUpdate {
  service: string
  monthlyCost: number
}

/** Pure: turn vendor pulls into per-service row updates (cents-rounded). */
export function buildCostUpdates(openai: ActualCost, anthropic: ActualCost): CostUpdate[] {
  const out: CostUpdate[] = []
  if (openai.available && openai.last30 != null)
    out.push({ service: 'OpenAI', monthlyCost: Math.round(openai.last30 * 100) / 100 })
  if (anthropic.available && anthropic.last30 != null)
    out.push({ service: 'Anthropic', monthlyCost: Math.round(anthropic.last30 * 100) / 100 })
  return out
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  }
}

async function findRowId(service: string): Promise<string | null> {
  const res = await fetch(`${NOTION}/databases/${COST_DB}/query`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ filter: { property: 'Service', title: { equals: service } } }),
  })
  if (!res.ok) return null
  const j = await res.json()
  return j.results?.[0]?.id ?? null
}

/** Side-effecting: PATCH Monthly Cost + Last Checked for each update. Returns count written. */
export async function applyCostUpdates(updates: CostUpdate[], today: string): Promise<number> {
  let n = 0
  for (const u of updates) {
    const id = await findRowId(u.service)
    if (!id) continue
    const res = await fetch(`${NOTION}/pages/${id}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ properties: {
        'Monthly Cost': { number: u.monthlyCost },
        'Last Checked': { date: { start: today } },
      } }),
    })
    if (res.ok) n++
  }
  return n
}
