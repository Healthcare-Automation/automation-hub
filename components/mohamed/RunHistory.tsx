'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { RunHistoryItem } from '@/lib/mohamedQueries'
import type { RunLedgerSnapshot } from '@/lib/mohamedLedger'
import type { RunRequestRow } from '@/lib/mohamedRunRequests'
import { coverageGapAlert, describeFailureForClient, summariseClaims, summariseSubmissions } from '@/lib/mohamedLedger'
import { describeRunProgress } from '@/lib/mohamedRunProgress'
import {
  formatClock,
  formatDuration,
  formatPeriod,
  groupRunsByDay,
  isSubmissionRun,
  runOutcomeFromLedger,
  type RunOutcome,
  type RunOutcomeTone,
} from '@/lib/mohamedRunSummary'
import { LiveRunBoard } from './LiveRunBoard'
import { ClaimsByMember } from './ClaimsByMember'
import { CoverageGapAlertCard } from './CoverageGapAlertCard'
import { EligibilityChecksCard } from './EligibilityChecksCard'

/* ------------------------------------------------------------------ *
 * Status language: one colour per meaning, used identically everywhere
 * ------------------------------------------------------------------ */

type Tone = { dot: string; icon: string; headline: string; card: string; wash: string; pill: string; accent: string }

const TONES: Record<RunOutcomeTone, Tone> = {
  ready: {
    dot: 'bg-emerald-500 ring-emerald-100 dark:ring-emerald-500/25',
    icon: 'text-emerald-600 dark:text-emerald-400',
    headline: 'text-emerald-900 dark:text-emerald-200',
    card: 'border-emerald-200 hover:border-emerald-300 dark:border-emerald-500/30 dark:hover:border-emerald-500/50',
    wash: 'bg-emerald-50/50 dark:bg-emerald-500/[0.07]',
    pill: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    accent: 'bg-emerald-500',
  },
  attention: {
    dot: 'bg-amber-500 ring-amber-100 dark:ring-amber-500/25',
    icon: 'text-amber-600 dark:text-amber-400',
    headline: 'text-amber-900 dark:text-amber-200',
    card: 'border-amber-200 hover:border-amber-300 dark:border-amber-500/30 dark:hover:border-amber-500/50',
    wash: 'bg-amber-50/50 dark:bg-amber-500/[0.07]',
    pill: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300',
    accent: 'bg-amber-500',
  },
  failed: {
    dot: 'bg-red-500 ring-red-100 dark:ring-red-500/25',
    icon: 'text-red-600 dark:text-red-400',
    headline: 'text-red-900 dark:text-red-200',
    card: 'border-red-200 hover:border-red-300 dark:border-red-500/30 dark:hover:border-red-500/50',
    wash: 'bg-red-50/50 dark:bg-red-500/[0.07]',
    pill: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
    accent: 'bg-red-500',
  },
  idle: {
    dot: 'bg-zinc-400 ring-zinc-100 dark:bg-zinc-500 dark:ring-zinc-800',
    icon: 'text-zinc-400 dark:text-zinc-500',
    headline: 'text-zinc-700 dark:text-zinc-300',
    card: 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300',
    wash: 'bg-zinc-50 dark:bg-zinc-900/50',
    pill: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300',
    accent: 'bg-zinc-400',
  },
}

