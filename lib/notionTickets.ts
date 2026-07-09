import type { Automation, ChangeCategory, ChangeEntry } from './changelog'

// The Updates tab reads the "Proxi Tickets" board directly so it can't drift from reality:
// file a ticket (proxi-notion-tickets skill) and it appears here automatically — no code deploy.
// Only client-facing, shipped tickets surface: Ticket Type = Customer AND Status = Done.
const NOTION = 'https://api.notion.com/v1'
const TICKETS_DB = process.env.NOTION_TICKETS_DB_ID || '38e23b11-7dfb-80a6-b9a4-d0c829d3a981'

const PROJECT_TO_AUTOMATION: Record<string, Automation> = {
  'DJC Candidate Scraping Automation': 'djc',
  'Kimedics Automation': 'kimedics',
}

const CATEGORY_MAP: Record<string, ChangeCategory> = {
  New: 'new',
  Reliability: 'reliability',
  Accuracy: 'accuracy',
  Reporting: 'reporting',
}

export interface TicketChangelog {
  djc: ChangeEntry[]
  kimedics: ChangeEntry[]
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  }
}

function plain(rich: Array<{ plain_text: string }> | undefined): string {
  return (rich ?? []).map((r) => r.plain_text).join('').trim()
}

/** Group a ticket's body blocks by their heading_2 sections (Problem / Mitigation / Solution).
 * "Problem" appears twice — the one-liner and the detail — so sections is a flat ordered list. */
async function readBody(pageId: string): Promise<{ summary: string; details: string; examples: string[] }> {
  const res = await fetch(`${NOTION}/blocks/${pageId}/children?page_size=100`, { headers: headers() })
  if (!res.ok) return { summary: '', details: '', examples: [] }
  const blocks = (await res.json()).results as Array<Record<string, any>>

  const sections: { heading: string; lines: string[] }[] = []
  for (const b of blocks) {
    if (b.type === 'heading_2') {
      sections.push({ heading: plain(b.heading_2?.rich_text).toLowerCase(), lines: [] })
      continue
    }
    const rich = b[b.type]?.rich_text as Array<{ plain_text: string }> | undefined
    const text = plain(rich)
    if (text && sections.length) sections[sections.length - 1].lines.push(text)
  }

  const problems = sections.filter((s) => s.heading === 'problem')
  const mitigation = sections.find((s) => s.heading === 'mitigation')
  const solution = sections.find((s) => s.heading === 'solution')

  const summary = problems[0]?.lines.join(' ') ?? ''
  const details = problems[1]?.lines.join(' ') || mitigation?.lines.join(' ') || ''
  const examples = solution?.lines ?? []
  return { summary, details, examples }
}

/** Fetch client-facing shipped tickets and shape them as changelog entries, per automation.
 * Never throws — on any failure returns empty lists so the static changelog still renders. */
export async function getTicketChangelog(): Promise<TicketChangelog> {
  const out: TicketChangelog = { djc: [], kimedics: [] }
  try {
    const res = await fetch(`${NOTION}/databases/${TICKETS_DB}/query`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        page_size: 100,
        filter: {
          and: [
            { property: 'Ticket Type', select: { equals: 'Customer' } },
            { property: 'Status', status: { equals: 'Done' } },
          ],
        },
      }),
    })
    if (!res.ok) return out
    const rows = (await res.json()).results as Array<Record<string, any>>

    const built = await Promise.all(
      rows.map(async (p) => {
        const props = p.properties
        const automation = PROJECT_TO_AUTOMATION[props.Project?.select?.name ?? '']
        if (!automation) return null
        const date = (props.Resolved?.date?.start ?? props['Date Submitted']?.date?.start ?? '').slice(0, 10)
        if (!date) return null
        const category = CATEGORY_MAP[props.Category?.select?.name ?? ''] ?? 'reliability'
        const title = plain(props.Name?.title)
        const { summary, details, examples } = await readBody(p.id)
        const entry: ChangeEntry = {
          date,
          category,
          title,
          summary: summary || title,
          details: details || summary || title,
          examples: examples.length ? examples : undefined,
        }
        return { automation, entry }
      }),
    )

    for (const b of built) {
      if (b) out[b.automation].push(b.entry)
    }
    return out
  } catch {
    return out
  }
}
