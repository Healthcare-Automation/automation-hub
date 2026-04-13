'use client'

import { useState, useRef } from 'react'
import type { DayStatus } from '@/lib/types'
import { cn, BAR_COLORS, STATUS_LABELS, STATUS_COLORS, formatShortDate } from '@/lib/utils'

interface TooltipState {
  day: DayStatus
  /** Viewport X center of the hovered bar */
  viewportX: number
  /** Viewport top of the hovered bar */
  viewportY: number
}

function TooltipRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className={cn('font-medium tabular-nums', highlight ? 'text-red-400' : 'text-zinc-300')}>
        {value}
      </span>
    </div>
  )
}

interface Props {
  days: DayStatus[]
}

export default function StatusBarChart({ days }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative flex gap-[2px] h-10 w-full"
        onMouseLeave={() => setTooltip(null)}
      >
        {days.map((day) => (
          <div
            key={day.day}
            className={cn(
              'flex-1 rounded-[2px] min-w-0 cursor-pointer transition-all duration-100',
              BAR_COLORS[day.status],
              tooltip?.day.day === day.day
                ? 'opacity-100'
                : 'opacity-60 hover:opacity-100',
            )}
            onMouseEnter={(e) => {
              const bRect = e.currentTarget.getBoundingClientRect()
              setTooltip({
                day,
                viewportX: bRect.left + bRect.width / 2,
                viewportY: bRect.top,
              })
            }}
          />
        ))}
      </div>

      <div className="flex justify-between text-[10px] text-zinc-600 select-none">
        <span>90 days ago</span>
        <span>Today</span>
      </div>

      {/* Rendered fixed to viewport so it escapes any overflow-hidden parent */}
      {tooltip && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: tooltip.viewportX,
            top: tooltip.viewportY - 12,
            transform: 'translateX(-50%) translateY(-100%)',
          }}
        >
          <div className="bg-zinc-800 border border-zinc-600/60 rounded-xl p-3.5 shadow-2xl w-52 text-xs">
            <p className="font-medium text-white mb-2.5">
              {formatShortDate(tooltip.day.day)}
            </p>

            {tooltip.day.status === 'idle' ? (
              <p className="text-zinc-400">No emails to scrape</p>
            ) : tooltip.day.totalRuns === 0 ? (
              <p className="text-zinc-500">No runs scheduled</p>
            ) : (
              <div className="space-y-1.5">
                <TooltipRow
                  label="Runs"
                  value={`${tooltip.day.completedRuns}/${tooltip.day.totalRuns} completed`}
                />
                <TooltipRow label="Emails" value={String(tooltip.day.emailsScraped)} />
                <TooltipRow label="Jobs scraped" value={String(tooltip.day.jobsScraped)} />
                <TooltipRow label="SF synced" value={String(tooltip.day.sfPatches)} />
                {tooltip.day.sfJobsCreated > 0 && (
                  <TooltipRow
                    label="New Job__c"
                    value={String(tooltip.day.sfJobsCreated)}
                    highlight={false}
                  />
                )}
                {tooltip.day.sfErrors > 0 && (
                  <TooltipRow
                    label="SF errors"
                    value={String(tooltip.day.sfErrors)}
                    highlight
                  />
                )}
              </div>
            )}

            <div
              className={cn(
                'mt-2.5 pt-2 border-t border-zinc-800 text-[10px] font-semibold uppercase tracking-widest',
                STATUS_COLORS[tooltip.day.status] ?? 'text-zinc-500',
              )}
            >
              {STATUS_LABELS[tooltip.day.status]}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
