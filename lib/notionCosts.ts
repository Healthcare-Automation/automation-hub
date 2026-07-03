import type { ActualCost, AnthropicKeyCosts } from './aiBilling'

const NOTION = 'https://api.notion.com/v1'
const COST_DB = process.env.NOTION_COST_DB_ID || '38f23b11-7dfb-819a-a164-f7972d7fe0e2'

/** One API key per project → each key maps to its own Cost Tracker row. */
const ANTHROPIC_KEY_TO_SERVICE: Record<string, string> = {
  apikey_01E1jCBqxyWUjJvdZdSio79n: 'Anthropic (DJC)', // proxi-djc-automation
  apikey_011jexZPSisvaduTw8TZT8bm: 'Anthropic (Job Board)', // internal-job-board
}

export interface CostUpdate {
  service: string
  monthlyCost: number
}

/** Pure: turn vendor pulls into per-service row updates (cents-rounded).
 * Unmapped Anthropic keys are returned in `unmapped` for visibility, never attributed. */
export function buildCostUpdates(
  openai: ActualCost,
  anthropic: AnthropicKeyCosts,
): { updates: CostUpdate[]; unmapped: Record<string, number> } {
  const updates: CostUpdate[] = []
  const unmapped: Record<string, number> = {}
  if (openai.available && openai.last30 != null)
    updates.push({ service: 'OpenAI', monthlyCost: Math.round(openai.last30 * 100) / 100 })
  if (anthropic.available) {
    for (const [keyId, cost] of Object.entries(anthropic.byKey)) {
      const service = ANTHROPIC_KEY_TO_SERVICE[keyId]
      const rounded = Math.round(cost * 100) / 100
      if (service) updates.push({ service, monthlyCost: rounded })
      else if (rounded > 0) unmapped[keyId] = rounded
    }
  }
  return { updates, unmapped }
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
