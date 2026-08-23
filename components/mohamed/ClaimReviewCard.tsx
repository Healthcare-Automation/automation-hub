'use client'

import { useState } from 'react'
import type { ClaimTrace } from '@/lib/mohamedLedger'
import type { ClaimApproval } from '@/lib/mohamedApprovals'

function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

type ReviewState = 'idle' | 'loading' | 'missing' | 'error' | 'ready'

/**
 * One claim, one card: what it is, the full field list + screenshot
 * captured right before HCPF Review, and the approve/un-approve control.
 *
 * Approving here only records intent (mohamed_claim_approvals) — there is
 * no live submission path yet, so nothing is sent to HCPF when this is
 * clicked. Built so the workflow is ready the moment submission exists.
 */
export function ClaimReviewCard({
  runId,
  claim,
  approval,
  canApprove,
}: {
  runId: string
  claim: ClaimTrace
  approval: ClaimApproval | null
  canApprove: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [state, setState] = useState<ReviewState>('idle')
  const [fields, setFields] = useState<{ label: string; value: string }[]>([])
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [approved, setApproved] = useState(approval?.approved ?? false)
  const [approvedBy, setApprovedBy] = useState(approval?.approvedBy ?? null)
  const [busy, setBusy] = useState(false)

  async function load() {
    if (state === 'ready' || state === 'loading') return
    setState('loading')
    try {
      const tokenRes = await fetch('/api/mohamed/review-token', { method: 'POST' })
      const tokenJson = await tokenRes.json()
      if (!tokenRes.ok || !tokenJson.ok || !tokenJson.uploadUrl) {
        setState('error')
        return
      }
      const uploadUrl: string = tokenJson.uploadUrl
      const fieldsRes = await fetch(`${uploadUrl}/review/${runId}/${claim.claimRef}/fields.json`, {
        headers: { Authorization: `Bearer ${tokenJson.token}` },
      })
      if (fieldsRes.status === 404) {
        setState('missing')
        return
      }
      if (!fieldsRes.ok) {
        setState('error')
        return
      }
      const payload = await fieldsRes.json()
      setFields(Array.isArray(payload.fields) ? payload.fields : [])

      const shotTokenRes = await fetch('/api/mohamed/review-token', { method: 'POST' })
      const shotTokenJson = await shotTokenRes.json()
      if (shotTokenRes.ok && shotTokenJson.ok) {
        const shotRes = await fetch(`${uploadUrl}/review/${runId}/${claim.claimRef}/screenshot.png`, {
          headers: { Authorization: `Bearer ${shotTokenJson.token}` },
        })
        if (shotRes.ok) {
          const blob = await shotRes.blob()
          setScreenshotUrl(URL.createObjectURL(blob))
        }
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

  async function setApproval(next: boolean) {
    setBusy(true)
    try {
      const res = await fetch('/api/mohamed/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, claimRef: claim.claimRef, approved: next }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setApproved(next)
        setApprovedBy(next ? 'you' : null)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50"
      >
        <div className="flex items-center gap-3">
          <span className={`h-2 w-2 rounded-full ${claim.reachedReview ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <div>
            <p className="text-sm font-medium text-zinc-900">
              {claim.procedureCode ? claim.procedureCode.toUpperCase() : 'Claim'}
              {claim.modifiers && claim.modifiers !== 'none' && (
                <span className="ml-1 font-normal text-zinc-500">· {claim.modifiers.replaceAll('_', ', ').toUpperCase()}</span>
              )}
            </p>
            <p className="text-xs text-zinc-500">
              {claim.unitsX100 != null ? `${(claim.unitsX100 / 100).toFixed(2)} units` : ''}
              {claim.chargeCents != null ? ` · ${money(claim.chargeCents)}` : ''}
              {!claim.reachedReview && ' · did not reach review'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {approved ? (
            <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white">Approved</span>
          ) : (
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-500">Needs review</span>
          )}
          <span className="text-xs text-zinc-400">{expanded ? 'Hide' : 'Review'}</span>
        </div>
      </button>

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
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
              <p className="text-xs text-zinc-600">
                {approved
                  ? `Approved${approvedBy ? ` by ${approvedBy}` : ''}. Nothing is submitted automatically — submission is not built yet.`
                  : 'Review the fields and screenshot above, then approve if this looks right.'}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => setApproval(!approved)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                  approved ? 'bg-white text-zinc-700 border border-zinc-300 hover:bg-zinc-100' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {approved ? 'Un-approve' : 'Approve'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
