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

/** Plain-English reasons a day isn't green — the "why" behind the bar color. */
function ReasonLines({ day }: { day: DayStatus }) {
  const reasons: { text: string; tone: 'red' | 'amber' }[] = []
  if (day.emailsDropped > 0)
    reasons.push({ text: `${day.emailsDropped} update${day.emailsDropped === 1 ? '' : 's'} never processed`, tone: 'red' })
  if (day.killedRuns > 0)
    reasons.push({ text: `${day.killedRuns} run${day.killedRuns === 1 ? '' : 's'} died mid-work`, tone: 'red' })
  if (day.emailsLate > 0)
    reasons.push({ text: `${day.emailsLate} update${day.emailsLate === 1 ? '' : 's'} delayed over 1h`, tone: day.emailsLate >= 10 ? 'red' : 'amber' })
  if (day.sfErrors > 0)
    reasons.push({ text: `${day.sfErrors} unresolved Salesforce error${day.sfErrors === 1 ? '' : 's'}`, tone: 'amber' })
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

/** Affected Kimedics jobs, shown when the tooltip is pinned (clicked). */
function JobLinks({ label, ids, tone }: { label: string; ids: string[]; tone: 'red' | 'amber' }) {
  if (ids.length === 0) return null
  return (
    <div className="mt-2">
      <p className={cn('text-[10px] font-semibold uppercase tracking-wider mb-1', tone === 'red' ? 'text-red-400/80' : 'text-amber-400/80')}>
        {label}
      </p>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        {ids.slice(0, 14).map((id) => (
          <a
            key={id}
            href={`https://portal.kimedics.com/app/workspace/job-posts/${id}`}
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 hover:text-blue-300 hover:underline"
          >
            #{id}
          </a>
        ))}
        {ids.length > 14 && <span className="text-zinc-500">+{ids.length - 14} more</span>}
      </div>
    </div>
  )
}

interface Props {
  days: DayStatus[]
}

export default function StatusBarChart({ days }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [pinned, setPinned] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const close = () => {
    setTooltip(null)
    setPinned(false)
  }

  const hasDetails = (day: DayStatus) =>
    day.droppedJobIds.length > 0 || day.lateJobIds.length > 0

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative flex gap-[2px] h-10 w-full"
        onMouseLeave={() => {
          if (!pinned) setTooltip(null)
        }}
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
              if (pinned) return
              const bRect = e.currentTarget.getBoundingClientRect()
              setTooltip({
                day,
                viewportX: bRect.left + bRect.width / 2,
                viewportY: bRect.top,
              })
            }}
            onClick={(e) => {
              const bRect = e.currentTarget.getBoundingClientRect()
              if (pinned && tooltip?.day.day === day.day) {
                close()
                return
              }
              setTooltip({
                day,
                viewportX: bRect.left + bRect.width / 2,
                viewportY: bRect.top,
              })
              setPinned(true)
            }}
          />
        ))}
      </div>

      <div className="flex justify-between text-[10px] text-zinc-600 select-none">
        <span>90 days ago</span>
        <span>Today</span>
      </div>

      {/* Click-away backdrop while pinned */}
      {pinned && tooltip && (
        <div className="fixed inset-0 z-[9998]" onClick={close} />
      )}

      {/* Rendered fixed to viewport so it escapes any overflow-hidden parent */}
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
                    label="New jobs"
                    value={String(tooltip.day.sfJobsCreated)}
                    highlight={false}
                  />
                )}
              </div>
            )}

            <ReasonLines day={tooltip.day} />

            {pinned && (
              <>
                <JobLinks label="Never processed" ids={tooltip.day.droppedJobIds} tone="red" />
                <JobLinks label="Delayed over 1h" ids={tooltip.day.lateJobIds} tone="amber" />
              </>
            )}

            <div
              className={cn(
                'mt-2.5 pt-2 border-t border-zinc-800 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest',
                STATUS_COLORS[tooltip.day.status] ?? 'text-zinc-500',
              )}
            >
              {STATUS_LABELS[tooltip.day.status]}
              {!pinned && hasDetails(tooltip.day) && (
                <span className="font-normal normal-case tracking-normal text-zinc-500">click for jobs</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
