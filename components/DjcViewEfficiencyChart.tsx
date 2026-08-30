'use client'

import { useEffect, useRef, useState } from 'react'
import type { DjcViewEfficiencyDay } from '@/lib/djcTypes'

/**
 * Daily Profile View efficiency: how much we spent, and what share of it converted.
 *
 * Bars carry the volume (views spent) so a 100% day off two views is visibly not the same as a 100%
 * day off thirty. The line carries the rate, which is the number actually being judged. Reading the
 * rate off two stacked bars — the previous design — meant doing arithmetic by eye on bars a couple
 * of pixels tall.
 *
 * A view counts only when a profile was actually opened. Candidates settled by the free checks cost
 * nothing, and quota-blocked ones were never opened at all.
 */
export default function DjcViewEfficiencyChart({
  days, weekly = false,
}: { days: DjcViewEfficiencyDay[] | null; weekly?: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  // Columns are sized to fill the card when there is room, and only scroll once they would be too
  // narrow to read. A fixed column width left a wide card two-thirds empty.
  const [avail, setAvail] = useState(0)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => setAvail(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Land on the most recent bucket. The newest period is the one being judged, and it was the one
  // scrolled off-screen by default.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [days?.length, weekly])

  // A failed query used to fall through to the same empty state as "nothing happened", which is
  // how a broken chart spent an afternoon looking like a quiet week.
  if (days === null) {
    return (
      <p className="text-xs text-amber-700 dark:text-amber-300/80">
        Couldn&rsquo;t load this chart — the database was busy. Refresh in a few seconds.
      </p>
    )
  }
  const active = days.filter(d => d.views > 0 || d.created > 0)
  if (!active.length) {
    return <p className="text-xs text-zinc-500 dark:text-zinc-600">No Profile View activity in this window.</p>
  }

  const maxViews = Math.max(...active.map(d => d.views), 1)
  const totalViews = active.reduce((a, d) => a + d.views, 0)
  const totalCreated = active.reduce((a, d) => a + d.created, 0)
  const overall = totalViews ? Math.round((totalCreated / totalViews) * 100) : 0
  // Latest period vs everything before it — the "are we improving" answer, which previously lived
  // in a second, near-identical card.
  const latest = active[active.length - 1]
  const prior = active.slice(0, -1)
  const priorViews = prior.reduce((a, d) => a + d.views, 0)
  const priorMade = prior.reduce((a, d) => a + d.created, 0)
  const priorRate = priorViews ? Math.round((priorMade / priorViews) * 100) : 0
  const latestRate = latest.views ? Math.round((latest.created / latest.views) * 100) : 0
  const delta = prior.length && priorViews ? latestRate - priorRate : null

  const rate = (d: DjcViewEfficiencyDay) => (d.views > 0 ? Math.round((d.created / d.views) * 100) : 0)
  const label = (iso: string) => {
    const d = new Date(iso + 'T00:00:00Z')
    const s = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    return weekly ? `w/c ${s}` : s
  }

  // PAD_T leaves headroom so a 100% day is not drawn flush against the top edge (its marker and
  // label were being clipped). PAD_L is the gutter for the axis labels; PAD_R stops the final
  // column's marker and date from running off the right edge.
  const PAD_T = 22
  const PAD_B = 26
  const PAD_L = 30
  const PAD_R = 14
  const MIN_COL = weekly ? 62 : 34
  const COL = avail > 0 ? Math.max(MIN_COL, Math.floor((avail - PAD_R) / active.length)) : (weekly ? 74 : 46)
  const PLOT_H = 118
  const H = PAD_T + PLOT_H + PAD_B
  const width = active.length * COL + PAD_R
  const cx = (i: number) => i * COL + COL / 2
  const y = (pct: number) => PAD_T + PLOT_H - (pct / 100) * PLOT_H
  const linePoints = active.map((d, i) => `${cx(i)},${y(rate(d))}`).join(' ')
  const shown = hover !== null ? active[hover] : null
  // Label every point when there is room, otherwise every other one, so they never collide.
  const labelEvery = !weekly && active.length > 16 ? 2 : 1

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-[30px] leading-none font-semibold tabular-nums text-cyan-700 dark:text-cyan-300">{latestRate}%</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            of paid views became a candidate — {weekly ? 'week of ' : ''}{label(latest.day).replace('w/c ', '')}
          </p>
        </div>
        {delta !== null && (
          <div>
            <p className={'text-[15px] font-semibold tabular-nums ' +
                          (delta > 0 ? 'text-emerald-700 dark:text-emerald-300' : delta < 0 ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-600 dark:text-zinc-400')}>
              {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta)} pts
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">vs {priorRate}% before</p>
          </div>
        )}
        <div>
          <p className="text-[15px] font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">{overall}%</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            all time — {totalCreated.toLocaleString()} from {totalViews.toLocaleString()} views
          </p>
        </div>
      </div>

      {/* Fixed-height slot so the tooltip appearing does not shift the chart. */}
      <div className="h-9">
        {shown ? (
          <div className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-md bg-zinc-100 ring-zinc-200 dark:bg-zinc-800/70 dark:ring-zinc-700/60 px-3 py-1.5 ring-1">
            <span className="text-[12px] font-medium text-zinc-800 dark:text-zinc-200">{label(shown.day)}</span>
            <span className="text-[11px] text-amber-700 dark:text-amber-300">{shown.views} view{shown.views === 1 ? '' : 's'} spent</span>
            <span className="text-[11px] text-cyan-700 dark:text-cyan-300">{shown.created} added</span>
            <span className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">{rate(shown)}%</span>
            {shown.freeSkips > 0 && (
              <span className="text-[11px] text-emerald-700 dark:text-emerald-300">{shown.freeSkips} caught free</span>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-zinc-500 dark:text-zinc-600">Hover for the exact numbers.</p>
        )}
      </div>

      {/* The axis lives OUTSIDE the scroller so it stays put; only the plot scrolls. */}
      <div className="flex">
        <svg width={PAD_L} height={H} className="block shrink-0">
          {[0, 25, 50, 75, 100].map(g => (
            <text key={g} x={PAD_L - 6} y={y(g) + 3} textAnchor="end"
                  className="fill-zinc-500 dark:fill-zinc-500 text-[9px] tabular-nums">{g}%</text>
          ))}
        </svg>
        <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto">
        <svg width={width} height={H} className="block">
          {[0, 25, 50, 75, 100].map(g => (
            <line key={g} x1={0} x2={width - PAD_R} y1={y(g)} y2={y(g)} stroke="currentColor"
                  className="text-zinc-300 dark:text-zinc-700/30" strokeDasharray="2 3" />
          ))}

          {active.map((d, i) => {
            const h = Math.max(Math.round((d.views / maxViews) * (PLOT_H - 10)), d.views ? 2 : 0)
            return (
              <rect key={d.day} x={cx(i) - (COL - 18) / 2} y={PAD_T + PLOT_H - h}
                    width={COL - 18} height={h} rx={2}
                    className={hover === i ? 'fill-amber-400/70 dark:fill-amber-400/45' : 'fill-amber-500/30 dark:fill-amber-500/20'} />
            )
          })}

          <polyline points={linePoints} fill="none" strokeWidth={2} strokeLinejoin="round"
                    strokeLinecap="round" className="stroke-cyan-600 dark:stroke-cyan-400/90" />

          {active.map((d, i) => (
            <circle key={d.day} cx={cx(i)} cy={y(rate(d))} r={hover === i ? 4.5 : 2.5}
                    className="fill-cyan-600 dark:fill-cyan-300" />
          ))}

          {/* The percentage printed on the chart, not just on hover. */}
          {active.map((d, i) =>
            (i % labelEvery === 0 || hover === i) ? (
              <text key={`pct-${d.day}`} x={cx(i)} y={y(rate(d)) - 8} textAnchor="middle"
                    className={(hover === i ? 'fill-cyan-800 dark:fill-cyan-200 font-semibold' : 'fill-cyan-600/80 dark:fill-cyan-300/70') +
                               ' text-[9px] tabular-nums'}>
                {rate(d)}%
              </text>
            ) : null,
          )}

          {active.map((d, i) => (
            <text key={`lbl-${d.day}`} x={cx(i)} y={H - 8} textAnchor="middle"
                  className={(hover === i ? 'fill-zinc-800 dark:fill-zinc-300' : 'fill-zinc-500 dark:fill-zinc-600') + ' text-[9px]'}>
              {label(d.day)}
            </text>
          ))}

          {active.map((d, i) => (
            <rect key={`hit-${d.day}`} x={cx(i) - COL / 2} y={0} width={COL} height={H}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          ))}
        </svg>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm bg-amber-500/40 dark:bg-amber-500/25" /> Profile Views spent (volume)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-cyan-600 dark:bg-cyan-400/90" /> share that became a candidate
        </span>
      </div>
    </div>
  )
}
