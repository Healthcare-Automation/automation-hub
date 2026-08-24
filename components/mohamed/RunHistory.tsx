'use client'

import { useState } from 'react'
import type { RunHistoryItem } from '@/lib/mohamedQueries'
import { RunReviewLink } from './RunReviewLink'
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

/**
 * Client component so a run click opens the drill-down panel in place —
 * the previous full-page navigation to /mohamed?run=<id> was disorienting.
 * That deep link still works (the panel offers it as "Open full report").
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

  return (
    <section data-section="history" className="mt-7 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-5 py-3">
        <h2 className="text-sm font-semibold">Run history</h2>
        <p className="mt-0.5 text-xs text-zinc-500">Every run is kept. Click a run to open its trace.</p>
      </div>
      {degraded ? (
        <p className="px-5 py-6 text-xs text-amber-700">Reconnecting… refreshes automatically.</p>
      ) : history.length === 0 ? (
        <p className="px-5 py-6 text-xs text-zinc-500">No runs yet.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              {['Started', 'Run', 'Mode', 'Source', 'Period', 'Events', 'Result', ''].map(label => (
                <th key={label} className="px-4 py-2 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {history.map(item => (
              <tr
                key={item.runId}
                onClick={() => setOpenRunId(item.runId)}
                className={`cursor-pointer hover:bg-emerald-50/40 ${item.runId === selectedRunId ? 'bg-zinc-50' : ''}`}
              >
                <td className="px-4 py-2 text-zinc-600">{when(item.startedAt)}</td>
                <td className="px-4 py-2 font-mono">
                  <button
                    type="button"
                    onClick={() => setOpenRunId(item.runId)}
                    className="text-emerald-700 hover:underline"
                  >
                    {item.runId.slice(0, 12)}
                  </button>
                </td>
                <td className="px-4 py-2">{item.mode.replace('_', ' ')}</td>
                <td className="px-4 py-2">{item.source.replaceAll('_', ' ')}</td>
                <td className="px-4 py-2">{item.periodStart} → {item.periodEnd}</td>
                <td className="px-4 py-2">{item.eventCount}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${statusStyles[item.status]}`}>{statusLabels[item.status]}</span>
                </td>
                <td className="px-4 py-2 text-right" onClick={event => event.stopPropagation()}>
                  <RunReviewLink runId={item.runId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {openRunId && <RunDetailPanel runId={openRunId} canApprove={canApprove} onClose={() => setOpenRunId(null)} />}
    </section>
  )
}
