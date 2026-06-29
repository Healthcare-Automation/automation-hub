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

export function ChangelogPanel({ automation }: { automation: Automation }) {
  const entries = [...CHANGELOG[automation]].sort((a, b) => b.date.localeCompare(a.date))

  // Group into months (already newest-first because entries are sorted desc).
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
          A running log of the meaningful improvements to this automation — what changed, when, and why.
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
                <li key={`${e.date}-${i}`} className="relative">
                  <span className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ring-2 ring-zinc-950 ${CATEGORY_META[e.category].dot}`} />
                  <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[13px] font-semibold text-zinc-100">{e.title}</span>
                      <Badge category={e.category} />
                      <span className="ml-auto text-[10px] font-medium tabular-nums text-zinc-500">{dayLabel(e.date)}</span>
                    </div>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">{e.summary}</p>
                  </div>
                </li>
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
