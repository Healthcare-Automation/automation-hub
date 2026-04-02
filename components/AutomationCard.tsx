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

const PHASE_STYLES = {
  testing: {
    bar: 'bg-amber-500/20 border-amber-500/30',
    text: 'text-amber-400',
    dot: 'bg-amber-500',
    ping: 'bg-amber-400',
    label: 'Testing',
  },
  production: {
    bar: 'bg-emerald-500/20 border-emerald-500/30',
    text: 'text-emerald-400',
    dot: 'bg-emerald-500',
    ping: 'bg-emerald-400',
    label: 'Production',
  },
}

function PhaseTimeline({ dailyStatus, phases }: { dailyStatus: DayStatus[]; phases: Phase[] }) {
  if (!phases.length || !dailyStatus.length) return null

  const windowStart = new Date(dailyStatus[0].day + 'T00:00:00Z').getTime()
  const windowEnd = new Date(dailyStatus[dailyStatus.length - 1].day + 'T00:00:00Z').getTime()
  const windowMs = windowEnd - windowStart || 1

  return (
    <div className="mt-3 space-y-2.5">
      <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">
        Phase
      </p>

      {phases.map((phase, i) => {
        const phaseStart = new Date(phase.startDate + 'T00:00:00Z').getTime()
        const phaseEnd = phase.endDate
          ? new Date(phase.endDate + 'T00:00:00Z').getTime()
          : windowEnd

        const leftPct = Math.max(0, ((phaseStart - windowStart) / windowMs) * 100)
        const rightEdgePct = Math.min(100, ((phaseEnd - windowStart) / windowMs) * 100)
        const widthPct = Math.max(0, rightEdgePct - leftPct)
        const isOngoing = !phase.endDate

        const s = PHASE_STYLES[phase.kind]

        return (
          <div key={i} className="space-y-1.5">
            {/* Visual track — full width background with colored fill */}
            <div className="relative h-2 w-full bg-zinc-700/50 rounded-full overflow-hidden">
              <div
                className={cn('absolute top-0 h-full rounded-full', s.dot)}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              />
            </div>

            {/* Label row — always full width, never clipped */}
            <div className="flex items-center gap-2 flex-wrap">
              {isOngoing && (
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', s.ping)} />
                  <span className={cn('relative inline-flex rounded-full h-1.5 w-1.5', s.dot)} />
                </span>
              )}
              <span className={cn('text-[10px] font-semibold', s.text)}>
                {s.label}
              </span>
              <span className="text-[10px] text-zinc-500">
                since {formatShortDate(phase.startDate)}
              </span>
              {isOngoing && (
                <span className="text-[10px] text-zinc-500">· Ongoing</span>
              )}
            </div>
          </div>
        )
      })}
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
