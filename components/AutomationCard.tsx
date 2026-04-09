'use client'

import { useState } from 'react'
import type { DayStatus, RunDetail, Phase } from '@/lib/types'
import { cn, STATUS_COLORS, STATUS_DOT_COLORS, STATUS_LABELS, getDayStatusKind, formatShortDate } from '@/lib/utils'
import StatusBarChart from './StatusBarChart'
import LayerBreakdown from './LayerBreakdown'

interface Props {
  name: string
  description: string
  schedule: string
  dailyStatus: DayStatus[]
  recentRuns: RunDetail[]
  uptime: string
  phases?: Phase[]
}

function segmentInWindow(
  startMs: number,
  endMs: number,
  windowStart: number,
  windowMs: number,
): { left: number; width: number } {
  const left = Math.max(0, Math.min(100, ((startMs - windowStart) / windowMs) * 100))
  const right = Math.max(0, Math.min(100, ((endMs - windowStart) / windowMs) * 100))
  return { left, width: Math.max(0, right - left) }
}

/** Single track: amber = testing (through last testing day), emerald = production (from go-live). */
function PhaseTimeline({ dailyStatus, phases }: { dailyStatus: DayStatus[]; phases: Phase[] }) {
  if (!phases.length || !dailyStatus.length) return null

  const windowStart = new Date(dailyStatus[0].day + 'T00:00:00Z').getTime()
  const lastDay = dailyStatus[dailyStatus.length - 1].day
  const windowEndExclusive = (() => {
    const d = new Date(lastDay + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 1)
    return d.getTime()
  })()
  const windowMs = windowEndExclusive - windowStart || 1

  const testing = phases.find(p => p.kind === 'testing')
  const production = phases.find(p => p.kind === 'production')

  let testingSeg = { left: 0, width: 0 }
  if (testing) {
    const tStart = new Date(testing.startDate + 'T00:00:00Z').getTime()
    const tEnd = testing.endDate
      ? (() => {
          const d = new Date(testing.endDate + 'T00:00:00Z')
          d.setUTCDate(d.getUTCDate() + 1)
          return d.getTime()
        })()
      : windowEndExclusive
    testingSeg = segmentInWindow(tStart, tEnd, windowStart, windowMs)
  }

  let productionSeg = { left: 0, width: 0 }
  if (production) {
    const pStart = new Date(production.startDate + 'T00:00:00Z').getTime()
    productionSeg = segmentInWindow(pStart, windowEndExclusive, windowStart, windowMs)
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">
        Phase
      </p>

      <div className="relative h-2 w-full bg-zinc-700/50 rounded-full overflow-hidden">
        {testingSeg.width > 0 && (
          <div
            className="absolute top-0 bottom-0 bg-amber-500"
            style={{ left: `${testingSeg.left}%`, width: `${testingSeg.width}%` }}
            title="Testing"
          />
        )}
        {productionSeg.width > 0 && (
          <div
            className="absolute top-0 bottom-0 bg-emerald-500 z-[1]"
            style={{ left: `${productionSeg.left}%`, width: `${productionSeg.width}%` }}
            title="Production"
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-1">
        {testing && (
          <div className="flex items-center gap-2 text-[10px]">
            <span className="h-1.5 w-5 shrink-0 rounded-sm bg-amber-500" aria-hidden />
            <span className="font-semibold text-amber-400">Testing</span>
            <span className="text-zinc-500">
              {testing.endDate
                ? `${formatShortDate(testing.startDate)} – ${formatShortDate(testing.endDate)}`
                : `since ${formatShortDate(testing.startDate)}`}
            </span>
          </div>
        )}
        {production && (
          <div className="flex items-center gap-2 text-[10px]">
            <span className="h-1.5 w-5 shrink-0 rounded-sm bg-emerald-500" aria-hidden />
            <span className="font-semibold text-emerald-400">Production</span>
            <span className="text-zinc-500 inline-flex items-center gap-1.5">
              from {formatShortDate(production.startDate)}
              {!production.endDate && (
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export default function AutomationCard({
  name,
  description,
  schedule,
  dailyStatus,
  recentRuns,
  uptime,
  phases = [],
}: Props) {
  const [expanded, setExpanded] = useState(false)

  const today = dailyStatus[dailyStatus.length - 1]
  const statusKind = today ? today.status : 'no_data'

  const dotColor = STATUS_DOT_COLORS[statusKind] ?? 'bg-zinc-600'
  const textColor = STATUS_COLORS[statusKind] ?? 'text-zinc-500'
  const statusLabel = STATUS_LABELS[statusKind]

  return (
    <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h3 className="font-semibold text-white text-[15px]">{name}</h3>
            <p className="text-xs text-zinc-400 mt-0.5">{description}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            <span className={cn('h-2 w-2 rounded-full', dotColor)} />
            <span className={cn('text-xs font-medium', textColor)}>{statusLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3 mb-4 text-xs text-zinc-500">
          <span>{uptime} uptime (90 days)</span>
          <span>·</span>
          <span>{schedule}</span>
        </div>

        <StatusBarChart days={dailyStatus} />
        <PhaseTimeline dailyStatus={dailyStatus} phases={phases} />
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 border-t border-zinc-700/50 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/30 transition-colors"
      >
        <span>{expanded ? 'Hide run history' : 'View run history'}</span>
        <ChevronDown
          className={cn(
            'transition-transform duration-200',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {/* Expanded layer breakdown */}
      {expanded && (
        <div className="border-t border-zinc-700/50 px-2 py-3">
          <LayerBreakdown runs={recentRuns} />
        </div>
      )}
    </div>
  )
}
