'use client'

import { useEffect, useState } from 'react'
import type { ClaimTrace } from '@/lib/mohamedLedger'
import type { ClaimApproval } from '@/lib/mohamedApprovals'
import {
  extractDateRange,
  extractMemberId,
  formatReviewDate,
  getReviewFields,
  getReviewScreenshotUrl,
  getClaimSteps,
  stepDisplayLabel,
  type ClaimDateRange,
  type ReviewField,
  type StepIndexEntry,
} from '@/lib/mohamedReviewClient'

function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

type ReviewState = 'idle' | 'loading' | 'missing' | 'error' | 'ready'
type Decision = 'approved' | 'rejected' | null

/**
 * One claim, one card: what it is, the full field list + screenshot
 * captured right before HCPF Review, and the approve/reject controls.
 *
 * Headlined by Member ID (fetched from the per-claim fields.json on the
 * VPS at mount) because that is how Mohamed identifies claims — the
 * procedure code demotes to the secondary line. The member id never
 * touches the Supabase ledger, console logs, or analytics; this surface
 * is already authenticated and shows full PHI screenshots on expand.
 *
 * Deciding here only records intent (mohamed_claim_approvals) — there is
 * no live submission path yet, so nothing is sent to HCPF when this is
 * clicked. Rejections require a reason (Andy's ask) that feeds back to
 * the automation so it can learn from the errors.
 */
