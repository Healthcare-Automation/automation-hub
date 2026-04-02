'use client'

import { formatRelativeTime, formatShortDate } from '@/lib/utils'
import type { OverallStatus, RunDetail, Phase } from '@/lib/types'

const CONFIG = {
  operational: {
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    divider: 'border-emerald-500/10',
    text: 'text-emerald-400',
    dot: 'bg-emerald-500',
    ping: 'bg-emerald-400',
  },
  degraded: {
    bg: 'bg-amber-500/10 border-amber-500/20',
    divider: 'border-amber-500/10',
    text: 'text-amber-400',
    dot: 'bg-amber-500',
    ping: 'bg-amber-400',
  },
  outage: {
    bg: 'bg-red-500/10 border-red-500/20',
    divider: 'border-red-500/10',
    text: 'text-red-400',
    dot: 'bg-red-500',
    ping: 'bg-red-400',
  },
}

interface Props {
  overallStatus: OverallStatus
  lastRun: RunDetail | null
  phases?: Phase[]
}

export default function StatusHeader({ overallStatus, lastRun, phases = [] }: Props) {
  const c = CONFIG[overallStatus.kind]
  const activePhase = phases.find(p => !p.endDate)

  return (
    <div className={`${c.bg} border rounded-xl overflow-hidden`}>
      {/* Status row */}
      <div className="px-5 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${c.ping} opacity-75`} />
            <span className={`relative inline-flex rounded-full h-3 w-3 ${c.dot}`} />
          </span>
          <div>
            <p className={`font-semibold text-base ${c.text}`}>{overallStatus.label}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{overallStatus.description}</p>
          </div>
        </div>

        {lastRun && (
          <p className="text-xs text-zinc-500 shrink-0">
            Last run <span className="text-zinc-400">{formatRelativeTime(lastRun.startedAt)}</span>
          </p>
        )}
      </div>

      {/* Phase row */}
      {activePhase && (
        <div className={`border-t ${c.divider} px-5 py-2.5 flex items-center gap-2`}>
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
          </span>
          <span className="text-amber-400 text-xs font-semibold">{activePhase.label} Phase</span>
          <span className="text-zinc-500 text-xs">
            · since {formatShortDate(activePhase.startDate)} · Ongoing
          </span>
        </div>
      )}
    </div>
  )
}
