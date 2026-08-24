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
 * disorienting mid-review. The /mohamed?run=<id> deep link still exists and
 * is offered at the bottom as "Open full report".
 */
export function RunDetailPanel({ runId, onClose }: { runId: string; onClose: () => void }) {
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
    return () => {
      cancelled = true
    }
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
  const badge = ledger ? statusBadge[ledger.status] : null
  const claims = ledger ? summariseClaims(ledger) : []
  const gapAlert = ledger ? coverageGapAlert(ledger) : null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Run detail">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl sm:max-w-lg">
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-3">
          <h3 className="text-sm font-semibold">
            Run <span className="font-mono text-xs text-zinc-500">{runId.slice(0, 12)}</span>
          </h3>
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

              {/* Coverage-gap alert — same loud red treatment as the dashboard:
                  these visits are never billed, but that must stay visible. */}
              {gapAlert && (
                <div className="rounded-xl border border-red-300 bg-red-50 p-4">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5" aria-hidden>⚠️</span>
                    <div>
                      <p className="text-xs font-semibold text-red-900">
                        {gapAlert.visitsNeverBilled} visit{gapAlert.visitsNeverBilled === 1 ? '' : 's'} NOT billed — missing required coverage
                      </p>
                      <p className="mt-1 text-xs text-red-800">
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

              <div>
                <p className="mb-2 text-xs font-medium text-zinc-500">Claims</p>
                {claims.length === 0 && <p className="text-xs text-zinc-400">No claims in this run.</p>}
                <ul className="space-y-1.5">
                  {claims.map(claim => {
                    const approval = state.phase === 'ready' ? state.approvals[claim.claimRef] : undefined
                    return (
                      <li key={claim.claimRef} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs">
                        <span className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${claim.reachedReview ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <span className="font-medium">
                            {claim.procedureCode ? claim.procedureCode.toUpperCase() : 'Claim'}
                          </span>
                          <span className="font-mono text-[10px] text-zinc-400">{claim.claimRef.slice(0, 8)}</span>
                        </span>
                        <span className="text-zinc-500">
                          {approval?.decision === 'rejected'
                            ? 'Rejected'
                            : approval?.decision === 'approved'
                              ? 'Approved'
                              : claim.reachedReview
                                ? 'Reached review'
                                : 'Did not reach review'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 border-t border-zinc-200 bg-white px-5 py-3">
          <a href={`/mohamed?run=${runId}`} className="text-xs font-medium text-emerald-700 hover:underline">
            Open full report →
          </a>
        </div>
      </aside>
    </div>
  )
}
