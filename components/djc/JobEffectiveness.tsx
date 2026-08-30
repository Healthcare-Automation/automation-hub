'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CHART } from '@/lib/chartTokens'
import type { JobEffectiveness } from '@/lib/djcOps'

/**
 * How well Proxi fills the roles it takes on.
 *
 * Three outcomes per job rather than one: opened, someone submitted, filled. A job that closed with
 * nobody put forward failed differently from one where candidates were sent and rejected, and the
 * two need different fixes — so they are never collapsed into a single "fill rate".
 */
type View = 'monthly' | 'quarterly' | 'duration' | 'state' | 'type' | 'practice' | 'city' | 'open'

const VIEWS: { key: View; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'duration', label: 'How long open' },
  { key: 'state', label: 'By state' },
  { key: 'type', label: 'By role' },
  { key: 'practice', label: 'By practice' },
  { key: 'city', label: 'By city' },
  { key: 'open', label: 'Open now' },
]

const monthLabel = (m: string) =>
  new Date(m + '-02').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

export default function JobEffectivenessView({ data }: { data: JobEffectiveness }) {
  const [view, setView] = useState<View>('monthly')
  const [asTable, setAsTable] = useState(false)

  const fillRate = data.ytdOpened ? Math.round((data.ytdFilled / data.ytdOpened) * 100) : 0
  const subRate = data.ytdOpened ? Math.round((data.ytdSubmitted / data.ytdOpened) * 100) : 0
  const concentration = data.byPractice.length
    ? Math.round((data.topPracticeShare / Math.max(data.ytdOpened, 1)) * 100) : 0

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={data.ytdOpened.toLocaleString()} label="jobs opened this year"
              detail={`${data.priorYtdOpened} by this point last year`} tone="text-cyan-700 dark:text-cyan-300" />
        <Stat value={`${subRate}%`} label="had someone put forward"
              detail={`${data.ytdSubmitted} of ${data.ytdOpened}`} tone="text-zinc-800 dark:text-zinc-200" />
        <Stat value={`${fillRate}%`} label="were filled"
              detail={`${data.ytdFilled} of ${data.ytdOpened}`} tone="text-teal-700 dark:text-teal-300" />
        <Stat value={data.openNow.toLocaleString()} label="open right now"
              detail={`across ${data.practicesTotal} practices`} tone="text-zinc-800 dark:text-zinc-200" />
      </div>

      <div className="mt-5 mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex flex-wrap rounded-lg border border-zinc-200 bg-zinc-900/[0.04] dark:border-zinc-700/60 dark:bg-zinc-800/40 p-0.5">
          {VIEWS.map(v => (
            <button key={v.key} onClick={() => setView(v.key)}
                    className={cn('rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                      view === v.key ? 'bg-white text-zinc-900 shadow-sm dark:bg-white/10 dark:text-zinc-100 dark:shadow-none' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300')}>
              {v.label}
            </button>
          ))}
        </span>
        <button onClick={() => setAsTable(v => !v)}
                className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-700/60 dark:bg-zinc-800/40 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 transition-colors hover:text-zinc-900 dark:hover:text-zinc-200">
          {asTable ? 'Chart' : 'Table'}
        </button>
      </div>

      {view === 'monthly' && (
        <Outcomes rows={data.months.slice(-12).map((m, i, a) => ({
          label: monthLabel(m.month), opened: m.opened, submitted: m.submitted, filled: m.filled,
          prior: m.priorYear, partial: i === a.length - 1,
        }))} table={asTable} priorLabel="last year" />
      )}
      {view === 'quarterly' && (
        <Outcomes rows={data.quarters.map((q, i, a) => ({
          label: q.label, opened: q.opened, submitted: q.submitted, filled: q.filled,
          prior: q.priorYear, partial: i === a.length - 1,
        }))} table={asTable} priorLabel="year before" />
      )}
      {view === 'state' && <Outcomes rows={data.byState.map(g => ({ label: g.name, opened: g.opened, submitted: g.submitted, filled: g.filled }))} table={asTable} />}
      {view === 'type' && <Outcomes rows={data.byType.map(g => ({ label: g.name, opened: g.opened, submitted: g.submitted, filled: g.filled }))} table={asTable} />}
      {view === 'practice' && (
        <>
          <p className="mb-3 max-w-3xl text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            {data.practicesTotal} practices have given us work, but demand is concentrated — the
            largest single client accounts for {concentration}% of everything opened this year.
          </p>
          <Outcomes rows={data.byPractice.map(g => ({ label: g.name, opened: g.opened, submitted: g.submitted, filled: g.filled }))} table={asTable} />
        </>
      )}

      {view === 'city' && <CityView data={data} />}
      {view === 'duration' && <Durations data={data} table={asTable} />}
      {view === 'open' && <OpenAges data={data} />}

      <p className="mt-5 border-t border-zinc-200 dark:border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-500">
        &ldquo;Put forward&rdquo; means at least one candidate reached submittal on that job.
        &ldquo;Filled&rdquo; means a placement was recorded against it. Duration uses Salesforce&rsquo;s
        own days-open figure; the close-date field is populated on too few records to trust.
      </p>
    </div>
  )
}

