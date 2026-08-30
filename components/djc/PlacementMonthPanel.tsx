'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { PlacementMonthDetail } from '@/lib/djcStory'

/** Matches the Contact link used on the runs and insights views. */
const SF_CONTACT = 'https://proxi.lightning.force.com/lightning/r/Contact'

const monthName = (m: string) =>
  new Date(m + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const shortMonth = (m: string) =>
  new Date(m + '-02').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

/**
 * Everyone placed in one month, opened from a bar on the placements chart.
 *
 * Sits in a side panel rather than a modal: the list can run to thirty-odd rows, and a panel lets
 * the chart stay on screen so a reader can move between months without losing their place.
 *
 * The comparisons sit ABOVE the list on purpose. A month's count means nothing on its own — 17
 * reads as a collapse next to May's 30 until you know May was the record and this month is not
 * finished. Context first, then the raw rows.
 */
export default function PlacementMonthPanel({
  month, isCurrent, onClose, onNavigate,
}: {
  month: string
  isCurrent: boolean
  onClose: () => void
  onNavigate?: (month: string) => void
}) {
  const [data, setData] = useState<PlacementMonthDetail | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    setData(null)
    setFailed(false)
    fetch(`/api/djc/placements?month=${month}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => live && setData(d))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [month])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const mom = data?.prevMonth ? data.placed - data.prevMonth.placed : null
  const momPct = data?.prevMonth?.placed ? Math.round((mom! / data.prevMonth.placed) * 100) : null
  const yoy = data?.priorYear ? data.placed - data.priorYear.placed : null
  const yoyPct = data?.priorYear?.placed ? Math.round((yoy! / data.priorYear.placed) * 100) : null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-900/40 dark:bg-black/50 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col border-l border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
              Placed in {monthName(month)}
            </h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {isCurrent
                ? 'This month is still in progress — the total will keep rising.'
                : 'Everyone placed in this month.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onNavigate && (
              <>
                <button
                  onClick={() => onNavigate(shiftMonth(month, -1))}
                  className="rounded-md px-2 py-1 text-[13px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  title="Previous month"
                >
                  ‹
                </button>
                <button
                  onClick={() => onNavigate(shiftMonth(month, 1))}
                  className="rounded-md px-2 py-1 text-[13px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  title="Next month"
                >
                  ›
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="rounded-md px-2 py-1 text-[12px] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              Close
            </button>
          </div>
        </div>

        {failed ? (
          <p className="px-5 py-10 text-center text-[12px] text-amber-700 dark:text-amber-300/80">
            The database was busy. Close and try again in a few seconds.
          </p>
        ) : !data ? (
          <p className="px-5 py-10 text-center text-[12px] text-zinc-500 dark:text-zinc-600">Loading…</p>
        ) : (
          <>
            {/* Overview — fixed, so the numbers stay visible while the list scrolls */}
            <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-5 py-4">
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-[34px] leading-none font-semibold tabular-nums text-cyan-700 dark:text-cyan-300">
                    {data.placed}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    placements{data.people !== data.placed && ` · ${data.people} people`}
                  </p>
                </div>
                <div className="mb-0.5 flex gap-5">
                  <Delta
                    label={data.prevMonth ? `vs ${shortMonth(data.prevMonth.month)}` : 'vs prior month'}
                    value={mom}
                    pct={momPct}
                    was={data.prevMonth?.placed ?? null}
                    muted={isCurrent}
                  />
                  <Delta
                    label={data.priorYear ? `vs ${shortMonth(data.priorYear.month)} '${data.priorYear.month.slice(2, 4)}` : 'vs last year'}
                    value={yoy}
                    pct={yoyPct}
                    was={data.priorYear?.placed ?? null}
                    muted={isCurrent}
                  />
                </div>
              </div>

              {isCurrent && (
                <p className="mt-2.5 rounded-md border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-200/80">
                  Part-month. Comparisons against full months will read low until it closes.
                </p>
              )}

              <div className="mt-3 grid grid-cols-3 gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-3">
                <Fact label="distinct jobs" value={String(data.jobs)} />
                <Fact
                  label="typical wait to place"
                  value={data.medianWait === null ? '—' : `${data.medianWait} days`}
                  hint="from entering the CRM"
                />
                <Fact
                  label="most placed"
                  value={data.topSpecialty ? String(data.topSpecialty.count) : '—'}
                  hint={data.topSpecialty?.name ?? 'no specialty on file'}
                />
              </div>

              {data.fromAutomation > 0 && (
                <p className="mt-2.5 text-[11px] text-emerald-700 dark:text-emerald-300/80">
                  ⚡ {data.fromAutomation} of these {data.fromAutomation === 1 ? 'was' : 'were'} sourced
                  by the automation.
                </p>
              )}
            </div>

            {/* Raw rows — the scrolling region */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {data.rows.length === 0 ? (
                <p className="px-5 py-10 text-center text-[12px] text-zinc-500 dark:text-zinc-600">
                  Nobody was placed in this month.
                </p>
              ) : (
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 z-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur">
                    <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
                      <th className="px-5 py-2 font-medium">Person</th>
                      <th className="py-2 pr-3 font-medium">Specialty</th>
                      <th className="py-2 pr-3 font-medium">Job</th>
                      <th className="py-2 pr-5 text-right font-medium">Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={i} className="border-t border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800/70 dark:hover:bg-zinc-800/30">
                        <td className="px-5 py-2 font-medium text-zinc-800 dark:text-zinc-200">
                          {r.fromAutomation && <span title="sourced by the automation">⚡ </span>}
                          {r.sfId ? (
                            <a
                              href={`${SF_CONTACT}/${r.sfId}/view`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-zinc-900 dark:text-zinc-100 underline decoration-zinc-300 dark:decoration-zinc-700 underline-offset-2 transition-colors hover:text-cyan-700 dark:hover:text-cyan-300 hover:decoration-cyan-500"
                              title="Open in Salesforce"
                            >
                              {r.name ?? r.sfId}
                              <span className="ml-1 text-[9px] text-zinc-500 dark:text-zinc-600">↗</span>
                            </a>
                          ) : (
                            (r.name ?? '—')
                          )}
                          {r.waitDays !== null && (
                            <span className="ml-1.5 text-[10px] text-zinc-500 dark:text-zinc-600">
                              waited {formatWait(r.waitDays)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-zinc-500">{r.specialty ?? '—'}</td>
                        <td className="max-w-40 truncate py-2 pr-3 text-zinc-500">{r.job ?? '—'}</td>
                        <td className="whitespace-nowrap py-2 pr-5 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                          {r.placedOn?.slice(5) ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 px-5 py-2 text-[10px] text-zinc-500 dark:text-zinc-600">
              One row per placement — someone placed into two jobs appears twice. Click a name to
              open their Salesforce record.
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Delta({
  label, value, pct, was, muted,
}: {
  label: string
  value: number | null
  pct: number | null
  was: number | null
  muted: boolean
}) {
  if (value === null) return null
  const up = value > 0
  return (
    <div>
      <p
        className={cn(
          'text-[15px] font-semibold tabular-nums',
          muted ? 'text-zinc-600 dark:text-zinc-400' : up ? 'text-emerald-700 dark:text-emerald-300' : value < 0 ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-600 dark:text-zinc-400',
        )}
      >
        {up ? '▲' : value < 0 ? '▼' : '—'} {Math.abs(value)}
        {pct !== null && <span className="ml-1 text-[11px] font-normal text-zinc-500 dark:text-zinc-600">({Math.abs(pct)}%)</span>}
      </p>
      <p className="mt-0.5 text-[10px] text-zinc-500">
        {label}
        {was !== null && <span className="text-zinc-500 dark:text-zinc-600"> · was {was}</span>}
      </p>
    </div>
  )
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[15px] font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">{value}</p>
      <p className="mt-0.5 text-[10px] leading-tight text-zinc-500">{label}</p>
      {hint && <p className="text-[10px] leading-tight text-zinc-500 dark:text-zinc-600">{hint}</p>}
    </div>
  )
}

/** Waits here run to years, so raw day counts stop being readable past a few months. */
function formatWait(days: number): string {
  if (days < 60) return `${days}d`
  if (days < 730) return `${Math.round(days / 30)}mo`
  return `${(days / 365).toFixed(1)}y`
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
