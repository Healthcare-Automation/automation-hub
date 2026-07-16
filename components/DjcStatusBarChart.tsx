'use client'

import { useState, useRef } from 'react'
import type { DjcDayStatus } from '@/lib/djcTypes'
import { cn, BAR_COLORS, STATUS_LABELS, STATUS_COLORS, formatShortDate } from '@/lib/utils'

interface TooltipState {
  day: DjcDayStatus
  viewportX: number
  viewportY: number
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className={cn('font-medium tabular-nums', highlight ? 'text-red-400' : 'text-zinc-300')}>
        {value}
      </span>
    </div>
  )
}

/** Plain-English reasons a day isn't green. */
function ReasonLines({ day }: { day: DjcDayStatus }) {
  const reasons: { text: string; tone: 'red' | 'amber' }[] = []
  if (day.errorRuns > 0)
    reasons.push({ text: `${day.errorRuns} run${day.errorRuns === 1 ? '' : 's'} failed`, tone: 'red' })
  if (day.errors > 0)
    reasons.push({ text: `${day.errors} candidate error${day.errors === 1 ? '' : 's'} during processing`, tone: 'amber' })
  if (reasons.length === 0) return null
  return (
    <div className="mt-2 pt-2 border-t border-zinc-700/60 space-y-1">
      {reasons.map((r, i) => (
        <div key={i} className={cn('flex items-start gap-1.5 leading-snug', r.tone === 'red' ? 'text-red-400' : 'text-amber-400')}>
          <span className={cn('mt-[5px] h-1 w-1 shrink-0 rounded-full', r.tone === 'red' ? 'bg-red-400' : 'bg-amber-400')} />
          {r.text}
        </div>
      ))}
    </div>
  )
}

export default function DjcStatusBarChart({ days }: { days: DjcDayStatus[] }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [pinned, setPinned] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const close = () => {
    setTooltip(null)
    setPinned(false)
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative flex gap-[2px] h-10 w-full"
        onMouseLeave={() => {
          if (!pinned) setTooltip(null)
        }}
      >
        {days.map(day => (
          <div
            key={day.day}
            className={cn(
              'flex-1 rounded-[2px] min-w-0 cursor-pointer transition-all duration-100',
              BAR_COLORS[day.status],
              tooltip?.day.day === day.day ? 'opacity-100' : 'opacity-60 hover:opacity-100',
            )}
            onMouseEnter={e => {
              if (pinned) return
              const r = e.currentTarget.getBoundingClientRect()
              setTooltip({ day, viewportX: r.left + r.width / 2, viewportY: r.top })
            }}
            onClick={e => {
              const r = e.currentTarget.getBoundingClientRect()
              if (pinned && tooltip?.day.day === day.day) {
                close()
                return
              }
              setTooltip({ day, viewportX: r.left + r.width / 2, viewportY: r.top })
              setPinned(true)
            }}
          />
        ))}
      </div>

      <div className="flex justify-between text-[10px] text-zinc-600 select-none">
        <span>90 days ago</span>
        <span>Today</span>
      </div>

      {pinned && tooltip && <div className="fixed inset-0 z-[9998]" onClick={close} />}

      {tooltip && (
        <div
          className={cn('fixed z-[9999]', pinned ? 'pointer-events-auto' : 'pointer-events-none')}
          style={{
            left: tooltip.viewportX,
            top: tooltip.viewportY - 12,
            transform: 'translateX(-50%) translateY(-100%)',
          }}
        >
          <div className="bg-zinc-800 border border-zinc-600/60 rounded-xl p-3.5 shadow-2xl w-60 text-xs">
            <p className="font-medium text-white mb-2.5">{formatShortDate(tooltip.day.day)}</p>
            {tooltip.day.totalRuns === 0 ? (
              <p className="text-zinc-500">No runs</p>
            ) : (
              <div className="space-y-1.5">
                <Row label="Runs" value={`${tooltip.day.completedRuns}/${tooltip.day.totalRuns} done`} />
                <Row label="Candidates seen" value={String(tooltip.day.candidatesSeen)} />
                <Row label="Selected" value={String(tooltip.day.candidatesSelected)} />
                <Row label="Contactable" value={String(tooltip.day.contactable)} />
                <Row label="Duplicates" value={String(tooltip.day.duplicates)} />
                {tooltip.day.created > 0 && <Row label="Created" value={String(tooltip.day.created)} />}
                {tooltip.day.createSkippedGuard > 0 && (
                  <Row label="New (writes off)" value={String(tooltip.day.createSkippedGuard)} />
                )}
              </div>
            )}

            <ReasonLines day={tooltip.day} />

            {pinned && tooltip.day.errorRunDetails.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1 text-red-400/80">
                  Failed runs (UTC)
                </p>
                <div className="space-y-0.5 text-zinc-400">
                  {tooltip.day.errorRunDetails.slice(0, 8).map((d, i) => (
                    <div key={i}>{d}</div>
                  ))}
                  {tooltip.day.errorRunDetails.length > 8 && (
                    <div className="text-zinc-500">+{tooltip.day.errorRunDetails.length - 8} more</div>
                  )}
                </div>
              </div>
            )}

            <div
              className={cn(
                'mt-2.5 pt-2 border-t border-zinc-800 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest',
                STATUS_COLORS[tooltip.day.status] ?? 'text-zinc-500',
              )}
            >
              {STATUS_LABELS[tooltip.day.status]}
              {!pinned && tooltip.day.errorRunDetails.length > 0 && (
                <span className="font-normal normal-case tracking-normal text-zinc-500">click for details</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
