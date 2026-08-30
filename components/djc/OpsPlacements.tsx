'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { OpsPlacements as Ops } from '@/lib/djcStory'
import { CHART, CHART_HOVER, CHART_TEXT } from '@/lib/chartTokens'

/**
 * Placements across the whole business — every source, every client.
 *
 * Replaces a DJC-only chart. Year-on-year sits under every bar rather than in a hover, because it
 * is the number people actually read; colour carries the direction so a row can be judged without
 * doing arithmetic.
 *
 * No goal line: Proxi has not set 2026 targets yet. When they exist, the hit/miss marker goes on
 * the quarterly view.
 */
type View = 'monthly' | 'quarterly' | 'state' | 'client'

const VIEWS: { key: View; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'state', label: 'By state' },
  { key: 'client', label: 'By client' },
]

const monthLabel = (m: string) =>
  new Date(m + '-02').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

/** Green up, red down, grey flat or unknown — the rule the feedback asked for. */
function deltaTone(now: number, prior: number | null) {
  if (prior === null || prior === 0) return CHART_TEXT.neutral
  if (now > prior) return CHART_TEXT.good
  if (now < prior) return CHART_TEXT.warn
  return CHART_TEXT.neutral
}
function deltaText(now: number, prior: number | null) {
  if (prior === null) return '—'
  const d = now - prior
  const pct = prior ? Math.round((d / prior) * 100) : null
  return `${d > 0 ? '+' : ''}${d}${pct !== null ? ` (${d > 0 ? '+' : ''}${pct}%)` : ''}`
}