export function ClaimReviewCard({
  runId,
  claim,
  approval,
  approvalDegraded = false,
  canApprove,
}: {
  runId: string
  claim: ClaimTrace
  approval: ClaimApproval | null
  approvalDegraded?: boolean
  canApprove: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [state, setState] = useState<ReviewState>('idle')
  const [fields, setFields] = useState<ReviewField[]>([])
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [memberId, setMemberId] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<ClaimDateRange>(null)
  const [decision, setDecision] = useState<Decision>(approval?.decision ?? (approval?.approved ? 'approved' : null))
  const [reason, setReason] = useState<string | null>(approval?.reason ?? null)
  const [decidedBy, setDecidedBy] = useState<string | null>(approval?.approvedBy ?? null)
  const [rejecting, setRejecting] = useState(false)
  const [reasonDraft, setReasonDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [decisionError, setDecisionError] = useState<string | null>(null)

  const [steps, setSteps] = useState<StepIndexEntry[] | null>(null)
  const [selectedStep, setSelectedStep] = useState(0)

  // Fetch fields.json at mount purely for the member-id and date-range
  // headline. Best effort: any failure just leaves the procedure-code
  // headline in place -- the card must never block on this. The top-level
  // fields.json always exists once a claim reaches review or
  // fails-with-capture, whether or not it also has step captures (see
  // review_capture.capture_review).
  useEffect(() => {
    let cancelled = false
    getReviewFields(runId, claim.claimRef, '')
      .then(loaded => {
        if (cancelled) return
        const id = extractMemberId(loaded)
        if (id) setMemberId(id)
        const range = extractDateRange(loaded)
        if (range) setDateRange(range)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [runId, claim.claimRef])

  useEffect(() => {
    if (!expanded || !steps || steps.length < 2) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') selectStep(selectedStep + 1)
      if (event.key === 'ArrowLeft') selectStep(selectedStep - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, steps, selectedStep])

  async function loadStep(list: StepIndexEntry[], index: number) {
    const entry = list[index]
    const [loadedFields, shotUrl] = await Promise.all([
      getReviewFields(runId, claim.claimRef, entry.path),
      entry.has_screenshot ? getReviewScreenshotUrl(runId, claim.claimRef, entry.path) : Promise.resolve(null),
    ])
    setFields(loadedFields ?? [])
    setScreenshotUrl(shotUrl)
  }

  function selectStep(index: number) {
    if (!steps || index < 0 || index >= steps.length || index === selectedStep) return
    setSelectedStep(index)
    loadStep(steps, index).catch(() => setState('error'))
  }

  async function load() {
    if (state === 'ready' || state === 'loading') return
    setState('loading')
    try {
      const stepList = await getClaimSteps(runId, claim.claimRef)
      if (stepList) {
        setSteps(stepList)
        setSelectedStep(0)
        await loadStep(stepList, 0)
        setState('ready')
        return
      }
      setSteps(null)
      const loaded = await getReviewFields(runId, claim.claimRef, '')
      if (loaded === null) {
        setState('missing')
        return
      }
      setFields(loaded)
      setScreenshotUrl(await getReviewScreenshotUrl(runId, claim.claimRef, ''))
      setState('ready')
    } catch {
      setState('error')
    }
  }

  function toggle() {
    const next = !expanded
    setExpanded(next)
    if (next) void load()
  }

  async function sendDecision(next: 'approved' | 'rejected' | 'clear', reasonText?: string) {
    setBusy(true)
    setDecisionError(null)
    try {
      const res = await fetch('/api/mohamed/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, claimRef: claim.claimRef, decision: next, reason: reasonText }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setDecision(next === 'clear' ? null : next)
        setReason(next === 'rejected' ? (reasonText ?? null) : null)
        setDecidedBy(next === 'clear' ? null : 'you')
        setRejecting(false)
        setReasonDraft('')
      } else if (data.error === 'not_migrated') {
        setDecisionError('Rejection requires the DB migration (005_claim_reviews.sql) — ask Andy to run it.')
      } else {
        setDecisionError('Could not save the decision. Try again.')
      }
    } catch {
      setDecisionError('Could not save the decision. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const unitsLabel = claim.unitsX100 != null ? `${(claim.unitsX100 / 100).toFixed(2)} units` : null
  const amountLabel = claim.chargeCents != null ? money(claim.chargeCents) : null

  return (
    <div className={`overflow-hidden rounded-xl border bg-white dark:bg-zinc-900 ${decision === 'rejected' ? 'border-red-300' : 'border-zinc-200 dark:border-zinc-800'}`}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${claim.reachedReview ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {/* Member ID is the headline — that's how Mohamed identifies
                  claims. Falls back to procedure code while (or if) the
                  fields.json fetch hasn't produced one. */}
              {memberId ? `Member ${memberId}` : claim.procedureCode ? claim.procedureCode.toUpperCase() : 'Claim'}
            </p>
            {/* The two things that actually tell same-member, same-procedure
                claims apart at a glance -- date range and procedure code --
                as their own badges, not buried in a plain-text join (Andy,
                2026-08-27: "4 pills... we need to know that before clicking
                on them"). Everything else stays plain text alongside. */}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {dateRange && (
                <span className="inline-flex items-center rounded-md bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset">
                  {formatReviewDate(dateRange.from)} – {formatReviewDate(dateRange.to)}
                </span>
              )}
              {claim.procedureCode && (
                <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30 px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset">
                  {claim.procedureCode.toUpperCase()}
                  {claim.modifiers && claim.modifiers !== 'none' && (
                    <span className="font-normal text-violet-500 dark:text-violet-400">{claim.modifiers.replaceAll('_', ', ').toUpperCase()}</span>
                  )}
                </span>
              )}
              {(unitsLabel || amountLabel) && (
                <span className="text-[11px] text-zinc-500">{[unitsLabel, amountLabel].filter(Boolean).join(' · ')}</span>
              )}
              {!claim.reachedReview && <span className="text-[11px] font-medium text-red-600 dark:text-red-400">did not reach review</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          {decision === 'approved' && (
            <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white">Approved</span>
          )}
          {decision === 'rejected' && (
            <span className="rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white">Rejected</span>
          )}
          {decision === null && (
            <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-500">Needs review</span>
          )}
          <span className="text-xs text-zinc-400 dark:text-zinc-500">{expanded ? 'Hide' : 'Review'}</span>
        </div>
      </button>

      {approvalDegraded && (
        <p className="border-t border-amber-100 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 px-4 py-2 text-xs">
          Reconnecting to the approvals database — any existing decision on this claim isn&apos;t shown yet, refreshes automatically.
        </p>
      )}

      {/* A rejection reason stays visible even collapsed — it's the whole
          point of the feedback loop. */}
      {decision === 'rejected' && reason && !expanded && (
        <p className="border-t border-red-100 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 px-4 py-2 text-xs">
          Rejected{decidedBy ? ` by ${decidedBy}` : ''}: {reason}
        </p>
      )}

      {expanded && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-4">
          {steps && steps.length > 1 && (
            <>
              <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
                {steps.map((step, index) => (
                  <button
                    key={step.label}
                    type="button"
                    onClick={() => selectStep(index)}
                    className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                      index === selectedStep
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    {index + 1}. {stepDisplayLabel(step.label)}
                  </button>
                ))}
              </div>
              <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
                <button
                  type="button"
                  disabled={selectedStep === 0}
                  onClick={() => selectStep(selectedStep - 1)}
                  className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline disabled:pointer-events-none disabled:text-zinc-300 dark:disabled:text-zinc-600"
                >
                  ← Prev
                </button>
                <span>{stepDisplayLabel(steps[selectedStep].label)}</span>
                <button
                  type="button"
                  disabled={selectedStep === steps.length - 1}
                  onClick={() => selectStep(selectedStep + 1)}
                  className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline disabled:pointer-events-none disabled:text-zinc-300 dark:disabled:text-zinc-600"
                >
                  Next →
                </button>
              </div>
            </>
          )}
          {state === 'loading' && <p className="text-sm text-zinc-500">Loading…</p>}
          {state === 'missing' && <p className="text-sm text-zinc-500">No capture exists for this claim yet.</p>}
          {state === 'error' && <p className="text-sm text-red-700 dark:text-red-400">Could not load the capture. Try again.</p>}
          {state === 'ready' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-500">Fields as entered on HCPF</p>
                <dl className="max-h-96 space-y-1 overflow-y-auto text-xs">
                  {fields.map((field, index) => (
                    <div key={index} className="flex justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 py-1">
                      <dt className="text-zinc-500">{field.label}</dt>
                      <dd className="text-right font-medium">{field.value}</dd>
                    </div>
                  ))}
                  {fields.length === 0 && <p className="text-zinc-400">No fields captured.</p>}
                </dl>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-500">Screenshot</p>
                {!claim.reachedReview && (
                  <p className="mb-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-2.5 py-2 text-[11px] text-zinc-500">
                    This is what the portal showed when the session ended mid-claim — not a form completion.
                  </p>
                )}
                {screenshotUrl ? (
                  <img
                    src={screenshotUrl}
                    alt={claim.reachedReview ? 'HCPF claim form screenshot' : 'HCPF portal screen when the session ended'}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800"
                  />
                ) : (
                  <p className="text-xs text-zinc-400">No screenshot captured.</p>
                )}
              </div>
            </div>
          )}

          {canApprove && claim.reachedReview && (
            <div className={`mt-4 rounded-lg border px-3 py-2.5 ${decision === 'rejected' ? 'border-red-200 bg-red-50' : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className={`text-xs ${decision === 'rejected' ? 'text-red-800' : 'text-zinc-600 dark:text-zinc-400'}`}>
                  {decision === 'approved' &&
                    `Approved${decidedBy ? ` by ${decidedBy}` : ''}. Nothing is submitted automatically — submission is not built yet.`}
                  {decision === 'rejected' && `Rejected${decidedBy ? ` by ${decidedBy}` : ''}: ${reason ?? ''}`}
                  {decision === null && 'Review the fields and screenshot above, then approve or reject.'}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  {decision !== 'approved' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => sendDecision('approved')}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                  )}
                  {decision !== 'rejected' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRejecting(v => !v)}
                      className="rounded-lg border border-red-300 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  )}
                  {decision !== null && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => sendDecision('clear')}
                      className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                    >
                      Undo
                    </button>
                  )}
                </div>
              </div>

              {rejecting && decision !== 'rejected' && (
                <div className="mt-3">
                  <textarea
                    value={reasonDraft}
                    onChange={event => setReasonDraft(event.target.value)}
                    maxLength={2000}
                    rows={2}
                    placeholder="What's wrong with this claim? (no client names please)"
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-xs focus:border-red-400 focus:outline-none"
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setRejecting(false)
                        setReasonDraft('')
                      }}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy || !reasonDraft.trim()}
                      onClick={() => sendDecision('rejected', reasonDraft.trim())}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Confirm rejection
                    </button>
                  </div>
                </div>
              )}

              {decisionError && <p className="mt-2 text-xs text-red-700 dark:text-red-400">{decisionError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
