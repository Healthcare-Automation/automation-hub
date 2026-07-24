'use client'

import { Card, BarList, SmallLabel } from '@/components/DjcInsightsPanel'
import type { DjcPipelineData } from '@/lib/djcPipeline'

const CYAN = '#0891b2'
const EMERALD = '#059669'
const AMBER = '#d97706'

/** What happens AFTER a candidate lands in Salesforce: stages, placements, momentum, and the
 *  stall points. Mirrored from Salesforce after every hourly run. */
export default function PipelineView({ data }: { data: DjcPipelineData }) {
  const stalePct = data.staleContacts.total
    ? Math.round((data.staleContacts.neverApplied / data.staleContacts.total) * 100)
    : 0
  const maxStage = Math.max(...data.stages.map(s => s.count), 1)
  return (
    <div className="space-y-8">
      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={data.automationEra.applications} label="applications from automation-sourced candidates" accent="text-emerald-300" />
        <Stat value={data.automationEra.placedOrExtended} label="of them already placed or extended" accent="text-cyan-300" />
        <Stat value={`${data.repeatPlacements.people}`} label="professionals placed more than once" detail={`${data.repeatPlacements.placements} repeat placements — placed people get re-placed`} />
        <Stat value={`${stalePct}%`} label="of Salesforce candidates never got an application" detail={`${data.staleContacts.neverApplied.toLocaleString()} of ${data.staleContacts.total.toLocaleString()} — the funnel's biggest opportunity`} accent="text-amber-300" />
      </div>

      {/* Funnel */}
      <Card
        title="Application funnel — every stage on record"
        sub="How DJC-origin applications distribute across the recruiting stages (all time)."
      >
        <div className="space-y-2">
          {data.stages.map((s, i) => (
            <div key={s.stage} className="flex items-center gap-3">
              <span className="w-36 shrink-0 text-xs text-zinc-400">{s.stage}</span>
              <div className="h-3 grow rounded-sm bg-zinc-800">
                <div
                  className="h-3 rounded-sm"
                  style={{
                    width: `${Math.max((s.count / maxStage) * 100, s.count > 0 ? 1.5 : 0)}%`,
                    background: s.stage === 'Placed' || s.stage === 'Extended' ? EMERALD : CYAN,
                    opacity: s.stage === 'Placed' || s.stage === 'Extended' ? 1 : 1 - i * 0.06,
                  }}
                />
              </div>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-zinc-300">
                {s.count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Placements per year */}
        <Card title="Placements per year" sub="Momentum: 71 → 107 → 164 → 134 so far this year.">
          <BarList
            items={data.placementsPerYear.slice(-9).map(y => ({ key: y.year, label: y.year, count: y.count, color: CYAN }))}
            total={Math.max(...data.placementsPerYear.map(y => y.count), 1)}
            relative
          />
        </Card>

        {/* Recent placements */}
        <Card title="Recent placements" sub="⚡ = candidate sourced by the automation.">
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <tbody>
                {data.recentPlacements.map((p, i) => (
                  <tr key={i} className="border-t border-zinc-800/70 text-zinc-300 first:border-t-0">
                    <td className="whitespace-nowrap py-2 pr-3 font-medium">
                      {p.automationEra && <span title="automation-sourced">⚡ </span>}
                      {p.person ?? '—'}
                    </td>
                    <td className="max-w-56 truncate py-2 pr-3 text-zinc-500">{p.job ?? '—'}</td>
                    <td className="whitespace-nowrap py-2 text-right tabular-nums text-zinc-400">{p.placedOn ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* In flight now */}
      <Card
        title="In flight right now"
        sub="Applications currently moving through review, submittal, interview, or offer. ⚡ = automation-sourced."
      >
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-zinc-900">
              <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
                <th className="py-1.5 pr-3 font-medium">Candidate</th>
                <th className="py-1.5 pr-3 font-medium">Job</th>
                <th className="py-1.5 pr-3 font-medium">Stage</th>
                <th className="py-1.5 text-right font-medium">Since</th>
              </tr>
            </thead>
            <tbody>
              {data.inFlight.map((f, i) => (
                <tr key={i} className="border-t border-zinc-800/70 text-zinc-300">
                  <td className="whitespace-nowrap py-2 pr-3 font-medium">
                    {f.automationEra && <span title="automation-sourced">⚡ </span>}
                    {f.person ?? '—'}
                  </td>
                  <td className="max-w-64 truncate py-2 pr-3 text-zinc-500">{f.job ?? '—'}</td>
                  <td className="py-2 pr-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px]"
                      style={{
                        background: f.stage === 'Offer' ? `${EMERALD}22` : f.stage === 'Interview' ? `${CYAN}22` : `${AMBER}18`,
                        color: f.stage === 'Offer' ? '#6ee7b7' : f.stage === 'Interview' ? '#67e8f9' : '#fcd34d',
                      }}
                    >
                      {f.stage}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2 text-right tabular-nums text-zinc-400">{f.since ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function Stat({
  value, label, detail, accent,
}: {
  value: number | string
  label: string
  detail?: string
  accent?: string
}) {
  return (
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-5">
      <div className={`text-3xl font-semibold leading-none tabular-nums ${accent ?? 'text-zinc-100'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="mt-2 text-xs font-medium text-zinc-200">{label}</div>
      {detail && <div className="mt-1 text-[11px] leading-snug text-zinc-500">{detail}</div>}
    </div>
  )
}
