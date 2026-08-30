'use client'

import { useEffect, useState } from 'react'
import type { PipelineRange } from '@/lib/djcTypes'

interface Row {
  person: string | null
  job: string | null
  stage: string | null
  specialty: string | null
  created: string | null
  reached: string | null
  auto: boolean
}

const RANGE_LABEL: Record<PipelineRange, string> = {
  '7d': 'past 7 days',
  '30d': 'past month',
  all: 'all time',
}

/**
 * The applications behind one funnel stage.
 *
 * Fetched on open rather than shipped with the page: the all-time funnel covers ~3,000 rows across
 * five stages, and loading every stage up front to support a click most people never make would
 * make the page slower for everyone.
 */
export default function FunnelDrill({
  stage, range, onClose,
}: {
  stage: string
  range: PipelineRange
  onClose: () => void
}) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    setRows(null)
    setFailed(false)
    fetch(`/api/djc/funnel?stage=${encodeURIComponent(stage)}&range=${range}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => live && setRows(d.rows ?? []))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [stage, range])

  // Escape closes, matching the rest of the app's overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/40 dark:bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
         onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900 shadow-2xl sm:rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 px-5 py-4">
          <div>
            <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">
              Reached “{stage}” · {RANGE_LABEL[range]}
            </h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {rows === null && !failed
                ? 'Loading…'
                : failed
                  ? 'Could not load these rows.'
                  : `${rows!.length.toLocaleString()} application${rows!.length === 1 ? '' : 's'}` +
                    (rows!.length >= 300 ? ' (showing the most recent 300)' : '')}
              {' · ⚡ = sourced by the automation'}
            </p>
          </div>
          <button onClick={onClose}
                  className="shrink-0 rounded-md px-2 py-1 text-[12px] text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-800 dark:text-zinc-200">
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {failed ? (
            <p className="px-5 py-8 text-center text-[12px] text-amber-700 dark:text-amber-300/80">
              The database was busy. Close and try again in a few seconds.
            </p>
          ) : rows === null ? (
            <p className="px-5 py-8 text-center text-[12px] text-zinc-500 dark:text-zinc-600">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-[12px] text-zinc-500 dark:text-zinc-600">
              No applications reached this stage in this window.
            </p>
          ) : (
            <table className="w-full min-w-[640px] text-[12px]">
              <thead className="sticky top-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur">
                <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
                  <th className="px-5 py-2 font-medium">Candidate</th>
                  <th className="py-2 pr-4 font-medium">Specialty</th>
                  <th className="py-2 pr-4 font-medium">Job</th>
                  <th className="py-2 pr-4 font-medium">Current stage</th>
                  <th className="py-2 pr-5 text-right font-medium">Reached this stage</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800/70 dark:hover:bg-zinc-800/30">
                    <td className="whitespace-nowrap px-5 py-2 font-medium text-zinc-800 dark:text-zinc-200">
                      {r.auto && <span title="sourced by the automation">⚡ </span>}
                      {r.person ?? '—'}
                    </td>
                    <td className="py-2 pr-4 text-zinc-500">{r.specialty ?? '—'}</td>
                    <td className="max-w-56 truncate py-2 pr-4 text-zinc-500">{r.job ?? '—'}</td>
                    <td className="whitespace-nowrap py-2 pr-4 text-zinc-600 dark:text-zinc-400">{r.stage ?? '—'}</td>
                    <td className="whitespace-nowrap py-2 pr-5 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                      {r.reached ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
