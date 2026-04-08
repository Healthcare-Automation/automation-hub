'use client'

import { useState } from 'react'
import type { RunDetail, SFErrorDetail } from '@/lib/types'
import { cn, formatRelativeTime, formatDuration } from '@/lib/utils'
import ValidationPopup from './ValidationPopup'

function StatusBadge({
  status,
  sfErrorCount,
}: {
  status: RunDetail['status']
  sfErrorCount: number
}) {
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium whitespace-nowrap">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
        Failed
      </span>
    )
  }
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-medium whitespace-nowrap">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
        </span>
        Running
      </span>
    )
  }
  // completed — check for SF errors
  if (sfErrorCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-medium whitespace-nowrap">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        Warning
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium whitespace-nowrap">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      Successful
    </span>
  )
}

const TOOLTIP_W = 320 // matches w-80

function SFErrorBadge({ errors }: { errors: SFErrorDetail[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null)
  if (errors.length === 0) return null

  return (
    <>
      <span
        className="ml-1.5 text-red-400 text-[10px] font-medium cursor-help inline-flex items-center gap-0.5 whitespace-nowrap"
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const rawX = r.left + r.width / 2
          const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
          // Keep tooltip fully inside viewport with 8px padding on each side
          const clampedX = Math.min(Math.max(rawX, TOOLTIP_W / 2 + 8), vw - TOOLTIP_W / 2 - 8)
          setTooltip({ x: clampedX, y: r.top })
        }}
        onMouseLeave={() => setTooltip(null)}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        {errors.length} err
      </span>

      {tooltip && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y - 12,
            transform: 'translateX(-50%) translateY(-100%)',
          }}
        >
          <div className="bg-zinc-800 border border-red-500/30 rounded-xl p-3.5 shadow-2xl w-80 text-xs">
            <p className="font-semibold text-red-400 mb-2.5 flex items-center gap-1.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Salesforce Sync Errors
            </p>
            <div className="space-y-2.5">
              {errors.map((err, i) => (
                <div key={i} className="border-l-2 border-red-500/40 pl-2.5">
                  <p className="text-zinc-500 font-mono text-[10px] mb-0.5">
                    {err.eventType === 'sf_mapping_pull_failed' ? 'SOQL query failed' : `Job ${err.jobId}`}
                  </p>
                  <p className="text-zinc-300 leading-relaxed break-words">{err.error}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function LayerCell({
  count,
  sfErrors = [],
  dimWhenZero = true,
}: {
  count: number
  sfErrors?: SFErrorDetail[]
  dimWhenZero?: boolean
}) {
  const isEmpty = count === 0 && sfErrors.length === 0
  if (isEmpty && dimWhenZero) {
    return <span className="text-zinc-600 tabular-nums">—</span>
  }
  return (
    <span className="tabular-nums inline-flex items-center">
      <span className={cn(count > 0 ? 'text-zinc-200' : 'text-zinc-600')}>
        {count}
      </span>
      <SFErrorBadge errors={sfErrors} />
    </span>
  )
}

interface Props {
  runs: RunDetail[]
}

const COLS = 'grid-cols-[3rem_4.5rem_3.5rem_1fr_1fr_1fr] gap-x-2'

export default function LayerBreakdown({ runs }: Props) {
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)

  if (runs.length === 0) {
    return (
      <div className="py-10 text-center text-zinc-600 text-sm">
        No runs found in the database.
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {/* Instruction text */}
      <div className="px-3 py-1 text-xs text-zinc-500 flex items-center gap-1.5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
        Click any row to view detailed validation results
      </div>

      {/* Header */}
      <div
          className={cn(
            'grid px-3 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest',
          COLS,
        )}
      >
        <span>Run</span>
        <span>Status</span>
        <span>Started · Dur</span>
        <span className="flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          Email
        </span>
        <span className="flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          Jobs
        </span>
        <span className="flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
          </svg>
          SF Push
        </span>
      </div>

      {runs.map((run) => (
        <div
          key={run.id}
          onClick={() => setSelectedRunId(run.id)}
          className={cn(
            'grid px-3 py-2.5 rounded-lg text-sm items-center cursor-pointer',
            'hover:bg-zinc-700/30 hover:border-zinc-600 transition-all duration-200 group',
            'border border-transparent relative',
            COLS,
          )}
        >
          {/* Run IDs: show gmail + batch */}
          <span className="font-mono text-zinc-400 text-[11px] group-hover:text-zinc-200 leading-tight transition-colors">
            <span>#{run.id}</span>
            {run.batchId && (
              <span className="block text-zinc-600">#{run.batchId}</span>
            )}
          </span>

          <StatusBadge status={run.status} sfErrorCount={run.sfErrorCount} />

          {/* Started + duration */}
          <span className="text-zinc-400 text-xs leading-tight group-hover:text-zinc-300 transition-colors">
            <span className="block">{formatRelativeTime(run.startedAt)}</span>
            {run.durationSeconds != null && (
              <span className="block text-zinc-600 text-[10px]">
                {run.gmailDurationSeconds != null && run.batchDurationSeconds != null
                  ? formatDuration(run.gmailDurationSeconds + run.batchDurationSeconds)
                  : formatDuration(run.durationSeconds)
                }
              </span>
            )}
          </span>

          <LayerCell count={run.emailCount} />
          <LayerCell count={run.jobCount} />
          <LayerCell count={run.sfPatchCount} sfErrors={run.sfErrorDetails} />

          {/* Click indicator */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-xs text-zinc-400 bg-zinc-800 px-2 py-1 rounded border border-zinc-600 flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
              View Details
            </span>
          </div>
        </div>
      ))}

      <ValidationPopup
        runId={selectedRunId || 0}
        isOpen={selectedRunId !== null}
        onClose={() => setSelectedRunId(null)}
      />
    </div>
  )
}