function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function timeAgo(iso: string | null | undefined, nowIso: string): string {
  if (!iso) return 'never'
  const ms = Date.parse(nowIso) - Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const mins = Math.round(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function OutcomeIcon({ tone, className }: { tone: RunOutcomeTone; className?: string }) {
  const shared = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...shared}>
      <circle cx="12" cy="12" r="9" />
      {tone === 'ready' && <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />}
      {tone === 'attention' && <path d="M12 7.75v5m0 3.25v.01" />}
      {tone === 'failed' && <path d="m9 9 6 6m0-6-6 6" />}
      {tone === 'idle' && <path d="M8.5 12h7" />}
    </svg>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

/** Submission vs test, as a pill. Submissions are what matter, so they
 * carry the colour; tests are deliberately quiet. */
function ModePill({ mode }: { mode: string }) {
  return isSubmissionRun(mode) ? (
    <span className="rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Submission</span>
  ) : (
    <span className="rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Test</span>
  )
}

function Stat({ value, label, className = '' }: { value: number | string; label: string; className?: string }) {
  return (
    <div className={`rounded-lg px-2.5 py-1.5 ${className}`}>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      <span className="ml-1.5 text-[11px] opacity-80">{label}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Top panel: the one thing to read
 * ------------------------------------------------------------------ */

function StatusPanel({
  inFlight,
  latest,
  latestOutcome,
  canCancel,
  nowIso,
}: {
  inFlight: RunRequestRow | null
  latest: RunLedgerSnapshot | null
  latestOutcome: RunOutcome | null
  canCancel: boolean
  nowIso: string
}) {
  if (inFlight) {
    return (
      <section data-section="status" className="relative mt-6 overflow-hidden rounded-2xl border border-emerald-300 bg-white dark:bg-zinc-900 shadow-[0_0_0_4px_rgba(16,185,129,0.08)]">
        <span className="absolute inset-y-0 left-0 w-1 bg-emerald-500" aria-hidden />
        <div className="p-4 pl-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="relative flex h-2.5 w-2.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Running now</h2>
            <ModePill mode={inFlight.submitMode ? 'submit' : 'dry_run'} />
            <span className="text-xs text-zinc-500">{describeRunProgress(inFlight.progress) ?? 'Starting…'}</span>
          </div>
          {/* Every stage + every member, live. Keyed by requestId so React
              never remounts across polls that report the SAME run. */}
          <LiveRunBoard key={inFlight.id} progress={inFlight.progress} requestId={inFlight.id} canCancel={canCancel} />
          <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">When it finishes it becomes the top row of the history below.</p>
        </div>
      </section>
    )
  }

  if (!latest || !latestOutcome) {
    return (
      <section data-section="status" className="relative mt-6 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <span className="absolute inset-y-0 left-0 w-1 bg-emerald-500" aria-hidden />
        <p className="p-4 pl-5 text-sm text-zinc-700 dark:text-zinc-300">No runs yet. Upload a CSV below to start one.</p>
      </section>
    )
  }

  const tone = TONES[latestOutcome.tone]
  const failure = latest.status === 'failed' ? describeFailureForClient(latest) : null
  const isSubmit = isSubmissionRun(latest.mode)
  return (
    <section data-section="status" className="relative mt-6 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1 ${tone.accent}`} aria-hidden />
      <div className="p-4 pl-5">
        <div className="flex flex-wrap items-center gap-2">
          <OutcomeIcon tone={latestOutcome.tone} className={`h-5 w-5 ${tone.icon}`} />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Latest run</span>
          <ModePill mode={latest.mode} />
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
            {formatPeriod(latest.period_start, latest.period_end)} · {timeAgo(latest.finished_at ?? latest.started_at, nowIso)}
            {formatDuration(latest.started_at, latest.finished_at) && ` · took ${formatDuration(latest.started_at, latest.finished_at)}`}
          </span>
        </div>
        <p className={`mt-1.5 text-[15px] font-semibold leading-snug ${tone.headline}`}>{latestOutcome.headline}</p>
        {latestOutcome.subline && <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{latestOutcome.subline}</p>}
        <OutcomeStats outcome={latestOutcome} isSubmit={isSubmit} />
        {failure && (
          <dl className="mt-3 space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3 text-xs">
            <div><dt className="inline font-semibold text-red-900 dark:text-red-200">What happened: </dt><dd className="inline text-red-800 dark:text-red-300">{failure.whatHappened}</dd></div>
            <div><dt className="inline font-semibold text-red-900 dark:text-red-200">What the system did: </dt><dd className="inline text-red-800 dark:text-red-300">{failure.whatSystemDid}</dd></div>
            {failure.whatToDo && <div><dt className="inline font-semibold text-red-900 dark:text-red-200">What to do: </dt><dd className="inline text-red-800 dark:text-red-300">{failure.whatToDo}</dd></div>}
          </dl>
        )}
      </div>
    </section>
  )
}

/** The numbers strip. For a submission: sent / paid / denied / paid-vs-
 * claimed dollars. For a test: visits in / passed / held back / unfinished. */
function OutcomeStats({ outcome, isSubmit }: { outcome: RunOutcome; isSubmit: boolean }) {
  const items: ReactNode[] = []
  if (isSubmit && outcome.submitted > 0) {
    items.push(<Stat key="sent" value={outcome.submitted} label="submitted" className="bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" />)
    if (outcome.paid > 0) items.push(<Stat key="paid" value={outcome.paid} label="paid" className="bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200" />)
    if (outcome.denied > 0) items.push(<Stat key="denied" value={outcome.denied} label="denied" className="bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-200" />)
    const awaiting = outcome.submitted - outcome.paid - outcome.denied
    if (awaiting > 0) items.push(<Stat key="await" value={awaiting} label="awaiting HCPF" className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" />)
    if (outcome.flagged > 0) items.push(<Stat key="flag" value={outcome.flagged} label="need a look" className="bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200" />)
    items.push(
      <Stat
        key="money"
        value={outcome.paidCents !== null ? `${money(outcome.paidCents)} / ${money(outcome.chargedCents)}` : money(outcome.chargedCents)}
        label={outcome.paidCents !== null ? 'paid / claimed' : 'claimed'}
        className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 ring-1 ring-zinc-200 dark:ring-zinc-700"
      />,
    )
  } else {
    if (outcome.visitsIn !== null) items.push(<Stat key="in" value={outcome.visitsIn} label="visits in" className="bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 ring-1 ring-zinc-200 dark:ring-zinc-700" />)
    if (outcome.claimsReady > 0 || outcome.visitsBlocked > 0) items.push(<Stat key="ready" value={outcome.claimsReady} label={isSubmit ? 'reached review' : 'passed'} className="bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200" />)
  }
  if (outcome.visitsBlocked > 0 && !(isSubmit && outcome.submitted > 0)) items.push(<Stat key="held" value={outcome.visitsBlocked} label="visits held back" className="bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200" />)
  if (outcome.claimsFailed > 0) items.push(<Stat key="fail" value={outcome.claimsFailed} label="claims unfinished" className="bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-200" />)
  if (outcome.alreadySubmitted > 0) items.push(<Stat key="dedup" value={outcome.alreadySubmitted} label="already billed earlier" className="bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300" />)
  if (items.length === 0) return null
  return <div className="mt-3 flex flex-wrap gap-2">{items}</div>
}

/* ------------------------------------------------------------------ *
 * One run in the history
 * ------------------------------------------------------------------ */

type RunPreview =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; ledger: RunLedgerSnapshot }

function RunRow({
  item,
  outcome,
  isOpen,
  isLatest,
  justFinished,
  preview,
  onToggle,
}: {
  item: RunHistoryItem
  outcome: RunOutcome | null
  isOpen: boolean
  isLatest: boolean
  justFinished: boolean
  preview: RunPreview | undefined
  onToggle: () => void
}) {
  const tone = TONES[outcome?.tone ?? 'idle']
  const isSubmit = isSubmissionRun(item.mode)
  const ledger = preview?.phase === 'ready' ? preview.ledger : null
  const claims = ledger ? summariseClaims(ledger) : []
  const reviewable = claims.filter(c => c.reachedReview || c.alreadySubmitted)
  const notReviewableCount = claims.length - reviewable.length
  const gapAlert = ledger ? coverageGapAlert(ledger) : null
  const sub = ledger && isSubmit ? summariseSubmissions(ledger, claims) : null

  return (
    <li className="relative">
      <span className={`absolute -left-[1.8125rem] top-[1.05rem] h-2.5 w-2.5 rounded-full ring-4 ${tone.dot}`} aria-hidden />
      <div className={`overflow-hidden rounded-xl border bg-white dark:bg-zinc-900 transition-colors ${tone.card}`}>
        {/* Collapsed row: one line. Period · mode · headline · when. */}
        <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
          <OutcomeIcon tone={outcome?.tone ?? 'idle'} className={`h-4 w-4 shrink-0 ${tone.icon}`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{formatPeriod(item.periodStart, item.periodEnd)}</span>
              <ModePill mode={item.mode} />
              {justFinished && <span className="rounded-full bg-emerald-600 text-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Just finished</span>}
              {isLatest && !justFinished && <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Latest</span>}
            </div>
            <p className={`truncate text-xs ${tone.headline}`}>{outcome ? outcome.headline : 'Open to see what happened'}</p>
          </div>
          <div className="hidden shrink-0 text-right sm:block">
            <p className="text-[11px] text-zinc-500">{formatClock(item.startedAt)}</p>
            {formatDuration(item.startedAt, item.finishedAt) && <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{formatDuration(item.startedAt, item.finishedAt)}</p>}
          </div>
          <Chevron open={isOpen} />
        </button>

        {isOpen && (
          <div className={`border-t border-zinc-100 dark:border-zinc-800 px-3.5 py-3.5 ${tone.wash}`}>
            {outcome?.subline && <p className="text-xs text-zinc-600 dark:text-zinc-400">{outcome.subline}</p>}
            {outcome && <OutcomeStats outcome={outcome} isSubmit={isSubmit} />}

            {outcome && outcome.reasons.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Why visits were held back</p>
                <ul className="mt-1.5 space-y-1">
                  {outcome.reasons.map(reason => (
                    <li key={reason.code} className="flex items-baseline gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${tone.pill}`}>{reason.count}</span>
                      <span className="first-letter:uppercase">{reason.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Everything about this run lives here, not on the page. */}
            {gapAlert && ledger && <CoverageGapAlertCard runId={ledger.run_id} alert={gapAlert} />}

            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                {isSubmit ? 'Claims' : 'Claims (test — nothing submitted)'}
                {sub && sub.submitted > 0 && (
                  <span className="ml-2 normal-case tracking-normal text-zinc-500">
                    {sub.submitted} submitted · {sub.paid} paid · {sub.denied} denied
                    {sub.paidCents !== null && ` · ${money(sub.paidCents)} paid of ${money(sub.chargedCents)}`}
                  </span>
                )}
              </p>
              <div className="mt-1.5">
                {preview === undefined || preview.phase === 'loading' ? (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">Loading claims…</p>
                ) : preview.phase === 'error' ? (
                  <p className="text-xs text-red-700 dark:text-red-400">Could not load this run&apos;s claims.</p>
                ) : claims.length === 0 ? (
                  <p className="text-xs text-zinc-500">No claims were built in this run.</p>
                ) : reviewable.length > 0 ? (
                  <ClaimsByMember runId={item.runId} ledger={preview.ledger} claims={reviewable} />
                ) : (
                  <p className="text-xs text-zinc-500">No claims reached HCPF review in this run.</p>
                )}
              </div>
              {ledger && notReviewableCount > 0 && (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 px-3 py-2 text-xs">
                  {notReviewableCount} claim{notReviewableCount === 1 ? '' : 's'} in this run did not reach HCPF review.
                </p>
              )}
            </div>

            {ledger && <EligibilityChecksCard runId={ledger.run_id} />}

            <p className="mt-3 text-right font-mono text-[10px] text-zinc-400 dark:text-zinc-500">ref {item.runId.slice(0, 8)}</p>
          </div>
        )}
      </div>
    </li>
  )
}

/* ------------------------------------------------------------------ *
 * The history
 * ------------------------------------------------------------------ */

type Filter = 'submissions' | 'tests' | 'all'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'submissions', label: 'Submissions' },
  { key: 'tests', label: 'Tests' },
  { key: 'all', label: 'All' },
]

/**
 * Status panel + run history (Andy, 2026-09-05):
 *  - the top panel is the in-flight board when a run is happening, else the
 *    latest run's outcome — one place, not three;
 *  - Submissions / Tests / All filter, submissions first (that's what piles
 *    up and matters);
 *  - every run is a single collapsed line; open it for claims (with HCPF
 *    claim id, status, paid vs claimed), held-back visits and eligibility
 *    checks. Nothing about a run is shown outside its own row.
 */
export function RunHistory({
  history,
  latestLedger,
  canCancel = false,
  degraded = false,
  nowIso,
  inFlight = null,
  inFlightDegraded = false,
  middle = null,
}: {
  history: RunHistoryItem[]
  /** The most recent run's full ledger (server-fetched) for the top panel. */
  latestLedger: RunLedgerSnapshot | null
  /** Admin-only: shows the Stop button on the live board for the in-flight run. */
  canCancel?: boolean
  degraded?: boolean
  /** Server-supplied "now" so 'Today'/'Yesterday' render identically on the
   * server and after hydration. */
  nowIso?: string
  inFlight?: RunRequestRow | null
  /** True when THIS render's server-side in-flight query failed — distinct
   * from "there is genuinely no run happening". */
  inFlightDegraded?: boolean
  /** Rendered between the status panel and the history (upload, browser). */
  middle?: ReactNode
}) {
  const [filter, setFilter] = useState<Filter>('submissions')
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Record<string, RunPreview>>({})
  // Smart cache for the live board's presence: a degraded server render
  // must not tear down a board that was visibly there a moment ago (Andy,
  // 2026-08-25: "things keep disappearing and reappearing... unacceptable").
  const [lastKnownInFlight, setLastKnownInFlight] = useState<RunRequestRow | null>(inFlight)
  useEffect(() => {
    if (!inFlightDegraded) setLastKnownInFlight(inFlight)
  }, [inFlight, inFlightDegraded])
  const effectiveInFlight = inFlightDegraded ? lastKnownInFlight : inFlight

  const now = nowIso ?? history[0]?.startedAt ?? '1970-01-01T00:00:00.000Z'

  function loadPreview(runId: string) {
    setPreviews(prev => (prev[runId] ? prev : { ...prev, [runId]: { phase: 'loading' } }))
    fetch(`/api/mohamed/run/${runId}`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok || !data.ok || !data.ledger) throw new Error('bad_response')
        setPreviews(prev => ({ ...prev, [runId]: { phase: 'ready', ledger: data.ledger } }))
      })
      .catch(() => setPreviews(prev => ({ ...prev, [runId]: { phase: 'error' } })))
  }

  function toggle(runId: string) {
    setOpenRunId(prev => {
      if (prev === runId) return null
      loadPreview(runId)
      return runId
    })
  }

  const submissionCount = useMemo(() => history.filter(h => isSubmissionRun(h.mode)).length, [history])
  const visible = useMemo(
    () => history.filter(h => (filter === 'all' ? true : filter === 'submissions' ? isSubmissionRun(h.mode) : !isSubmissionRun(h.mode))),
    [history, filter],
  )
  const newestRunId = history[0]?.runId ?? ''
  const latestOutcome = latestLedger ? runOutcomeFromLedger(latestLedger) : null
  const groups = groupRunsByDay(visible, now)

  return (
    <>
      <StatusPanel inFlight={degraded ? null : effectiveInFlight} latest={latestLedger} latestOutcome={latestOutcome} canCancel={canCancel} nowIso={now} />

      {middle}

      <section id="run-history" data-section="history" className="scroll-mt-4 mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Run history</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Open a run for its claims, HCPF status and what was paid.</p>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5" role="tablist" aria-label="Filter runs">
            {FILTERS.map(f => {
              const n = f.key === 'all' ? history.length : f.key === 'submissions' ? submissionCount : history.length - submissionCount
              return (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    filter === f.key
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  {f.label} <span className="tabular-nums opacity-60">{n}</span>
                </button>
              )
            })}
          </div>
        </div>

        {degraded ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 px-4 py-6 text-xs">
            Reconnecting… this list refreshes automatically. Nothing is lost.
          </p>
        ) : history.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-300 bg-white dark:bg-zinc-900 px-4 py-8 text-center text-xs text-zinc-500">
            No runs yet. Upload a CSV above and the first run will appear here.
          </p>
        ) : visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-300 bg-white dark:bg-zinc-900 px-4 py-8 text-center text-xs text-zinc-500">
            {filter === 'submissions' ? 'No submissions yet — only test runs so far.' : 'No test runs.'}
          </p>
        ) : (
          <div className="space-y-5">
            {groups.map(group => (
              <div key={group.day}>
                <div className="mb-2 flex items-center gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{group.label}</h3>
                  <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{group.runs.length} run{group.runs.length === 1 ? '' : 's'}</span>
                </div>
                <ol className="space-y-2 border-l border-zinc-200 dark:border-zinc-800 pl-6">
                  {group.runs.map(item => (
                    <RunRow
                      key={item.runId}
                      item={item}
                      outcome={
                        item.outcome ??
                        (previews[item.runId]?.phase === 'ready'
                          ? runOutcomeFromLedger((previews[item.runId] as { ledger: RunLedgerSnapshot }).ledger)
                          : null)
                      }
                      isOpen={openRunId === item.runId}
                      isLatest={item.runId === newestRunId}
                      justFinished={isRecent(item.finishedAt ?? item.startedAt, now)}
                      preview={previews[item.runId]}
                      onToggle={() => toggle(item.runId)}
                    />
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

/** Within the last 15 minutes — long enough that a client who walked away
 * from the upload still sees which card is theirs. */
function isRecent(iso: string, nowIso: string): boolean {
  const then = Date.parse(iso)
  const now = Date.parse(nowIso)
  if (Number.isNaN(then) || Number.isNaN(now)) return false
  const delta = now - then
  return delta >= 0 && delta < 15 * 60_000
}
