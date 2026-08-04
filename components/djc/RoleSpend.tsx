'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { RoleSpend, EfficiencyWeek } from '@/lib/djcOps'
import { CHART } from '@/lib/chartTokens'

/**
 * What a candidate costs, by discipline — and the weekly pace behind it.
 *
 * Replaces two stacked-bar charts that showed the same volume split twice, each with its own legend
 * and its own role toggle. Stacked bars are also the wrong shape for comparison: only the bottom
 * segment shares a baseline, so every other segment has to be measured by eye against a moving
 * start point.
 *
 * The question this section exists to answer is not "how much of each" but "what does each cost".
 */
// Four disciplines genuinely are four categories, so they keep distinct hues — but drawn from the
// shared palette rather than invented here.
const TONES: Record<string, { bar: string; key: keyof EfficiencyWeek }> = {
  'General dentists': { bar: CHART.primary, key: 'general' },
  Specialists: { bar: CHART.accent, key: 'specialist' },
  Hygienists: { bar: CHART.good, key: 'hygienist' },
  Assistants: { bar: CHART.warn, key: 'assistant' },
}

/** Bar height, and the height of the value label above it — the overlay needs both to line up. */
const PLOT = 96
const LABEL_H = 22

const weekLabel = (w: string) =>
  new Date(w + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function RoleSpendView({
  roles, weeks,
}: {
  roles: RoleSpend[]
  weeks: EfficiencyWeek[]
}) {
  const [focus, setFocus] = useState<string | null>(null)

  const totalViews = roles.reduce((a, r) => a + r.views, 0)
  const byCost = [...roles].sort((a, b) => a.viewsEach - b.viewsEach)
  const cheapest = byCost[0]
  const dearest = byCost[byCost.length - 1]
  const maxViews = Math.max(...roles.map(r => r.views), 1)

  const shownWeeks = weeks.map(w => ({
    week: w.week,
    n: focus ? (w[TONES[focus].key] as number) : w.views,
    created: w.created,
  }))
  const maxWeek = Math.max(...shownWeeks.map(w => w.n), 1)

  return (
    <div>
      {cheapest && dearest && cheapest.role !== dearest.role && (
        <p className="mb-5 max-w-3xl text-[13px] leading-relaxed text-zinc-300">
          <span className="font-semibold text-zinc-100">{dearest.role}</span> take{' '}
          <span className="font-semibold text-orange-300">{dearest.viewsEach} views</span> to produce
          one contact and absorb{' '}
          {Math.round((dearest.views / (totalViews || 1)) * 100)}% of the budget.{' '}
          <span className="font-semibold text-zinc-100">{cheapest.role}</span> cost{' '}
          <span className="font-semibold text-teal-300">{cheapest.viewsEach}</span>.
        </p>
      )}

      {/* One row per role: spend, yield, and the cost of a contact. */}
      <div className="mb-2 flex items-center gap-3 text-[10px] uppercase tracking-wide text-zinc-600">
        <span className="w-36 shrink-0">Role</span>
        <span className="grow">Views spent</span>
        <span className="w-20 shrink-0 text-right">Added</span>
        <span className="w-24 shrink-0 text-right">Views each</span>
        <span className="w-16 shrink-0 text-right">Hit rate</span>
      </div>

      <div className="space-y-1.5">
        {roles.map(r => {
          const on = focus === r.role
          const tone = TONES[r.role] ?? TONES.Specialists
          return (
            <button
              key={r.role}
              onClick={() => setFocus(on ? null : r.role)}
              className={cn('flex w-full items-center gap-3 rounded-md px-1.5 py-1.5 text-left transition-colors',
                on ? 'bg-zinc-800/60 ring-1 ring-zinc-700' : 'hover:bg-zinc-800/30')}
              title={`Show only ${r.role.toLowerCase()} in the weekly pace below`}
            >
              <span className="flex w-36 shrink-0 items-center gap-2 text-[12px] text-zinc-300">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', tone.bar)} />
                <span className="truncate">{r.role}</span>
              </span>
              <span className={cn('relative h-5 grow rounded', CHART.track)}>
                <span className={cn('absolute inset-y-0 left-0 rounded', tone.bar)}
                      style={{ width: `${Math.max((r.views / maxViews) * 100, 1)}%` }} />
                <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-medium tabular-nums text-zinc-950/80">
                  {r.views}
                </span>
              </span>
              <span className="w-20 shrink-0 text-right text-[12px] tabular-nums text-zinc-300">
                {r.added}
              </span>
              {/* The number this section exists for. */}
              <span className={cn('w-24 shrink-0 text-right text-[13px] font-semibold tabular-nums',
                r.viewsEach <= 2.5 ? 'text-teal-300' : r.viewsEach >= 4 ? 'text-orange-300' : 'text-zinc-200')}>
                {r.viewsEach}
              </span>
              <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-zinc-500">
                {r.hitRate}%
              </span>
            </button>
          )
        })}
      </div>

      <p className="mt-2 text-[11px] text-zinc-600">
        &ldquo;Views each&rdquo; is how many Profile Views it took to add one contact. Click a role to
        filter the weekly pace below.
      </p>

      {/* Weekly pace — a single series, because comparing stacked segments week to week is guesswork. */}
      <div className="mt-8">
        <p className="mb-1 text-[11px] uppercase tracking-wide text-zinc-600">
          Views spent each week, and how many landed{focus ? ` · ${focus.toLowerCase()} only` : ''}
        </p>
        <p className="mb-3 text-[11px] text-zinc-500">
          Bars are the views we paid for; the dot is the share that became a Salesforce contact.
        </p>
        {/* The columns carry no horizontal gap so each centre sits at exactly (i+0.5)/n of the
            width — that is what lets the SVG line land on the dots instead of near them. Spacing
            comes from padding inside each column. */}
        <div className="relative">
          <div className="flex items-end overflow-hidden pb-1">
            {shownWeeks.map(w => {
              const rate = w.n ? Math.round((w.created / w.n) * 100) : 0
              return (
                <div key={w.week} className="flex min-w-[40px] flex-1 flex-col items-center px-1"
                     title={`${w.n} views · ${w.created} became candidates · ${rate}%`}>
                  <span className="mb-1.5 text-[11px] font-semibold tabular-nums text-zinc-100">{w.n}</span>
                  <div className="relative w-full" style={{ height: PLOT }}>
                    <div className="absolute inset-x-0 bottom-0 h-px bg-zinc-700/70" />
                    <div className={cn('absolute inset-x-0 bottom-0 rounded-t-[3px] transition-colors',
                      focus ? CHART.neutral : CHART.primary)}
                         style={{ height: Math.max((w.n / maxWeek) * PLOT, 2) }} />
                  </div>
                  <span className="mt-1.5 whitespace-nowrap text-[10px] text-zinc-500">{weekLabel(w.week)}</span>
                </div>
              )
            })}
          </div>

          {/* Conversion as a connected line on its own 0-100% scale, overlaid on the volume bars. */}
          {/* width/height must be set explicitly: an <svg> ignores inset-x-0 for sizing and falls
              back to its 300px intrinsic width, which crushed the whole line into the first column. */}
          <svg className="pointer-events-none absolute inset-x-0" aria-hidden
               width="100%" height={PLOT} style={{ top: LABEL_H }}
               viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline
              points={shownWeeks.map((w, i) => {
                const rate = w.n ? Math.min((w.created / w.n) * 100, 100) : 0
                return `${((i + 0.5) / shownWeeks.length) * 100},${100 - rate}`
              }).join(' ')}
              fill="none" stroke="#c4b5fd" strokeOpacity="0.8" strokeWidth="1.5"
              vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
          {/* Dots sit outside the stretched SVG so they stay round. */}
          <div className="pointer-events-none absolute inset-x-0 flex"
               style={{ top: LABEL_H, height: PLOT }}>
            {shownWeeks.map(w => {
              const rate = w.n ? Math.min((w.created / w.n) * 100, 100) : 0
              return (
                <div key={w.week} className="relative min-w-[40px] flex-1 px-1">
                  <span className="absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-violet-200"
                        style={{ top: `calc(${100 - rate}% - 3px)` }} />
                  {/* Label sits below the point when the line is near the top, so it never runs off
                      the plot or collides with the view count above the bar. */}
                  <span className={cn('absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px]',
                    'font-medium tabular-nums text-violet-200/90')}
                        style={rate > 80
                          ? { top: `calc(${100 - rate}% + 8px)` }
                          : { top: `calc(${100 - rate}% - 18px)` }}>
                    {Math.round(rate)}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-2 flex items-center gap-4 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className={cn('h-2.5 w-3 rounded-sm', CHART.primary)} /> views spent
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-violet-200/70" /> share that became a candidate
          </span>
        </div>
      </div>
    </div>
  )
}
