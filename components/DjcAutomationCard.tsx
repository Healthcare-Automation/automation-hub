'use client'

import { useState } from 'react'
import type { DjcDayStatus, DjcRunDetail, DjcSummary } from '@/lib/djcTypes'
import { cn, STATUS_DOT_COLORS, STATUS_COLORS, STATUS_LABELS, formatShortDate } from '@/lib/utils'
import DjcStatusBarChart from './DjcStatusBarChart'
import DjcRunBreakdown from './DjcRunBreakdown'
import MetricStrip from './MetricStrip'
import SendReportButton from './SendReportButton'

// Date the scheduled run flipped from preview/testing to live Salesforce writes.
const DJC_GO_LIVE = '2026-06-16'

interface Props {
  dailyStatus: DjcDayStatus[]
  recentRuns: DjcRunDetail[]
  summary: DjcSummary
}

/** Cyan tooth avatar — same slot/size as the Kimedics avatar, different color/icon. */
function ToothAvatar() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 ring-1 ring-cyan-500/25">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5.5c-2-1.8-5-2-6.5-.3C4 6.8 4.3 9 5 11.5c.5 1.8.6 3 1 5 .3 1.6.6 3 1.5 3s1-1.4 1.3-3c.2-1.2.4-2.2 1.2-2.2s1 1 1.2 2.2c.3 1.6.5 3 1.4 3s1.2-1.4 1.5-3c.4-2 .5-3.2 1-5 .7-2.5 1-4.7-.5-6.3C17 3.5 14 3.7 12 5.5Z" />
      </svg>
    </div>
  )
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export default function DjcAutomationCard({ dailyStatus, recentRuns, summary }: Props) {
  const [expanded, setExpanded] = useState(false)
  const lastRun = recentRuns[0]
  const statusKind = lastRun
    ? lastRun.status === 'error' || lastRun.status === 'session_expired'
      ? 'outage'
      : lastRun.status === 'running'
        ? 'operational'
        : lastRun.errorCount > 0
          ? 'degraded'
          : 'operational'
    : dailyStatus[dailyStatus.length - 1]?.status ?? 'no_data'

  const newTotal = summary.wouldCreate + summary.created
  const firstRunDay = dailyStatus.find(d => d.totalRuns > 0)?.day

  // Testing (amber) → Production (green) within the 90-day window, split at the go-live date.
  const phaseSegs = (() => {
    const empty = { testing: { left: 0, width: 0 }, production: { left: 0, width: 0 } }
    if (!dailyStatus.length || !firstRunDay) return empty
    const winStart = new Date(dailyStatus[0].day + 'T00:00:00Z').getTime()
    const lastDay = new Date(dailyStatus[dailyStatus.length - 1].day + 'T00:00:00Z')
    lastDay.setUTCDate(lastDay.getUTCDate() + 1)
    const winMs = lastDay.getTime() - winStart || 1
    const pct = (ms: number) => Math.max(0, Math.min(100, ((ms - winStart) / winMs) * 100))
    const start = new Date(firstRunDay + 'T00:00:00Z').getTime()
    const live = new Date(DJC_GO_LIVE + 'T00:00:00Z').getTime()
    const end = lastDay.getTime()
    const tL = pct(start), tR = pct(Math.min(live, end))
    const pL = pct(Math.max(live, start)), pR = pct(end)
    return {
      testing: { left: tL, width: Math.max(0, tR - tL) },
      production: { left: pL, width: Math.max(0, pR - pL) },
    }
  })()

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-800/30">
      <div className="px-5 pt-5 pb-4">
        {/* Header — same structure as the Kimedics card (avatar · title/desc · status) */}
        <div className="mb-3 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ToothAvatar />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-semibold text-white">Dentist Job Cafe → Salesforce</h3>
                <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-cyan-300 ring-1 ring-cyan-500/25">DJC</span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-400">
                Sources dental candidates, recovers contacts from profile + résumé, dedups, and prepares Salesforce Contacts with the résumé attached
              </p>
            </div>
          </div>
          <div className="mt-0.5 flex shrink-0 flex-col items-end gap-1.5">
            <div className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', STATUS_DOT_COLORS[statusKind] ?? 'bg-zinc-600')} />
              <span className={cn('text-xs font-medium', STATUS_COLORS[statusKind] ?? 'text-zinc-500')}>{STATUS_LABELS[statusKind]}</span>
            </div>
            <SendReportButton automation="djc" title="Dentist Job Cafe → Salesforce" accent="cyan" />
          </div>
        </div>

        {/* Meta line — parallels the Kimedics "uptime · schedule" line */}
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>3×/day · 5 AM / 4 PM / 8 PM ET · Modal</span>
        </div>

        {/* One-line takeaway so the card reads at a glance before the numbers */}
        <p className="mb-3 text-[13px] leading-relaxed text-zinc-300">
          <span className="font-semibold text-cyan-300">{summary.last7.wouldCreate + summary.last7.created}</span> new candidate{summary.last7.wouldCreate + summary.last7.created === 1 ? '' : 's'} from{' '}
          <span className="font-semibold text-white">{summary.last7.candidatesSeen.toLocaleString()}</span> reviewed
          {summary.last7.duplicates > 0 && <> · <span className="text-zinc-400">{summary.last7.duplicates.toLocaleString()} already on file</span></>}
          <span className="text-zinc-500"> — past 7 days</span>
        </p>

        <div className="mb-4">
          <MetricStrip periods={{
            sevenDay: [
              { value: String(summary.last7.wouldCreate + summary.last7.created), label: 'New', accent: 'cyan' },
              { value: summary.last7.candidatesSeen.toLocaleString(), label: 'Reviewed' },
              { value: summary.last7.duplicates.toLocaleString(), label: 'On file' },
              { value: String(summary.last7.totalRuns), label: 'Runs' },
            ],
            allTime: [
              { value: String(newTotal), label: 'New', accent: 'cyan' },
              { value: summary.candidatesSeen.toLocaleString(), label: 'Reviewed' },
              { value: summary.duplicates.toLocaleString(), label: 'On file' },
              { value: String(summary.totalRuns), label: 'Runs' },
            ],
          }} />
        </div>

        <DjcStatusBarChart days={dailyStatus} />

        {/* Phase row — same slot as the Kimedics phase timeline */}
        <div className="mt-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Phase</p>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-700/50">
            <div className="absolute top-0 bottom-0 bg-amber-500" style={{ left: `${phaseSegs.testing.left}%`, width: `${phaseSegs.testing.width}%` }} />
            <div className="absolute top-0 bottom-0 bg-emerald-500" style={{ left: `${phaseSegs.production.left}%`, width: `${phaseSegs.production.width}%` }} />
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="h-1.5 w-5 shrink-0 rounded-sm bg-emerald-500" aria-hidden />
            <span className="font-semibold text-emerald-400">Production</span>
            <span className="text-zinc-500">live — creating Salesforce Contacts · since {formatShortDate(DJC_GO_LIVE)}</span>
          </div>
        </div>
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between border-t border-zinc-700/50 px-5 py-3 text-xs text-zinc-400 transition-colors hover:bg-zinc-700/30 hover:text-zinc-200"
      >
        <span>{expanded ? 'Hide run history' : 'View run history'}</span>
        <ChevronDown className={cn('transition-transform duration-200', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="border-t border-zinc-700/50 px-2 py-3">
          <DjcRunBreakdown runs={recentRuns} />
        </div>
      )}
    </div>
  )
}
