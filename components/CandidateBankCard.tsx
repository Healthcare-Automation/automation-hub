'use client'

import { useState } from 'react'
import type { CandidateBankBundle, CandidateBankRun } from '@/lib/candidateBankTypes'
import { cn, formatShortDate } from '@/lib/utils'
import MetricStrip from './MetricStrip'

function ResumeAvatar() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 ring-1 ring-violet-500/25">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="stroke-violet-600 dark:stroke-violet-400">
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
        <path d="M9 9h1M9 13h6M9 17h6" />
      </svg>
    </div>
  )
}

const RUN_STATUS: Record<CandidateBankRun['status'], { dot: string; label: string; text: string }> = {
  ok: { dot: 'bg-emerald-400', label: 'ok', text: 'text-emerald-700 dark:text-emerald-300' },
  running: { dot: 'bg-cyan-400 animate-pulse', label: 'running', text: 'text-cyan-700 dark:text-cyan-300' },
  paused_client_window: { dot: 'bg-zinc-400', label: 'paused (client window)', text: 'text-zinc-700 dark:text-zinc-300' },
  session_expired: { dot: 'bg-amber-400', label: 'session expired', text: 'text-amber-700 dark:text-amber-300' },
  error: { dot: 'bg-red-400', label: 'error', text: 'text-red-700 dark:text-red-300' },
}

function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

function mb(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 90) return 'just now'
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`
  return `${Math.round(secs / 86400)}d ago`
}

export default function CandidateBankCard({ bundle }: { bundle: CandidateBankBundle }) {
  const { kpis, byTarget, runs } = bundle
  const [showAllRuns, setShowAllRuns] = useState(false)
  const maxTarget = Math.max(1, ...byTarget.map(t => t.count))
  const shownRuns = showAllRuns ? runs : runs.slice(0, 6)

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/70 dark:bg-zinc-900/40 dark:shadow-none p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <ResumeAvatar />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">DJC Candidate Bank</h3>
            <span className="rounded-md bg-zinc-100 ring-zinc-200 text-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-400 dark:ring-zinc-700/50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ring-1">
              Internal
            </span>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            Every Dentist Job Cafe candidate → résumé + deterministically-extracted fields
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-600">Last scrape</div>
          <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 tabular-nums">{timeAgo(kpis.lastScraped)}</div>
        </div>
      </div>

      {/* Hero: résumés collected */}
      <div className="flex items-end justify-between rounded-xl bg-zinc-50 ring-zinc-200 dark:bg-zinc-800/40 dark:ring-zinc-700/40 px-4 py-3 ring-1">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Résumés in the bank</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums text-violet-700 dark:text-violet-200">{fmt(kpis.withResume)}</span>
            <span className="text-xs text-zinc-500">/ {fmt(kpis.totalCandidates)} candidates</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Storage</div>
          <div className="mt-0.5 text-sm font-medium tabular-nums text-zinc-700 dark:text-zinc-300">{mb(kpis.resumeBytes)}</div>
        </div>
      </div>

      {/* KPI strip (7d / all-time) */}
      <MetricStrip
        periods={{
          sevenDay: [
            { value: fmt(kpis.newCandidates7d), label: 'Candidates' },
            { value: fmt(kpis.newResumes7d), label: 'Résumés', accent: 'emerald' },
            { value: fmt(kpis.newEmail7d), label: 'With Email', accent: 'cyan' },
            { value: fmt(kpis.newPhone7d), label: 'With Phone', accent: 'cyan' },
          ],
          allTime: [
            { value: fmt(kpis.totalCandidates), label: 'Candidates' },
            { value: fmt(kpis.withResume), label: 'Résumés', accent: 'emerald' },
            { value: fmt(kpis.withEmail), label: 'With Email', accent: 'cyan' },
            { value: fmt(kpis.withPhone), label: 'With Phone', accent: 'cyan' },
          ],
        }}
      />

      {/* By specialty / role */}
      {byTarget.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-600">By specialty / role</div>
          <div className="space-y-1.5">
            {byTarget.map(t => (
              <div key={t.target} className="flex items-center gap-2">
                <div className="w-40 shrink-0 truncate text-xs text-zinc-600 dark:text-zinc-400" title={t.target}>{t.target}</div>
                <div className="relative h-4 flex-1 overflow-hidden rounded bg-zinc-200/70 dark:bg-zinc-800/60">
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-violet-500/60 dark:bg-violet-500/40"
                    style={{ width: `${(t.count / maxTarget) * 100}%` }}
                  />
                </div>
                <div className="w-24 shrink-0 text-right text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400">
                  {fmt(t.count)} <span className="text-zinc-400 dark:text-zinc-600">/ {fmt(t.withResume)} cv</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent runs */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-600">Recent runs</span>
          {runs.length > 6 && (
            <button onClick={() => setShowAllRuns(v => !v)} className="text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300">
              {showAllRuns ? 'Show less' : `Show all ${runs.length}`}
            </button>
          )}
        </div>
        {shownRuns.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600">No runs yet.</p>
        ) : (
          <div className="divide-y divide-zinc-200 ring-zinc-200 dark:divide-zinc-800/60 dark:ring-zinc-800/60 overflow-hidden rounded-lg ring-1">
            {shownRuns.map(r => {
              const s = RUN_STATUS[r.status] ?? RUN_STATUS.ok
              return (
                <div key={r.id} className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-900/30 px-3 py-2 text-xs">
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', s.dot)} />
                  <span className={cn('w-36 shrink-0 font-medium', s.text)}>{s.label}</span>
                  <span className="w-20 shrink-0 text-zinc-500">{r.mode}</span>
                  <span className="flex-1 text-zinc-600 dark:text-zinc-400 tabular-nums">
                    +{fmt(r.stored)} new
                    {r.updated > 0 && <span className="text-zinc-400 dark:text-zinc-600"> · {fmt(r.updated)} upd</span>}
                    {r.errors > 0 && <span className="text-red-600 dark:text-red-400/80"> · {fmt(r.errors)} err</span>}
                  </span>
                  <span className="shrink-0 text-zinc-500 dark:text-zinc-600 tabular-nums">{formatShortDate(r.startedAt)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