/* Opened → put forward → filled, as a bullet chart: the bar is the jobs opened, the fill is
   the ones filled, and the tick marks how many had someone put forward. */
function Outcomes({
  rows, table, priorLabel,
}: {
  rows: { label: string; opened: number; submitted: number; filled: number; prior?: number | null; partial?: boolean }[]
  table: boolean
  priorLabel?: string
}) {
  const max = Math.max(...rows.map(r => r.opened), 1)

  if (table) {
    return (
      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-[12px]">
          <thead className="bg-zinc-50 dark:bg-zinc-900/60">
            <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2 font-medium">Period</th>
              <th className="py-2 pr-3 text-right font-medium">Opened</th>
              <th className="py-2 pr-3 text-right font-medium">Put forward</th>
              <th className="py-2 pr-3 text-right font-medium">%</th>
              <th className="py-2 pr-3 text-right font-medium">Filled</th>
              <th className="py-2 pr-3 text-right font-medium">%</th>
              {priorLabel && <th className="py-2 pr-3 text-right font-medium">vs {priorLabel}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-t border-zinc-200 dark:border-zinc-800/70">
                <td className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300">
                  {r.label}{r.partial && <span className="ml-1 text-[10px] text-zinc-500 dark:text-zinc-600">so far</span>}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-800 dark:text-zinc-200">{r.opened}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{r.submitted}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-500">
                  {r.opened ? Math.round((r.submitted / r.opened) * 100) : 0}%
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-teal-700 dark:text-teal-300">{r.filled}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-500">
                  {r.opened ? Math.round((r.filled / r.opened) * 100) : 0}%
                </td>
                {priorLabel && (
                  <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-500">
                    {r.prior === null || r.prior === undefined ? '—' : r.opened - r.prior > 0 ? `+${r.opened - r.prior}` : r.opened - r.prior}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="w-36 shrink-0 truncate text-[12px] text-zinc-700 dark:text-zinc-300" title={r.label}>
            {r.label}{r.partial && <span className="ml-1 text-[10px] text-zinc-500 dark:text-zinc-600">so far</span>}
          </span>
          {/* Bullet chart, not a stack. filled ⊂ put forward ⊂ opened, so drawing them as three
              adjacent segments implied three separate populations. The bar is the jobs opened; the
              solid fill inside it is the ones filled; the tick marks how far "put forward" got. */}
          <span className={cn('relative h-6 grow rounded', CHART.track)}>
            <span className={cn('absolute inset-y-0 left-0 rounded',
              r.partial ? 'bg-cyan-500/30 dark:bg-cyan-400/20' : 'bg-cyan-500/45 dark:bg-cyan-400/30')}
                  style={{ width: `${Math.max((r.opened / max) * 100, 0.8)}%` }} />
            <span className={cn('absolute inset-y-1 left-0 rounded-sm', CHART.good)}
                  style={{ width: `${(r.filled / max) * 100}%` }} />
            {r.submitted > 0 && (
              <span className="absolute inset-y-0 w-[2px] rounded-full bg-zinc-700/70 dark:bg-zinc-200/70"
                    style={{ left: `${(r.submitted / max) * 100}%` }}
                    title={`${r.submitted} had someone put forward`} />
            )}
          </span>
          <span className="w-44 shrink-0 text-right text-[11px] tabular-nums text-zinc-500">
            <span className="text-zinc-800 dark:text-zinc-200">{r.opened}</span> opened ·{' '}
            <span className="text-zinc-700 dark:text-zinc-300">{r.submitted}</span> forward ·{' '}
            <span className="text-teal-700 dark:text-teal-300">{r.filled}</span> filled
          </span>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[10px] text-zinc-500">
        <Key tone="bg-cyan-500/45 dark:bg-cyan-400/30" label="jobs opened" />
        <Key tone={CHART.good} label="of those, filled" />
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-[2px] rounded-full bg-zinc-700/70 dark:bg-zinc-200/70" /> someone put forward
        </span>
      </div>
    </div>
  )
}

function Durations({ data, table }: { data: JobEffectiveness; table: boolean }) {
  const max = Math.max(...data.durations.map(d => d.jobs), 1)
  return (
    <div>
      <p className="mb-3 max-w-3xl text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        How long a job stays open, and what share of each group we filled. Jobs closing in under a
        day are shown separately — several were never really available to fill, and folding them in
        flatters the rate.
      </p>
      <div className="space-y-2">
        {data.durations.map(d => {
          const rate = d.jobs ? Math.round((d.filled / d.jobs) * 100) : 0
          return (
            <div key={d.label} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-[12px] text-zinc-700 dark:text-zinc-300">{d.label}</span>
              <span className={cn('relative h-6 grow rounded', CHART.track)}>
                <span className="absolute inset-y-0 left-0 rounded bg-cyan-500/45 dark:bg-cyan-400/30"
                      style={{ width: `${Math.max((d.jobs / max) * 100, 0.8)}%` }} />
                <span className={cn('absolute inset-y-1 left-0 rounded-sm', CHART.good)}
                      style={{ width: `${(d.filled / max) * 100}%` }} />
              </span>
              <span className="w-16 shrink-0 text-right text-[12px] tabular-nums text-zinc-800 dark:text-zinc-200">{d.jobs}</span>
              <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-zinc-500 dark:text-zinc-600">{d.pct}%</span>
              <span className={cn('w-24 shrink-0 text-right text-[12px] font-semibold tabular-nums',
                rate >= 30 ? 'text-teal-700 dark:text-teal-300' : 'text-zinc-600 dark:text-zinc-400')}>
                {rate}% filled
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Demand by specific location. State is often too big a unit — a handful of practices in one town
 * can be most of a state's demand, and whether we have EVER placed there changes how hard the next
 * role will be.
 */
function CityView({ data }: { data: JobEffectiveness }) {
  const rows = data.byCity
  const never = rows.filter(r => r.everPlaced === 0)
  return (
    <div>
      <p className="mb-3 max-w-3xl text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        The locations generating the most roles in the last 12 months.
        {never.length > 0 && (
          <span className="text-orange-700 dark:text-orange-300">
            {' '}{never.length} of the top {rows.length} are places we have never placed anyone.
          </span>
        )}
      </p>
      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-[12px]">
          <thead className="bg-zinc-50 dark:bg-zinc-900/60">
            <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="py-2 pr-3 text-right font-medium">Opened, 12 mo</th>
              <th className="py-2 pr-3 text-right font-medium">Filled</th>
              <th className="py-2 pr-3 text-right font-medium">Ever placed here</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.name} className="border-t border-zinc-200 dark:border-zinc-800/70">
                <td className="px-3 py-1.5 text-zinc-800 dark:text-zinc-200">{r.name}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-800 dark:text-zinc-200">{r.opened}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-teal-700 dark:text-teal-300">{r.filled}</td>
                <td className={cn('py-1.5 pr-3 text-right tabular-nums',
                  r.everPlaced > 0 ? 'text-zinc-600 dark:text-zinc-400' : 'font-medium text-orange-700 dark:text-orange-300')}>
                  {r.everPlaced > 0 ? r.everPlaced : 'never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function OpenAges({ data }: { data: JobEffectiveness }) {
  const max = Math.max(...data.openAges.map(a => a.jobs), 1)
  const stale = data.openAges.filter(a => a.label === 'Over 3 months').reduce((s, a) => s + a.jobs, 0)
  return (
    <div>
      <p className="mb-3 max-w-3xl text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        How long the {data.openNow} currently open jobs have been waiting.{' '}
        <span className="text-orange-700 dark:text-orange-300">{stale} have been open over three months</span> — the
        clients most likely to be losing patience.
      </p>
      <div className="space-y-2">
        {data.openAges.map(a => (
          <div key={a.label} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-[12px] text-zinc-700 dark:text-zinc-300">{a.label}</span>
            <span className={cn('relative h-6 grow rounded', CHART.track)}>
              <span className={cn('absolute inset-y-0 left-0 rounded',
                a.label === 'Over 3 months' ? CHART.warn : CHART.primary)}
                    style={{ width: `${Math.max((a.jobs / max) * 100, 1)}%` }} />
            </span>
            <span className="w-16 shrink-0 text-right text-[13px] font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
              {a.jobs}
            </span>
          </div>
        ))}
      </div>

      {/* Where and what the open roles are — with how many in each group have gone stale. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {[
          { title: 'Open roles by state', rows: data.openByState },
          { title: 'Open roles by type', rows: data.openByType },
        ].map(g => (
          <div key={g.title}>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-600">{g.title}</p>
            <div className="space-y-1">
              {g.rows.map(r => (
                <div key={r.name} className="flex items-baseline gap-3 text-[12px]">
                  <span className="w-40 shrink-0 truncate text-zinc-700 dark:text-zinc-300" title={r.name}>{r.name}</span>
                  <span className="grow border-b border-dotted border-zinc-200 dark:border-zinc-800" />
                  <span className="shrink-0 tabular-nums text-zinc-800 dark:text-zinc-200">{r.jobs}</span>
                  <span className={cn('w-24 shrink-0 text-right text-[11px] tabular-nums',
                    r.stale > 0 ? 'text-orange-700 dark:text-orange-300' : 'text-zinc-500 dark:text-zinc-600')}>
                    {r.stale > 0 ? `${r.stale} stale` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-600">Stale = open for more than three months.</p>
    </div>
  )
}

function Key({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-2.5 w-3 rounded-sm', tone)} /> {label}
    </span>
  )
}

function Stat({ value, label, detail, tone }: { value: string; label: string; detail: string; tone: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 dark:shadow-none px-4 py-3">
      <p className={cn('text-[24px] leading-none font-semibold tabular-nums', tone)}>{value}</p>
      <p className="mt-1.5 text-[12px] leading-tight text-zinc-700 dark:text-zinc-300">{label}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-zinc-500 dark:text-zinc-600">{detail}</p>
    </div>
  )
}
