'use client'

import { useState } from 'react'
import type { RunHistoryItem } from '@/lib/mohamedQueries'
import type { RunLedgerSnapshot } from '@/lib/mohamedLedger'
import { summariseClaims } from '@/lib/mohamedLedger'
import { RunDetailPanel } from './RunDetailPanel'

const statusStyles: Record<RunHistoryItem['status'], string> = {
  review_ready: 'bg-emerald-50 text-emerald-800',
  blocked: 'bg-amber-50 text-amber-800',
  failed: 'bg-red-50 text-red-800',
}

const statusLabels: Record<RunHistoryItem['status'], string> = {
  review_ready: 'Reached review',
  blocked: 'Rows blocked',
  failed: 'Failed',
}

function when(iso: string) {
  return iso.replace('T', ' ').slice(0, 16) + ' UTC'
}

type RunPreview = { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; ledger: RunLedgerSnapshot }

/**
 * Client component so a run click opens the drill-down panel in place —
 * the previous full-page navigation to /mohamed?run=<id> was disorienting.
 * That deep link still works (the panel offers it as "Open full report").
 *
 * Collapsible by run (Andy's ask): each run is a native <details> row,
 * newest expanded by default, showing a dense claim list on open. The full
 * per-claim review experience (grouped by member, step viewer, approve/
 * reject) still lives in RunDetailPanel, opened via "Open full review".
 */
export function RunHistory({
  history,
  selectedRunId,
  canApprove = false,
  degraded = false,
}: {
  history: RunHistoryItem[]
  selectedRunId: string
  canApprove?: boolean
  degraded?: boolean
}) {
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(history[0] ? [history[0].runId] : []))
  const [previews, setPreviews] = useState<Record<string, RunPreview>>({})

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

  return (
    <section data-section="history" className="mt-7 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-5 py-3">
        <h2 className="text-sm font-semibold">Run history</h2>
        <p className="mt-0.5 text-xs text-zinc-500">Every run is kept. Click a run to see its claims, or open the full review.</p>
      </div>
      {degraded ? (
        <p className="px-5 py-6 text-xs text-amber-700">Reconnecting… refreshes automatically.</p>
      ) : history.length === 0 ? (
        <p className="px-5 py-6 text-xs text-zinc-500">No runs yet.</p>
      ) : (
        <div className="divide-y divide-zinc-100">
          {history.map(item => {
            const isOpen = expanded.has(item.runId)
            const preview = previews[item.runId]
            const claims = preview?.phase === 'ready' ? summariseClaims(preview.ledger) : []
            return (
              <details
                key={item.runId}
                open={isOpen}
                onToggle={event => toggle(item.runId, (event.target as HTMLDetailsElement).open)}
              >
                <summary
                  className={`flex cursor-pointer flex-wrap items-center gap-3 px-4 py-2.5 text-xs hover:bg-emerald-50/40 ${
                    item.runId === selectedRunId ? 'bg-zinc-50' : ''
                  }`}
                >
                  <span className="w-32 shrink-0 text-zinc-600">{when(item.startedAt)}</span>
                  <span className="w-28 shrink-0 font-mono text-zinc-700">{item.runId.slice(0, 12)}</span>
                  <span className="w-20 shrink-0">{item.mode.replace('_', ' ')}</span>
                  <span className="w-32 shrink-0">{item.source.replaceAll('_', ' ')}</span>
                  <span className="w-40 shrink-0">
                    {item.periodStart} → {item.periodEnd}
                  </span>
                  <span className="w-14 shrink-0">{item.eventCount} ev</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${statusStyles[item.status]}`}>
                    {statusLabels[item.status]}
                  </span>
                </summary>
                <div className="border-t border-zinc-100 bg-zinc-50/50 px-4 py-2.5">
                  {preview === undefined || preview.phase === 'loading' ? (
                    <p className="text-xs text-zinc-400">Loading claims…</p>
                  ) : preview.phase === 'error' ? (
                    <p className="text-xs text-red-700">Could not load this run&apos;s claims.</p>
                  ) : claims.length === 0 ? (
                    <p className="text-xs text-zinc-400">No claims in this run.</p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {claims.map(claim => (
                        <li key={claim.claimRef} className="flex items-center gap-2 text-zinc-600">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${claim.reachedReview ? 'bg-emerald-500' : 'bg-red-500'}`}
                          />
                          <span className="font-mono text-[11px] text-zinc-400">{claim.claimRef.slice(0, 8)}</span>
                          <span>{claim.procedureCode?.toUpperCase() ?? 'claim'}</span>
                          {!claim.reachedReview && <span className="text-red-600">did not reach review</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpenRunId(item.runId)}
                    className="mt-2 text-[11px] font-medium text-emerald-700 hover:underline"
                  >
                    Open full review →
                  </button>
                </div>
              </details>
            )
          })}
        </div>
      )}
      {openRunId && <RunDetailPanel runId={openRunId} canApprove={canApprove} onClose={() => setOpenRunId(null)} />}
    </section>
  )
}
