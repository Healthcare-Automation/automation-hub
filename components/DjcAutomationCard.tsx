'use client'

import { useState } from 'react'
import type { DjcDayStatus, DjcRunDetail, DjcSummary } from '@/lib/djcTypes'
import { cn, STATUS_DOT_COLORS, STATUS_COLORS, STATUS_LABELS, formatRelativeTime } from '@/lib/utils'
import DjcStatusBarChart from './DjcStatusBarChart'
import DjcRunBreakdown from './DjcRunBreakdown'

interface Props {
  dailyStatus: DjcDayStatus[]
  recentRuns: DjcRunDetail[]
  summary: DjcSummary
}

/** Distinct cyan tooth mark so DJC is instantly differentiated from the green Kimedics card. */
function ToothMark() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 ring-1 ring-cyan-500/30">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5.5c-2-1.8-5-2-6.5-.3C4 6.8 4.3 9 5 11.5c.5 1.8.6 3 1 5 .3 1.6.6 3 1.5 3s1-1.4 1.3-3c.2-1.2.4-2.2 1.2-2.2s1 1 1.2 2.2c.3 1.6.5 3 1.4 3s1.2-1.4 1.5-3c.4-2 .5-3.2 1-5 .7-2.5 1-4.7-.5-6.3C17 3.5 14 3.7 12 5.5Z" />
      </svg>
    </div>
  )
}

function StatBox({ label, value, tone = 'zinc' }: { label: string; value: string | number; tone?: string }) {
  const tones: Record<string, string> = {
    zinc: 'text-zinc-200',
    cyan: 'text-cyan-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    red: 'text-red-300',
  }
  return (
    <div className="rounded-lg bg-zinc-800/40 px-3 py-2">
      <p className={cn('text-lg font-semibold tabular-nums leading-none', tones[tone])}>{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
    </div>
  )
}

export default function DjcAutomationCard({ dailyStatus, recentRuns, summary }: Props) {
  const [expanded, setExpanded] = useState(false)
  const today = dailyStatus[dailyStatus.length - 1]
  const lastRun = recentRuns[0]
  const statusKind = lastRun
    ? lastRun.status === 'error' || lastRun.status === 'session_expired'
      ? 'outage'
      : lastRun.errorCount > 0
        ? 'degraded'
        : 'operational'
    : today?.status ?? 'no_data'

  return (
    <div className="relative overflow-hidden rounded-xl border border-cyan-500/20 bg-zinc-800/30">
      {/* Cyan accent rail — the at-a-glance "this is DJC" cue */}
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-cyan-400/80 to-cyan-600/40" />

      <div className="px-5 pt-5 pb-4 pl-6">
        <div className="mb-1 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ToothMark />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-semibold text-white">Dentist Job Cafe → Salesforce</h3>
                <span className="rounded-md bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-cyan-300 ring-1 ring-cyan-500/30">
                  DJC
                </span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-400">
                Scrapes DJC candidates, recovers contacts (profile + in-memory CV parse), dedups, and
                creates Salesforce Contacts with the CV attached
              </p>
            </div>
          </div>
          <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', STATUS_DOT_COLORS[statusKind] ?? 'bg-zinc-600')} />
            <span className={cn('text-xs font-medium', STATUS_COLORS[statusKind] ?? 'text-zinc-500')}>
              {STATUS_LABELS[statusKind]}
            </span>
          </div>
        </div>

        <div className="mb-4 mt-3 flex items-center gap-4 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1.5 text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Testing · writes off
          </span>
          <span>·</span>
          <span>Daily ~12:03 AM ET · Modal (planned)</span>
          {summary.lastRunAt && (
            <>
              <span>·</span>
              <span>last run {formatRelativeTime(summary.lastRunAt)}</span>
            </>
          )}
        </div>

        {/* Lifetime testing stats */}
        <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          <StatBox label="Runs" value={summary.totalRuns} />
          <StatBox label="Seen" value={summary.candidatesSeen} />
          <StatBox label="Contactable" value={summary.contactable} tone="emerald" />
          <StatBox label="Duplicates" value={summary.duplicates} />
          <StatBox label="New (held)" value={summary.wouldCreate} tone="cyan" />
          <StatBox label="Errors" value={summary.errors} tone={summary.errors ? 'red' : 'zinc'} />
        </div>

        <DjcStatusBarChart days={dailyStatus} />
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between border-t border-cyan-500/15 px-5 py-3 pl-6 text-xs text-zinc-400 transition-colors hover:bg-cyan-500/5 hover:text-zinc-200"
      >
        <span>{expanded ? 'Hide run history & event log' : 'View run history & event log'}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          className={cn('transition-transform duration-200', expanded && 'rotate-180')}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-cyan-500/15 px-2 py-3">
          <DjcRunBreakdown runs={recentRuns} />
        </div>
      )}
    </div>
  )
}
