'use client'

import { useEffect, useState } from 'react'
import type { RunHistoryItem } from '@/lib/mohamedQueries'
import type { RunLedgerSnapshot } from '@/lib/mohamedLedger'
import type { RunRequestRow } from '@/lib/mohamedRunRequests'
import type { ClaimApproval } from '@/lib/mohamedApprovals'
import { summariseClaims } from '@/lib/mohamedLedger'
import {
  describeRunMode,
  formatClock,
  formatPeriod,
  groupRunsByDay,
  runOutcomeFromLedger,
  type RunOutcome,
  type RunOutcomeTone,
} from '@/lib/mohamedRunSummary'
import { RunDetailPanel } from './RunDetailPanel'
import { LiveRunBoard } from './LiveRunBoard'
import { ClaimsByMember } from './ClaimsByMember'

/* ------------------------------------------------------------------ *
 * Status language: one colour per meaning, used identically everywhere
 * ------------------------------------------------------------------ */

type Tone = {
  dot: string
  icon: string
  headline: string
  card: string
  wash: string
  pill: string
}

const TONES: Record<RunOutcomeTone, Tone> = {
  ready: {
    dot: 'bg-emerald-500 ring-emerald-100',
    icon: 'text-emerald-600',
    headline: 'text-emerald-900',
    card: 'border-emerald-200 hover:border-emerald-300',
    wash: 'bg-emerald-50/50',
    pill: 'bg-emerald-100 text-emerald-800',
  },
  attention: {
    dot: 'bg-amber-500 ring-amber-100',
    icon: 'text-amber-600',
    headline: 'text-amber-900',
    card: 'border-amber-200 hover:border-amber-300',
    wash: 'bg-amber-50/50',
    pill: 'bg-amber-100 text-amber-900',
  },
  failed: {
    dot: 'bg-red-500 ring-red-100',
    icon: 'text-red-600',
    headline: 'text-red-900',
    card: 'border-red-200 hover:border-red-300',
    wash: 'bg-red-50/50',
    pill: 'bg-red-100 text-red-800',
  },
  idle: {
    dot: 'bg-zinc-400 ring-zinc-100',
    icon: 'text-zinc-400',
    headline: 'text-zinc-700',
    card: 'border-zinc-200 hover:border-zinc-300',
    wash: 'bg-zinc-50',
    pill: 'bg-zinc-100 text-zinc-700',
  },
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

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-180" aria-hidden
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

/* ------------------------------------------------------------------ *
 * Cards
 * ------------------------------------------------------------------ */

function Stat({ value, label, className = '' }: { value: number; label: string; className?: string }) {
  return (
    <div className={`rounded-lg px-2.5 py-1.5 ${className}`}>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      <span className="ml-1.5 text-[11px] opacity-80">{label}</span>
    </div>
  )
}

type RunPreview =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; ledger: RunLedgerSnapshot; approvals: Record<string, ClaimApproval> }

