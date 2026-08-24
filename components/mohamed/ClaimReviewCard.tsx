'use client'

import { useEffect, useState } from 'react'
import type { ClaimTrace } from '@/lib/mohamedLedger'
import type { ClaimApproval } from '@/lib/mohamedApprovals'

function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

type ReviewState = 'idle' | 'loading' | 'missing' | 'error' | 'ready'
type Decision = 'approved' | 'rejected' | null

type ReviewField = { label: string; value: string }

// One review token minted per page render and shared across every card —
// runs have ≤10 claims and each card needs fields.json at mount, so this
// avoids 10 identical token round trips. Cleared on failure so a retry
// (expand) can mint a fresh one.
let tokenPromise: Promise<{ token: string; uploadUrl: string }> | null = null

function getReviewToken(): Promise<{ token: string; uploadUrl: string }> {
  if (!tokenPromise) {
    tokenPromise = (async () => {
      const res = await fetch('/api/mohamed/review-token', { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.ok || !json.uploadUrl) throw new Error('token_unavailable')
      return { token: json.token as string, uploadUrl: json.uploadUrl as string }
    })()
    tokenPromise.catch(() => {
      tokenPromise = null
    })
  }
  return tokenPromise
}

// fields.json per claim, cached so mount (member id headline) and expand
// (full field list) share one fetch. null = artifact missing (404).
const fieldsCache = new Map<string, Promise<ReviewField[] | null>>()

function getClaimFields(runId: string, claimRef: string): Promise<ReviewField[] | null> {
  const key = `${runId}/${claimRef}`
  let cached = fieldsCache.get(key)
  if (!cached) {
    cached = (async () => {
      const { token, uploadUrl } = await getReviewToken()
      const res = await fetch(`${uploadUrl}/review/${runId}/${claimRef}/fields.json`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 404) return null
      if (!res.ok) throw new Error('fields_unavailable')
      const payload = await res.json()
      return Array.isArray(payload.fields) ? (payload.fields as ReviewField[]) : []
    })()
    cached.catch(() => {
      fieldsCache.delete(key)
    })
    fieldsCache.set(key, cached)
  }
  return cached
}

const MEMBER_ID_LABEL = /member.?id/i

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
  const [decision, setDecision] = useState<Decision>(approval?.decision ?? (approval?.approved ? 'approved' : null))
  const [reason, setReason] = useState<string | null>(approval?.reason ?? null)
  const [decidedBy, setDecidedBy] = useState<string | null>(approval?.approvedBy ?? null)
  const [rejecting, setRejecting] = useState(false)
  const [reasonDraft, setReasonDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [decisionError, setDecisionError] = useState<string | null>(null)

  // Fetch fields.json at mount purely for the member-id headline. Best
  // effort: any failure just leaves the procedure-code headline in place —
  // the card must never block on this.
  useEffect(() => {
    let cancelled = false
    getClaimFields(runId, claim.claimRef)
      .then(loaded => {
        if (cancelled || !loaded) return
        const field = loaded.find(f => MEMBER_ID_LABEL.test(f.label))
        if (field?.value) setMemberId(field.value)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [runId, claim.claimRef])

  async function load() {
    if (state === 'ready' || state === 'loading') return
    setState('loading')
    try {
      const loaded = await getClaimFields(runId, claim.claimRef)
      if (loaded === null) {
        setState('missing')
        return
      }
      setFields(loaded)

      try {
        const { token, uploadUrl } = await getReviewToken()
        const shotRes = await fetch(`${uploadUrl}/review/${runId}/${claim.claimRef}/screenshot.png`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (shotRes.ok) {
          const blob = await shotRes.blob()
          setScreenshotUrl(URL.createObjectURL(blob))
        }
      } catch {
        // Screenshot is optional; the field list alone is still reviewable.
      }
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

  const secondary = [
    claim.procedureCode ? claim.procedureCode.toUpperCase() : null,
    claim.modifiers && claim.modifiers !== 'none' ? claim.modifiers.replaceAll('_', ', ').toUpperCase() : null,
    claim.unitsX100 != null ? `${(claim.unitsX100 / 100).toFixed(2)} units` : null,
    claim.chargeCents != null ? money(claim.chargeCents) : null,
  ].filter(Boolean)

  return (
    <div className={`overflow-hidden rounded-xl border bg-white ${decision === 'rejected' ? 'border-red-300' : 'border-zinc-200'}`}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50"
      >
        <div className="flex items-center gap-3">
          <span className={`h-2 w-2 rounded-full ${claim.reachedReview ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <div>
            <p className="text-sm font-medium text-zinc-900">
              {/* Member ID is the headline — that's how Mohamed identifies
                  claims. Falls back to procedure code while (or if) the
                  fields.json fetch hasn't produced one. */}
              {memberId ? `Member ${memberId}` : claim.procedureCode ? claim.procedureCode.toUpperCase() : 'Claim'}
              {!memberId && claim.modifiers && claim.modifiers !== 'none' && (
                <span className="ml-1 font-normal text-zinc-500">· {claim.modifiers.replaceAll('_', ', ').toUpperCase()}</span>
              )}
            </p>
            <p className="text-xs text-zinc-500">
              {memberId
                ? secondary.join(' · ')
                : [
                    claim.unitsX100 != null ? `${(claim.unitsX100 / 100).toFixed(2)} units` : null,
                    claim.chargeCents != null ? money(claim.chargeCents) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
              {!claim.reachedReview && ' · did not reach review'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {decision === 'approved' && (
            <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white">Approved</span>
          )}
          {decision === 'rejected' && (
            <span className="rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white">Rejected</span>
          )}
          {decision === null && (
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-500">Needs review</span>
          )}
          <span className="text-xs text-zinc-400">{expanded ? 'Hide' : 'Review'}</span>
        </div>
      </button>

      {approvalDegraded && (
        <p className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Reconnecting to the approvals database — any existing decision on this claim isn&apos;t shown yet, refreshes automatically.
        </p>
      )}

      {/* A rejection reason stays visible even collapsed — it's the whole
          point of the feedback loop. */}
      {decision === 'rejected' && reason && !expanded && (
        <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-800">
          Rejected{decidedBy ? ` by ${decidedBy}` : ''}: {reason}
        </p>
      )}

      {expanded && (
        <div className="border-t border-zinc-200 px-4 py-4">
          {state === 'loading' && <p className="text-sm text-zinc-500">Loading…</p>}
          {state === 'missing' && <p className="text-sm text-zinc-500">No capture exists for this claim yet.</p>}
          {state === 'error' && <p className="text-sm text-red-700">Could not load the capture. Try again.</p>}
          {state === 'ready' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-500">Fields as entered on HCPF</p>
                <dl className="max-h-96 space-y-1 overflow-y-auto text-xs">
                  {fields.map((field, index) => (
                    <div key={index} className="flex justify-between gap-2 border-b border-zinc-100 py-1">
                      <dt className="text-zinc-500">{field.label}</dt>
                      <dd className="text-right font-medium">{field.value}</dd>
                    </div>
                  ))}
                  {fields.length === 0 && <p className="text-zinc-400">No fields captured.</p>}
                </dl>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-500">Screenshot</p>
                {screenshotUrl ? (
                  <img src={screenshotUrl} alt="HCPF claim form screenshot" className="rounded-lg border border-zinc-200" />
                ) : (
                  <p className="text-xs text-zinc-400">No screenshot captured.</p>
                )}
              </div>
            </div>
          )}

          {canApprove && claim.reachedReview && (
            <div className={`mt-4 rounded-lg border px-3 py-2.5 ${decision === 'rejected' ? 'border-red-200 bg-red-50' : 'border-zinc-200 bg-zinc-50'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className={`text-xs ${decision === 'rejected' ? 'text-red-800' : 'text-zinc-600'}`}>
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
                      className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  )}
                  {decision !== null && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => sendDecision('clear')}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
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
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs focus:border-red-400 focus:outline-none"
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setRejecting(false)
                        setReasonDraft('')
                      }}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900"
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

              {decisionError && <p className="mt-2 text-xs text-red-700">{decisionError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
