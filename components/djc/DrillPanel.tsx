'use client'

import { useEffect, useState } from 'react'
import type { DrillDetail } from '@/lib/djcStory'

const SF_CONTACT = 'https://proxi.lightning.force.com/lightning/r/Contact'

export type DrillTarget =
  | { kind: 'funnel'; stage: 'apps' | 'submitted' | 'placed' }
  | { kind: 'specialty'; specialty: string; side: 'matched' | 'unmatched' }

const toQuery = (t: DrillTarget) =>
  t.kind === 'funnel'
    ? `kind=funnel&stage=${t.stage}`
    : `kind=specialty&specialty=${encodeURIComponent(t.specialty)}&side=${t.side}`

/**
 * The people behind any Overview bar — funnel stage or supply-vs-demand row.
 *
 * Same shape as the placements panel: the summary is pinned at the top and only the rows scroll, so
 * the number that prompted the click stays on screen while you read the list. Every person links
 * straight to their Salesforce record, because the usual next question after "who are they" is
 * "open them".
 */
export default function DrillPanel({ target, onClose }: { target: DrillTarget; onClose: () => void }) {
  const [data, setData] = useState<DrillDetail | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    setData(null)
    setFailed(false)
    fetch(`/api/djc/drill?${toQuery(target)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => live && setData(d))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [target])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const showJob = data?.rows.some(r => r.job)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col border-l border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-zinc-100">
              {data?.title ?? 'Loading…'}
            </h3>
            {data && <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{data.subtitle}</p>}
          </div>
          <button onClick={onClose}
                  className="shrink-0 rounded-md px-2 py-1 text-[12px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
            Close
          </button>
        </div>

        {failed ? (
          <p className="px-5 py-10 text-center text-[12px] text-amber-300/80">
            The database was busy. Close and try again in a few seconds.
          </p>
        ) : !data ? (
          <p className="px-5 py-10 text-center text-[12px] text-zinc-600">Loading…</p>
        ) : (
          <>
            <div className="shrink-0 border-b border-zinc-800 px-5 py-4">
              <div className="flex items-end gap-6">
                <div>
                  <p className="text-[34px] leading-none font-semibold tabular-nums text-cyan-300">
                    {data.headline.value}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">{data.headline.label}</p>
                </div>
                <div className="mb-0.5 flex gap-5">
                  {data.facts.map(f => (
                    <div key={f.label}>
                      <p className="text-[15px] font-semibold tabular-nums text-zinc-200">{f.value}</p>
                      <p className="mt-0.5 text-[10px] leading-tight text-zinc-500">{f.label}</p>
                      {f.hint && <p className="text-[10px] leading-tight text-zinc-600">{f.hint}</p>}
                    </div>
                  ))}
                </div>
              </div>
              {data.truncated && (
                <p className="mt-2.5 text-[11px] text-zinc-500">
                  Showing the most recent 500 — the total above is the real count.
                </p>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {data.rows.length === 0 ? (
                <p className="px-5 py-10 text-center text-[12px] text-zinc-600">Nothing here.</p>
              ) : (
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur">
                    <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
                      <th className="px-5 py-2 font-medium">Person</th>
                      <th className="py-2 pr-3 font-medium">Specialty</th>
                      <th className="py-2 pr-3 font-medium">{showJob ? 'Closest matching jobs' : 'Location'}</th>
                      <th className="py-2 pr-5 text-right font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={i} className="border-t border-zinc-800/70 hover:bg-zinc-800/30">
                        <td className="px-5 py-2 font-medium text-zinc-200">
                          {r.fromAutomation && <span title="sourced by the automation">⚡ </span>}
                          {r.sfId ? (
                            <a href={`${SF_CONTACT}/${r.sfId}/view`} target="_blank" rel="noreferrer"
                               title="Open in Salesforce"
                               className="text-zinc-100 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-cyan-300 hover:decoration-cyan-500">
                              {r.name ?? r.sfId}
                              <span className="ml-1 text-[9px] text-zinc-600">↗</span>
                            </a>
                          ) : (
                            (r.name ?? '—')
                          )}
                        </td>
                        <td className="py-2 pr-3 text-zinc-500">{r.specialty ?? '—'}</td>
                        <td className="max-w-64 py-2 pr-3 text-zinc-500">
                          <span className="block truncate" title={r.job ?? undefined}>
                            {showJob ? (r.job ?? '—') : (r.note ?? '—')}
                          </span>
                          {showJob && r.note && (
                            <span className="block truncate text-[10px] text-zinc-600">{r.note}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-5 text-right tabular-nums text-zinc-400">
                          {r.date ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="shrink-0 border-t border-zinc-800 px-5 py-2 text-[10px] text-zinc-600">
              Click a name to open their Salesforce record.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
