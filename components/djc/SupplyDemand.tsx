'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { SupplyDemand as SupplyDemandData } from '@/lib/djcStory'

/**
 * Supply versus demand: is the work arriving getting staffed?
 *
 * Layout note that matters — every label sits in its OWN fixed column, never floating on top of a
 * bar. The previous version positioned the "of N arrived" caption at the bar's right edge, so on a
 * short bar it landed on the "N filled" caption and the two overlapped into nonsense.
 *
 * Headline uses absolute counts, not a growth percentage. Comparing July's 158 jobs to February's 5
 * produced "up 3060%", which is arithmetically true and completely useless.
 */
const monthLabel = (m: string) =>
  new Date(m + '-02').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

export default function SupplyDemand({ data }: { data: SupplyDemandData }) {
  const [by, setBy] = useState<'time' | 'specialty'>('time')

  const months = data.months.slice(-12)
  const last = months[months.length - 1]
  const recent = months.slice(-5, -2)   // settled, and recent enough to describe the business today
  const recentOpened = recent.reduce((a, m) => a + m.opened, 0)
  const recentFilled = recent.reduce((a, m) => a + m.filled, 0)
  const recentRate = recentOpened ? Math.round((recentFilled / recentOpened) * 100) : 0
  const allTimeRate = data.allTimeJobs ? Math.round((data.allTimeFilled / data.allTimeJobs) * 100) : 0

  return (
    <div>
      {/* All time · open now · candidates — the stock picture, before the flow. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat value={data.allTimeJobs.toLocaleString()} label="jobs all time"
              detail={`${data.allTimeFilled.toLocaleString()} filled · ${allTimeRate}%`} tone="text-zinc-800 dark:text-zinc-200" />
        <Stat value={data.openNow.toLocaleString()} label="open right now"
              detail={`${data.openUnfilled} still need somebody`} tone="text-cyan-700 dark:text-cyan-300" />
        <Stat value={data.activeCandidates.toLocaleString()} label="active candidates"
              detail="on the market, never placed" tone="text-emerald-700 dark:text-emerald-300" />
      </div>

      <p className="mt-5 text-[14px] leading-relaxed text-zinc-700 dark:text-zinc-300">
        {last && (
          <>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{last.opened} jobs</span> arrived in{' '}
            {monthLabel(last.month)}, against {months[0]?.opened ?? 0} in {monthLabel(months[0]?.month ?? '')}.
            {' '}We fill about{' '}
            <span className="font-semibold text-amber-700 dark:text-amber-300">{recentRate}%</span> of what comes in.
          </>
        )}
      </p>

      <div className="mt-5 mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-600">
          Jobs arriving vs jobs filled
        </p>
        <span className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700/60 bg-zinc-100 dark:bg-zinc-800/40 p-0.5">
          {(['time', 'specialty'] as const).map(k => (
            <button key={k} onClick={() => setBy(k)}
                    className={cn('rounded-md px-3 py-1 text-[11px] font-medium transition-colors',
                      by === k
                        ? 'bg-white text-zinc-900 shadow-sm dark:bg-white/10 dark:text-zinc-100 dark:shadow-none'
                        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300')}>
              {k === 'time' ? 'Over time' : 'By specialty'}
            </button>
          ))}
        </span>
      </div>

      {by === 'time' ? <TimeView months={months} /> : <SpecialtyView data={data} />}

      <p className="mt-5 border-t border-zinc-200 dark:border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-500">
        A job counts as filled once somebody has been placed into it. The two most recent months are
        faded — jobs opened weeks ago may still be filled, so those rates are a floor, and the
        headline above leaves them out.
      </p>
    </div>
  )
}

/* ── Over time ───────────────────────────────────────────────────────────── */

function TimeView({ months }: { months: SupplyDemandData['months'] }) {
  const max = Math.max(...months.map(m => m.opened), 1)
  const settling = new Set(months.slice(-2).map(m => m.month))

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-3 text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-600">
        <span className="w-12 shrink-0">Month</span>
        <span className="grow">Jobs arriving, and how many we filled</span>
        <span className="w-28 shrink-0 text-right">Filled</span>
        <span className="w-16 shrink-0 text-right">Rate</span>
      </div>
      <div className="space-y-1.5">
        {months.map(m => {
          const rate = m.opened ? Math.round((m.filled / m.opened) * 100) : 0
          const wip = settling.has(m.month)
          return (
            <div key={m.month} className={cn('flex items-center gap-3', wip && 'opacity-70')}>
              <span className="w-12 shrink-0 text-[12px] text-zinc-600 dark:text-zinc-400">{monthLabel(m.month)}</span>
              {/* Grey track = jobs that arrived. Green = filled. No text inside the bar at all. */}
              <span className="relative h-5 grow rounded bg-zinc-200/70 dark:bg-zinc-800/40">
                <span className="absolute inset-y-0 left-0 rounded bg-zinc-400 dark:bg-zinc-700"
                      style={{ width: `${Math.max((m.opened / max) * 100, 0.8)}%` }} />
                <span className="absolute inset-y-0 left-0 rounded bg-emerald-500/80"
                      style={{ width: `${Math.max((m.filled / max) * 100, m.filled ? 0.8 : 0)}%` }} />
              </span>
              <span className="w-28 shrink-0 text-right text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400">
                <span className="text-emerald-700 dark:text-emerald-300">{m.filled}</span> of {m.opened}
              </span>
              <span className={cn('w-16 shrink-0 text-right text-[12px] font-semibold tabular-nums',
                rate >= 30 ? 'text-emerald-700 dark:text-emerald-300' : rate > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-500 dark:text-zinc-600')}>
                {rate}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── By specialty ────────────────────────────────────────────────────────── */

function SpecialtyView({ data }: { data: SupplyDemandData }) {
  const rows = data.specialties.filter(s => s.opened > 0)
  const max = Math.max(...rows.map(s => s.opened), 1)
  const failing = rows.filter(s => s.opened >= 5 && s.filled === 0)

  return (
    <div>
      {failing.length > 0 && (
        <p className="mb-3 rounded-md border border-red-500/25 bg-red-500/[0.07] px-3 py-2 text-[12px] leading-relaxed text-red-800 dark:text-red-100">
          {failing.map(s => `${s.specialty}: ${s.opened} jobs, none filled`).join(' · ')} — while we
          hold {failing.reduce((a, s) => a + s.candidates, 0).toLocaleString()} active candidates in
          those fields.
        </p>
      )}
      <div className="mb-1.5 flex items-center gap-3 text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-600">
        <span className="w-40 shrink-0">Specialty</span>
        <span className="grow">Jobs arriving, and how many we filled</span>
        <span className="w-24 shrink-0 text-right">Filled</span>
        <span className="w-14 shrink-0 text-right">Rate</span>
        <span className="w-24 shrink-0 text-right">Candidates</span>
      </div>
      <div className="space-y-1.5">
        {rows.map(s => {
          const rate = s.opened ? Math.round((s.filled / s.opened) * 100) : 0
          return (
            <div key={s.specialty} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-[12px] text-zinc-700 dark:text-zinc-300" title={s.specialty}>
                {s.specialty}
              </span>
              <span className="relative h-5 grow rounded bg-zinc-200/70 dark:bg-zinc-800/40">
                <span className="absolute inset-y-0 left-0 rounded bg-zinc-400 dark:bg-zinc-700"
                      style={{ width: `${Math.max((s.opened / max) * 100, 0.8)}%` }} />
                <span className="absolute inset-y-0 left-0 rounded bg-emerald-500/80"
                      style={{ width: `${Math.max((s.filled / max) * 100, s.filled ? 0.8 : 0)}%` }} />
              </span>
              <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400">
                <span className={s.filled ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'}>{s.filled}</span> of {s.opened}
              </span>
              <span className={cn('w-14 shrink-0 text-right text-[12px] font-semibold tabular-nums',
                rate >= 30 ? 'text-emerald-700 dark:text-emerald-300' : rate > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-red-600 dark:text-red-400')}>
                {rate}%
              </span>
              <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-zinc-500 dark:text-zinc-600">
                {s.candidates.toLocaleString()}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ value, label, detail, tone }: { value: string; label: string; detail: string; tone: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 px-4 py-3">
      <p className={cn('text-[26px] leading-none font-semibold tabular-nums', tone)}>{value}</p>
      <p className="mt-1.5 text-[12px] text-zinc-700 dark:text-zinc-300">{label}</p>
      <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-600">{detail}</p>
    </div>
  )
}
