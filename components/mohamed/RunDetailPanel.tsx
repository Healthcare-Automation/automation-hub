'use client'

import { useEffect, useState } from 'react'
import {
  STAGE_LABELS,
  coverageGapAlert,
  summariseClaims,
  summariseInPlainLanguage,
  type RunLedgerSnapshot,
} from '@/lib/mohamedLedger'
import type { ClaimApproval } from '@/lib/mohamedApprovals'
import { ClaimsByMember } from './ClaimsByMember'

const statusBadge: Record<RunLedgerSnapshot['status'], { classes: string; label: string }> = {
  review_ready: { classes: 'bg-emerald-600 text-white', label: 'Ready for review' },
  blocked: { classes: 'bg-amber-500 text-white', label: 'Needs attention' },
  failed: { classes: 'bg-red-600 text-white', label: 'Stopped' },
}

const stageChip: Record<string, string> = {
  passed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  blocked: 'bg-amber-50 text-amber-800 border-amber-200',
  failed: 'bg-red-50 text-red-800 border-red-200',
  not_run: 'bg-zinc-50 text-zinc-400 border-zinc-200',
}

function when(iso: string | null) {
  if (!iso) return '—'
  return iso.replace('T', ' ').slice(0, 16) + ' UTC'
}

type PanelState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; ledger: RunLedgerSnapshot; approvals: Record<string, ClaimApproval> }

/**
 * Slide-over run drill-down: clicking a run in the history table opens this
 * panel in place instead of navigating away — a full page reload was
 * disorienting mid-review.
 *
 * This is a COMPLETE review surface (Andy 2026-08-24: "I want to see every
 * detail for every run. I want to be able to check off and review every case
 * for each patient ID."): every claim renders as the same ClaimReviewCard
 * used on the dashboard — member-ID headline, expandable full field list +
 * HCPF screenshot, approve / reject-with-reason — so nothing requires
 * leaving the panel. The /mohamed?run=<id> deep link remains as a
 * full-page fallback.
 */
export function RunDetailPanel({
  runId,
  canApprove,
  onClose,
}: {
  runId: string
  canApprove: boolean
  onClose: () => void
}) {
  const [state, setState] = useState<PanelState>({ phase: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ phase: 'loading' })
    fetch(`/api/mohamed/run/${runId}`)
      .then(async res => {
        const data = await res.json()
        if (cancelled) return
        if (!res.ok || !data.ok || !data.ledger) {
          setState({ phase: 'error' })
          return
        }
        setState({ phase: 'ready', ledger: data.ledger, approvals: data.approvals ?? {} })
      })
      .catch(() => {
        if (!cancelled) setState({ phase: 'error' })
      })
  }, [runId])

  // Escape closes, like any well-behaved overlay.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const ledger = state.phase === 'ready' ? state.ledger : null
  const approvals = state.phase === 'ready' ? state.approvals : {}
  const badge = ledger ? statusBadge[ledger.status] : null
  const claims = ledger ? summariseClaims(ledger) : []
  const reviewable = claims.filter(c => c.reachedReview)
  const notReviewable = claims.filter(c => !c.reachedReview)
  const gapAlert = ledger ? coverageGapAlert(ledger) : null
  const decidedCount = reviewable.filter(c => {
    const a = approvals[c.claimRef]
    return a?.decision === 'rejected' || a?.decision === 'approved' || a?.approved
  }).length

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Run detail">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl lg:max-w-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold">
              Run <span className="font-mono text-xs text-zinc-500">{runId.slice(0, 12)}</span>
            </h3>
            {ledger && reviewable.length > 0 && (
              <p className="text-[11px] text-zinc-500">
                {decidedCount} of {reviewable.length} claim{reviewable.length === 1 ? '' : 's'} reviewed
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
            Close ✕
          </button>
        </div>

        <div className="flex-1 px-5 py-4">
          {state.phase === 'loading' && <p className="text-sm text-zinc-500">Loading run…</p>}
          {state.phase === 'error' && (
            <p className="text-sm text-red-700">
              Could not load this run. <a href={`/mohamed?run=${runId}`} className="underline">Open the full report</a> instead.
            </p>
          )}

          {ledger && badge && (
            <div className="space-y-4">
              {/* Plain language first — same principle as the dashboard hero. */}
              <p className="text-sm font-medium text-zinc-900">{summariseInPlainLanguage(ledger)}</p>

              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.classes}`}>{badge.label}</span>
                <span>{ledger.period_start} → {ledger.period_end}</span>
              </div>
              <div className="text-xs text-zinc-500">
                Started {when(ledger.started_at)} · Finished {when(ledger.finished_at)}
              </div>

              {/* Coverage-gap alert — client decision 2026-08-24: expected,
                  working-as-designed behaviour per Mohamed's own billing
                  rule, not a system failure. Matches the dashboard hero's
                  informational (amber, not red) treatment — Andy, 2026-08-25:
                  "when things are missing coverage, the platform
                  sentimentally freaks out... make it more subtle." */}
              {gapAlert && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 text-base text-amber-600" aria-hidden>ⓘ</span>
                    <div>
                      <p className="text-xs font-semibold text-amber-900">
                        {gapAlert.visitsNeverBilled} visit{gapAlert.visitsNeverBilled === 1 ? '' : 's'} excluded — working as designed, per your rule
                      </p>
                      <p className="mt-1 text-xs text-amber-800">
                        {gapAlert.membersAffected} client{gapAlert.membersAffected === 1 ? '' : 's'} in this run{' '}
                        {gapAlert.membersAffected === 1 ? 'is' : 'are'} missing one of the two required coverages
                        (HCBS EBD Waiver / Community First Choice). Per your decision these visits are never billed
                        until both coverages appear.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-medium text-zinc-500">Stages</p>
                <div className="flex flex-wrap gap-1.5">
                  {ledger.stages.map(stage => (
                    <span
                      key={stage.stage}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${stageChip[stage.status] ?? stageChip.not_run}`}
                    >
                      {STAGE_LABELS[stage.stage]}
                      {stage.status !== 'not_run' && ` · ${stage.status}`}
                    </span>
                  ))}
                </div>
              </div>

              {/* Full review, in place: the same cards as the dashboard —
                  member-ID headline, expandable fields + screenshot,
                  approve / reject with reason. */}
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-500">
                  Claims needing review
                  {reviewable.length > 0 && ` (${reviewable.length})`}
                </p>
                {claims.length === 0 && <p className="text-xs text-zinc-400">No claims in this run.</p>}
                {reviewable.length > 0 && (
                  <ClaimsByMember runId={ledger.run_id} claims={reviewable} approvals={approvals} canApprove={canApprove} />
                )}
                {notReviewable.length > 0 && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                    {notReviewable.length} claim{notReviewable.length === 1 ? '' : 's'} did not reach HCPF review — open the
                    full report&apos;s technical detail for the exact failure step.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 border-t border-zinc-200 bg-white px-5 py-3 text-xs text-zinc-500">
          <a href={`/mohamed?run=${runId}`} className="font-medium text-emerald-700 hover:underline">
            Open as full page →
          </a>
          <span className="ml-2">(same content, shareable link)</span>
        </div>
      </aside>
    </div>
  )
}
