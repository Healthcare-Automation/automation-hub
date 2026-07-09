import { CHANGELOG, CATEGORY_META, type Automation, type ChangeEntry } from '@/lib/changelog'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function monthKey(iso: string) {
  return iso.slice(0, 7) // yyyy-mm
}
function monthLabel(iso: string) {
  const [y, m] = iso.split('-')
  return `${MONTHS[Number(m) - 1]} ${y}`
}
function dayLabel(iso: string) {
  const [, m, d] = iso.split('-')
  return `${MONTHS[Number(m) - 1].slice(0, 3)} ${Number(d)}`
}

function Badge({ category }: { category: ChangeEntry['category'] }) {
  const c = CATEGORY_META[category]
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${c.bg} ${c.text} ring-1 ${c.ring}`}>
      <span className={`h-1 w-1 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

function Chevron() {
  return (
    <svg
      className="h-3 w-3 shrink-0 text-zinc-500 transition-transform duration-200 group-open:rotate-90"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function Entry({ e }: { e: ChangeEntry }) {
  return (
    <li className="relative">
      <span className={`absolute -left-[21px] top-3 h-2 w-2 rounded-full ring-2 ring-zinc-950 ${CATEGORY_META[e.category].dot}`} />
      <details className="group rounded-lg border border-zinc-800/70 bg-zinc-900/30 transition-colors open:border-zinc-700/70 open:bg-zinc-900/50">
        <summary className="flex cursor-pointer list-none flex-col gap-1 p-3 [&::-webkit-details-marker]:hidden">
          <div className="flex items-center gap-x-2">
            <span className="text-[13px] font-semibold text-zinc-100">{e.title}</span>
            <Badge category={e.category} />
            <span className="ml-auto text-[10px] font-medium tabular-nums text-zinc-500">{dayLabel(e.date)}</span>
            <Chevron />
          </div>
          <p className="text-[12px] leading-relaxed text-zinc-400">{e.summary}</p>
        </summary>
        <div className="border-t border-zinc-800/70 px-3 pb-3 pt-2.5">
          <p className="text-[12px] leading-relaxed text-zinc-300">{e.details}</p>
          {e.examples && e.examples.length > 0 && (
            <div className="mt-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                {e.examples.length === 1 ? 'Example' : 'Examples'}
              </p>
              <ul className="mt-1 space-y-1">
                {e.examples.map((ex, k) => (
                  <li key={k} className="flex gap-2 text-[11.5px] leading-relaxed text-zinc-400">
                    <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${CATEGORY_META[e.category].dot}`} />
                    <span>{ex}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </li>
  )
}

// Tickets resolved before this date (per automation) are already told by the curated static
// entries above — the static log was maintained up to here when we wired the tickets feed
// (2026-07-09). Tickets resolved on/after surface automatically, so a newly-filed client ticket
// appears on this tab with no code deploy. Rule going forward: an incident is logged as a ticket
// OR a static entry, never both, so the two feeds never duplicate.
const TICKET_FEED_SINCE: Record<Automation, string> = {
  djc: '2026-07-05', // last curated DJC static entry: 2026-07-04
  kimedics: '2026-07-09', // last curated Kimedics static entry: 2026-07-08
}

export function ChangelogPanel({
  automation,
  ticketEntries = [],
}: {
  automation: Automation
  // Live entries sourced from the Notion tickets board (see lib/notionTickets.ts) — merged with
  // the curated static log so filing a ticket keeps this tab current with no code deploy.
  ticketEntries?: ChangeEntry[]
}) {
  const freshTickets = ticketEntries.filter((t) => t.date >= TICKET_FEED_SINCE[automation])
  const entries = [...CHANGELOG[automation], ...freshTickets].sort((a, b) => b.date.localeCompare(a.date))

  const groups: { key: string; label: string; items: ChangeEntry[] }[] = []
  for (const e of entries) {
    const k = monthKey(e.date)
    let g = groups.find((x) => x.key === k)
    if (!g) {
      g = { key: k, label: monthLabel(e.date), items: [] }
      groups.push(g)
    }
    g.items.push(e)
  }

  const counts = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-5">
      {/* Header + legend */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">What&apos;s changed</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">
          A running log of the meaningful improvements to this automation. Click any update for details and examples.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {(Object.keys(CATEGORY_META) as ChangeEntry['category'][]).map((k) =>
            counts[k] ? (
              <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
                <span className={`h-1.5 w-1.5 rounded-full ${CATEGORY_META[k].dot}`} />
                {CATEGORY_META[k].label} <span className="text-zinc-600">{counts[k]}</span>
              </span>
            ) : null,
          )}
        </div>
      </div>

      {/* Timeline grouped by month */}
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.key}>
            <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{g.label}</h3>
            <ol className="relative space-y-2 border-l border-zinc-800 pl-4">
              {g.items.map((e, i) => (
                <Entry key={`${e.date}-${i}`} e={e} />
              ))}
            </ol>
          </section>
        ))}
      </div>

      <p className="border-t border-zinc-800/60 pt-3 text-[11px] text-zinc-600">
        {entries.length} updates since launch · most recent first.
      </p>
    </div>
  )
}