function RunCard({
  item,
  outcome,
  isOpen,
  isLatest,
  isSelected,
  justFinished,
  preview,
  canApprove,
  onToggle,
  onOpenReview,
}: {
  item: RunHistoryItem
  outcome: RunOutcome | null
  isOpen: boolean
  isLatest: boolean
  isSelected: boolean
  justFinished: boolean
  preview: RunPreview | undefined
  canApprove: boolean
  onToggle: (open: boolean) => void
  onOpenReview: () => void
}) {
  const tone = TONES[outcome?.tone ?? 'idle']
  const claims = preview?.phase === 'ready' ? summariseClaims(preview.ledger) : []
  const reviewableClaims = claims.filter(c => c.reachedReview)
  const notReviewableCount = claims.length - reviewableClaims.length

  return (
    <li className="relative">
      <span className={`absolute -left-[1.8125rem] top-6 h-2.5 w-2.5 rounded-full ring-4 ${tone.dot}`} aria-hidden />
      <details
        className={`group overflow-hidden rounded-2xl border bg-white transition-colors ${tone.card} ${
          isSelected ? 'ring-2 ring-zinc-900/10' : ''
        }`}
        open={isOpen}
        onToggle={event => onToggle((event.target as HTMLDetailsElement).open)}
      >
        <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <OutcomeIcon tone={outcome?.tone ?? 'idle'} className={`mt-0.5 h-5 w-5 shrink-0 ${tone.icon}`} />

          <div className="min-w-0 flex-1">
            {/* The billing period is what the client thinks in — it titles the card. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold tracking-tight text-zinc-900">
                {formatPeriod(item.periodStart, item.periodEnd)}
              </h3>
              {justFinished && (
                <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Just finished
                </span>
              )}
              {isLatest && !justFinished && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                  Latest
                </span>
              )}
              {isSelected && !isLatest && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                  Shown above
                </span>
              )}
            </div>

            {/* The outcome, in the client's words. */}
            <p className={`mt-1 text-[15px] font-semibold leading-snug ${tone.headline}`}>
              {outcome ? outcome.headline : 'Open this run to see what happened'}
            </p>
            {outcome?.subline && <p className="mt-0.5 text-xs leading-relaxed text-zinc-600">{outcome.subline}</p>}
          </div>

          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            <div className="hidden text-right sm:block">
              <p className="text-[11px] text-zinc-500">{formatClock(item.startedAt)}</p>
              <p className="text-[10px] text-zinc-400">{describeRunMode(item.mode)}</p>
            </div>
            <Chevron />
          </div>
        </summary>

        <div className={`border-t border-zinc-100 px-4 py-3.5 ${tone.wash}`}>
          {outcome && (outcome.visitsIn !== null || outcome.claimsReady > 0 || outcome.visitsBlocked > 0) && (
            <div className="flex flex-wrap gap-2">
              {outcome.visitsIn !== null && (
                <Stat value={outcome.visitsIn} label="visits in" className="bg-white text-zinc-700 ring-1 ring-zinc-200" />
              )}
              {/* A bare "0 ready to review" on a run that never got that far
                  is noise; it only earns its place next to a real number. */}
              {(outcome.claimsReady > 0 || outcome.visitsBlocked > 0) && (
                <Stat value={outcome.claimsReady} label="ready to review" className="bg-emerald-100 text-emerald-900" />
              )}
              {outcome.visitsBlocked > 0 && (
                <Stat value={outcome.visitsBlocked} label="visits held back" className="bg-amber-100 text-amber-900" />
              )}
              {outcome.claimsFailed > 0 && (
                <Stat value={outcome.claimsFailed} label="claims unfinished" className="bg-red-100 text-red-900" />
              )}
            </div>
          )}

          {outcome && outcome.reasons.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Why visits were held back</p>
              <ul className="mt-1.5 space-y-1">
                {outcome.reasons.map(reason => (
                  <li key={reason.code} className="flex items-baseline gap-2 text-xs text-zinc-700">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${tone.pill}`}>
                      {reason.count}
                    </span>
                    <span className="first-letter:uppercase">{reason.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Claims needing review</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Every claim in this run that reached HCPF review. Nothing is submitted — review the fields and
              screenshot, then approve.
            </p>
            <div className="mt-1.5">
              {preview === undefined || preview.phase === 'loading' ? (
                <p className="text-xs text-zinc-400">Loading claims…</p>
              ) : preview.phase === 'error' ? (
                <p className="text-xs text-red-700">Could not load this run&apos;s claims.</p>
              ) : claims.length === 0 ? (
                <p className="text-xs text-zinc-500">No claims were built in this run.</p>
              ) : reviewableClaims.length > 0 ? (
                <ClaimsByMember
                  runId={item.runId}
                  claims={reviewableClaims}
                  approvals={preview.approvals}
                  canApprove={canApprove}
                />
              ) : (
                <p className="text-xs text-zinc-500">No claims reached review in this run.</p>
              )}
            </div>
            {preview?.phase === 'ready' && notReviewableCount > 0 && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {notReviewableCount} claim{notReviewableCount === 1 ? '' : 's'} in this run did not reach HCPF
                review — see technical detail for why.
              </p>
            )}
          </div>

          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={onOpenReview}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Open full review →
            </button>
            {/* Plumbing, deliberately last and deliberately quiet. */}
            <span className="font-mono text-[10px] text-zinc-400">ref {item.runId.slice(0, 8)}</span>
          </div>
        </div>
      </details>
    </li>
  )
}

/* ------------------------------------------------------------------ *
 * The history
 * ------------------------------------------------------------------ */

/**
 * Run history for a non-technical reader: grouped by day, one outcome-first
 * card per run, billing period as the card title, and every machine code
 * translated (lib/mohamedRunSummary.ts) before it reaches the screen. No run
 * ids, event counts, modes or sources in the primary view — the previous
 * flat table was engineer UI (Andy, 2026-08-25).
 *
 * Cards are native <details>, newest expanded by default. Each card's own
 * "Claims needing review" grouping (ClaimsByMember/ClaimReviewCard — member
 * grouping, step viewer, approve/reject) lives inside it, so there is no
 * separate global claims section to fall out of sync with the run it belongs
 * to (Andy, 2026-08-25). "Open full review →" still opens the same content
 * in RunDetailPanel for a focused, full-page view.
 */
export function RunHistory({
  history,
  selectedRunId,
  canApprove = false,
  degraded = false,
  nowIso,
  inFlight = null,
  inFlightDegraded = false,
}: {
  history: RunHistoryItem[]
  selectedRunId: string
  canApprove?: boolean
  degraded?: boolean
  /** Server-supplied "now" so 'Today'/'Yesterday' render identically on the
   * server and after hydration. */
  nowIso?: string
  inFlight?: RunRequestRow | null
  /** True when THIS render's server-side in-flight query failed — distinct
   * from "there is genuinely no run happening". See MohamedDashboard for
   * why this exists. */
  inFlightDegraded?: boolean
}) {
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(history[0] ? [history[0].runId] : []))
  const [previews, setPreviews] = useState<Record<string, RunPreview>>({})
  // Smart cache for the live board's presence: a degraded server render
  // must not tear down a board that was visibly there a moment ago (Andy,
  // 2026-08-25: "things keep disappearing and reappearing... unacceptable").
  // On a good render, trust the server's answer completely — including a
  // genuine null (the run really did finish). Only a DEGRADED render falls
  // back to whatever we last knew, so a real "run finished" still clears
  // the board promptly instead of sticking around forever.
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
        setPreviews(prev => ({ ...prev, [runId]: { phase: 'ready', ledger: data.ledger, approvals: data.approvals ?? {} } }))
      })
      .catch(() => setPreviews(prev => ({ ...prev, [runId]: { phase: 'error' } })))
  }

  function toggle(runId: string, nowOpen: boolean) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (nowOpen) {
        next.add(runId)
        loadPreview(runId)
      } else {
        next.delete(runId)
      }
      return next
    })
  }

  const newestRunId = history[0]?.runId ?? ''
  // The newest run starts expanded (its claims must be immediately visible,
  // not just on manual toggle) but the native <details open> never fires a
  // toggle event for that initial state -- only loadPreview's normal path,
  // triggered from toggle(), would otherwise run. Load it explicitly once.
  useEffect(() => {
    if (newestRunId) loadPreview(newestRunId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestRunId])
  const groups = groupRunsByDay(history, now)

  return (
    <section id="run-history" data-section="history" className="scroll-mt-4 mt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900">Run history</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            One card per upload, newest first. Open a card to see the claims it produced.
          </p>
        </div>
        {history.length > 0 && (
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-600">
            {history.length} run{history.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* A run happening right now sits at the head of the same timeline, so
          it is visibly the thing that becomes the next card. */}
      {effectiveInFlight && !degraded && (
        <div className="mb-4 rounded-2xl border border-emerald-300 bg-white p-4 shadow-[0_0_0_4px_rgba(16,185,129,0.08)]">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <h3 className="text-sm font-semibold text-zinc-900">A run is happening right now</h3>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            It will appear at the top of this list, marked &ldquo;Just finished&rdquo;, as soon as it is done.
          </p>
          {/* Per-member board while the run works, coarse step bar as its
              own fallback (LiveRunBoard renders RunProgress itself when no
              live board is available). Keyed by requestId so React never
              remounts this component across polls that report the SAME
              run — LiveRunBoard's own poll loop is the source of truth for
              live state, not this parent's refresh cadence. */}
          <LiveRunBoard key={effectiveInFlight.id} progress={effectiveInFlight.progress} requestId={effectiveInFlight.id} />
        </div>
      )}

      {degraded ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-xs text-amber-800">
          Reconnecting… this list refreshes automatically. Nothing is lost.
        </p>
      ) : history.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-xs text-zinc-500">
          No runs yet. Upload a CSV above and the first run will appear here.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.day}>
              <div className="mb-2.5 flex items-center gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{group.label}</h3>
                <span className="h-px flex-1 bg-zinc-200" />
                <span className="text-[11px] text-zinc-400">
                  {group.runs.length} run{group.runs.length === 1 ? '' : 's'}
                </span>
              </div>
              <ol className="space-y-3 border-l border-zinc-200 pl-6">
                {group.runs.map(item => (
                  <RunCard
                    key={item.runId}
                    item={item}
                    outcome={
                      item.outcome ??
                      (previews[item.runId]?.phase === 'ready'
                        ? runOutcomeFromLedger((previews[item.runId] as { ledger: RunLedgerSnapshot }).ledger)
                        : null)
                    }
                    isOpen={expanded.has(item.runId)}
                    isLatest={item.runId === newestRunId}
                    isSelected={item.runId === selectedRunId}
                    justFinished={isRecent(item.finishedAt ?? item.startedAt, now)}
                    preview={previews[item.runId]}
                    canApprove={canApprove}
                    onToggle={open => toggle(item.runId, open)}
                    onOpenReview={() => setOpenRunId(item.runId)}
                  />
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {openRunId && <RunDetailPanel runId={openRunId} canApprove={canApprove} onClose={() => setOpenRunId(null)} />}
    </section>
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