export default function OpsPlacements({
  ops, onMonthClick,
}: {
  ops: Ops
  onMonthClick?: (month: string) => void
}) {
  const [view, setView] = useState<View>('monthly')
  const ytdDelta = ops.ytd - ops.ytdPriorYear
  const ytdPct = ops.ytdPriorYear ? Math.round((ytdDelta / ops.ytdPriorYear) * 100) : null

  return (
    <div>
      {/* YTD metrics — average per month, and the same span last year. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={ops.avgPerMonth.toFixed(1)} label="placements a month" detail="2026 so far" tone="text-cyan-700 dark:text-cyan-300" />
        <Stat value={ops.avgPerMonthPriorYear.toFixed(1)} label="a month last year"
              detail="same months of 2025" tone="text-zinc-700 dark:text-zinc-300" />
        <Stat value={ops.ytd.toLocaleString()} label="placed year to date" detail={`through ${ops.monthsElapsed} months`} tone="text-zinc-900 dark:text-zinc-100" />
        <Stat value={`${ytdPct !== null && ytdPct > 0 ? '+' : ''}${ytdPct ?? '—'}%`}
              label="vs the same span last year"
              detail={`${ops.ytdPriorYear.toLocaleString()} by this point in 2025`}
              tone={deltaTone(ops.ytd, ops.ytdPriorYear)} />
      </div>

      <div className="mt-5 mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-600">
          {view === 'monthly' ? 'Placements per month, with the same month last year'
            : view === 'quarterly' ? 'Every quarter, against the same quarter a year earlier'
            : view === 'state' ? 'Where people were placed this year' : 'Which clients they went to'}
        </p>
        <span className="inline-flex rounded-lg border border-zinc-200 bg-zinc-900/[0.04] dark:border-zinc-700/60 dark:bg-zinc-800/40 p-0.5">
          {VIEWS.map(v => (
            <button key={v.key} onClick={() => setView(v.key)}
                    className={cn('rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                      view === v.key
                        ? 'bg-white text-zinc-900 shadow-sm dark:bg-white/10 dark:text-zinc-100 dark:shadow-none'
                        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300')}>
              {v.label}
            </button>
          ))}
        </span>
      </div>

      {view === 'monthly' && (
        <Bars rows={ops.monthly.slice(-12).map((m, i, arr) => ({
                label: monthLabel(m.month), now: m.placed, prior: m.priorYear, key: m.month,
                partial: i === arr.length - 1 }))}
              priorLabel="last year" onClick={onMonthClick} />
      )}

      {view === 'quarterly' && <Bars rows={ops.quarters.map((q, i, arr) => ({
        label: q.label, now: q.placed, prior: q.priorYear,
        partial: i === arr.length - 1 }))} priorLabel="year before" />}

      {view === 'state' && <Table rows={ops.byState} unit="state" />}
      {view === 'client' && <Table rows={ops.byClient} unit="client" />}

      <p className="mt-5 border-t border-zinc-200 dark:border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-500">
        Every placement Proxi made, from any candidate source — not just the automation. Year-on-year
        comparisons align on the same day of the year, so a part-year is never set against a whole
        one. No goal line yet; when 2026 targets exist they will show here as hit or miss.
      </p>
    </div>
  )
}

/**
 * A wide bar for this period beside a slim one for the same period a year earlier.
 *
 * A marker line across the column was tried and abandoned: it rendered full-column width, so on
 * quarters where last year exceeded this year the line floated above the bar and read as a broken
 * element rather than a reference.
 *
 * The width difference does the work — the wide bar is plainly the subject, the slim one plainly
 * the reference — so neither needs a legend to be understood.
 */
function Bars({
  rows, priorLabel, onClick,
}: {
  rows: { label: string; now: number; prior: number | null; key?: string; partial?: boolean }[]
  priorLabel: string
  onClick?: (key: string) => void
}) {
  // Headroom for the floating value labels: the tallest bar reaches ~82% of the plot, leaving
  // room for its number to sit above it without escaping the chart.
  const max = Math.max(...rows.flatMap(r => [r.now, r.prior ?? 0]), 1) * 1.22
  const H = 132

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-full items-stretch gap-2.5">
        {rows.map(r => {
          const up = r.prior !== null && r.now > r.prior
          const down = r.prior !== null && r.now < r.prior
          const delta = r.prior === null ? null : r.now - r.prior
          const pct = r.prior ? Math.round(((r.now - r.prior) / r.prior) * 100) : null
          const clickable = Boolean(r.key && onClick)
          return (
            <div
              key={r.label}
              onClick={() => r.key && onClick?.(r.key)}
              className={cn('group flex min-w-[52px] flex-1 flex-col items-center justify-end',
                clickable && 'cursor-pointer')}
              title={(r.partial ? 'Still in progress. ' : '')
                + (r.prior !== null
                  ? `${r.now} so far · ${r.prior} ${priorLabel}`
                  : `${r.now} so far`)}
            >
              {/* Both bars share one baseline; heights are directly comparable.
                  Colours come from lib/chartTokens so every chart in the app draws from one
                  palette. Flat fills only — a gradient implies a second dimension the data has
                  not got. */}
              <div className="flex w-full items-end justify-center gap-1" style={{ height: H }}>
                {/* The value rides on the bar rather than sitting in a fixed row, so it reads as
                    belonging to that column even when the bars are short. */}
                <div className="relative w-[62%]"
                     style={{ height: Math.max((r.now / max) * H, 2) }}>
                  <span className="absolute -top-[18px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[12px] font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {r.now}
                  </span>
                <div
                  className={cn('h-full w-full rounded-t-[3px] transition-colors',
                    // A partial period is drawn hollow: the value is real but not final, and a solid
                    // bar next to eleven finished ones invites a comparison that is not yet fair.
                    r.partial && 'border border-dashed !bg-transparent',
                    r.partial ? (up ? 'border-teal-300/60' : down ? 'border-orange-300/60' : 'border-slate-400/50')
                              : up ? CHART.good : down ? CHART.warn : CHART.neutral,
                    clickable && (up ? CHART_HOVER.good : down ? CHART_HOVER.warn : CHART_HOVER.neutral))}
                />
                </div>
                {r.prior !== null && (
                  <div className={cn('w-[22%] rounded-t-[3px] transition-colors', CHART.reference, CHART_HOVER.reference)}
                       style={{ height: Math.max((r.prior / max) * H, 2) }}
                       title={`${r.prior} ${priorLabel}`} />
                )}
              </div>
              <div className="h-px w-full bg-zinc-300 dark:bg-zinc-700/70" />

              <span className="mt-2 whitespace-nowrap text-[11px] text-zinc-500">{r.label}</span>

              {/* Rendered even when there is nothing to compare, so every column keeps the same
                  height and the baselines line up across the whole chart. */}
              <span className={cn(
                'mt-1 inline-flex h-4 items-center gap-0.5 text-[10px] font-medium tabular-nums',
                delta === null ? 'text-zinc-400 dark:text-zinc-700'
                  : up ? CHART_TEXT.good : down ? CHART_TEXT.warn : CHART_TEXT.neutral,
              )}>
                {delta === null ? '—' : (
                  <>
                    {up ? '▲' : down ? '▼' : '–'}
                    {Math.abs(delta)}
                    {pct !== null && pct !== 0 && <span className="opacity-60">{Math.abs(pct)}%</span>}
                  </>
                )}
              </span>
            </div>
          )
        })}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-zinc-500 dark:text-zinc-600">
        <span className="flex items-center gap-1.5">
          <span className={cn('inline-block h-2.5 w-3 rounded-sm', CHART.good)} /> beat {priorLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn('inline-block h-2.5 w-3 rounded-sm', CHART.warn)} /> fell short
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn('inline-block h-2.5 w-3 rounded-sm', CHART.neutral)} /> nothing to compare
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn('inline-block h-2.5 w-1.5 rounded-sm', CHART.reference)} /> {priorLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3 rounded-sm border border-dashed border-zinc-400 dark:border-zinc-500" />
          still in progress
        </span>
      </p>
    </div>
  )
}

function Table({ rows, unit }: { rows: { name: string; placed: number; priorYear: number }[]; unit: string }) {
  const max = Math.max(...rows.map(r => r.placed), 1)
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-[12px]">
        <thead className="bg-zinc-50 dark:bg-zinc-900/60">
          <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
            <th className="px-3 py-2 font-medium capitalize">{unit}</th>
            <th className="py-2 font-medium">This year</th>
            <th className="w-28 py-2 pr-3 text-right font-medium">Placed</th>
            <th className="w-28 py-2 pr-3 text-right font-medium">vs last year</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.name} className="border-t border-zinc-200 dark:border-zinc-800/70">
              <td className="max-w-56 truncate px-3 py-1.5 text-zinc-800 dark:text-zinc-200" title={r.name}>{r.name}</td>
              <td className="py-1.5 pr-3">
                <span className={cn('block h-2 rounded-full', CHART.primary)}
                      style={{ width: `${Math.max((r.placed / max) * 100, 2)}%` }} />
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-800 dark:text-zinc-200">{r.placed}</td>
              <td className={cn('py-1.5 pr-3 text-right tabular-nums', deltaTone(r.placed, r.priorYear))}>
                {deltaText(r.placed, r.priorYear)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Stat({ value, label, detail, tone }: { value: string; label: string; detail: string; tone: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 dark:shadow-none px-4 py-3">
      <p className={cn('text-[26px] leading-none font-semibold tabular-nums', tone)}>{value}</p>
      <p className="mt-1.5 text-[12px] text-zinc-700 dark:text-zinc-300">{label}</p>
      <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-600">{detail}</p>
    </div>
  )
}
