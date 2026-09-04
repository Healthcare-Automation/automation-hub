'use client'

import { useState } from 'react'
import {
  getEligibilityChecks,
  getEligibilityFields,
  getEligibilityScreenshotUrl,
  type EligibilityCheck,
} from '@/lib/mohamedReviewClient'

function InfoIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.75v5.5M12 7.75v.01" />
    </svg>
  )
}

type IndexFetch = { phase: 'idle' } | { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; checks: EligibilityCheck[] }
type DetailFetch =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'missing' }
  | { phase: 'error' }
  | { phase: 'ready'; fields: { label: string; value: string }[]; screenshotUrl: string | null }

/**
 * One row per individual eligibility check, each expandable to the exact
 * Member Focus View capture (fields + screenshot) the automation read when
 * it decided covered/not-covered. Andy, 2026-09-04: "I want to be able to
 * dig into each case where an individual didn't pass the eligibility
 * check. I need to see each user and their screenshot of the eligibility
 * screen."
 *
 * Covers every member looked up in the run, not just the ones later
 * blocked by the coverage-gap billing rule — a client asking "did you
 * check Jane?" should get an answer even when Jane passed. Not-covered
 * checks sort first since those are the ones worth a second look.
 */
export function EligibilityChecksCard({ runId }: { runId: string }) {
  const [expanded, setExpanded] = useState(false)
  const [index, setIndex] = useState<IndexFetch>({ phase: 'idle' })

  function toggle() {
    const next = !expanded
    setExpanded(next)
    if (next && index.phase === 'idle') {
      setIndex({ phase: 'loading' })
      getEligibilityChecks(runId)
        .then(checks => setIndex(checks ? { phase: 'ready', checks } : { phase: 'error' }))
        .catch(() => setIndex({ phase: 'error' }))
    }
  }

  const checks = index.phase === 'ready' ? index.checks : []
  const notCoveredCount = checks.filter(c => !c.covered).length
  // Not-covered first (the cases worth a second look), each group
  // alphabetical so the same member always lands in the same place.
  const sorted = [...checks].sort((a, b) => {
    if (a.covered !== b.covered) return a.covered ? 1 : -1
    return a.memberRef.localeCompare(b.memberRef)
  })

  return (
    <section className="relative mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none pl-5">
      <span className="absolute inset-y-0 left-0 w-1 bg-sky-400" aria-hidden />
      <div className="flex items-start gap-3 p-4 pl-3.5">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-sky-500 dark:text-sky-400" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Eligibility checks for this run</h2>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Every individual checked against HCPF&apos;s Member Focused Viewing during this run, with the exact
            coverage screen the automation read.
          </p>
          <button
            type="button"
            onClick={toggle}
            className="mt-2 text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline"
          >
            {expanded ? 'Hide' : 'Show'} eligibility checks
          </button>
          {expanded && (
            <div className="mt-2">
              {index.phase === 'loading' && <p className="text-xs text-zinc-400 dark:text-zinc-500">Loading…</p>}
              {index.phase === 'error' && (
                <p className="text-xs text-zinc-500">Could not load eligibility checks for this run (older runs may not have this saved).</p>
              )}
              {index.phase === 'ready' && checks.length === 0 && (
                <p className="text-xs text-zinc-500">No eligibility checks were captured for this run.</p>
              )}
              {index.phase === 'ready' && checks.length > 0 && (
                <>
                  <p className="mb-2 text-[11px] text-zinc-500">
                    {notCoveredCount} of {checks.length} did not pass
                  </p>
                  <ul className="space-y-1.5">
                    {sorted.map(check => (
                      <EligibilityCheckRow key={check.ref} runId={runId} check={check} />
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function EligibilityCheckRow({ runId, check }: { runId: string; check: EligibilityCheck }) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<DetailFetch>({ phase: 'idle' })

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && detail.phase === 'idle') {
      setDetail({ phase: 'loading' })
      Promise.all([getEligibilityFields(runId, check.ref), getEligibilityScreenshotUrl(runId, check.ref)])
        .then(([fields, screenshotUrl]) => {
          if (fields === null) {
            setDetail({ phase: 'missing' })
            return
          }
          setDetail({ phase: 'ready', fields, screenshotUrl })
        })
        .catch(() => setDetail({ phase: 'error' }))
    }
  }

  return (
    <li className={`overflow-hidden rounded-lg border ${check.covered ? 'border-zinc-200 dark:border-zinc-800' : 'border-amber-200 dark:border-amber-500/30'}`}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${check.covered ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Member {check.memberRef}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              check.covered
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300'
            }`}
          >
            {check.covered ? 'Covered' : 'Not covered'}
          </span>
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{open ? 'Hide' : 'View'}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 px-3 py-3">
          {detail.phase === 'loading' && <p className="text-xs text-zinc-500">Loading…</p>}
          {detail.phase === 'missing' && <p className="text-xs text-zinc-500">No capture exists for this eligibility check.</p>}
          {detail.phase === 'error' && <p className="text-xs text-red-700 dark:text-red-400">Could not load the capture. Try again.</p>}
          {detail.phase === 'ready' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-zinc-500">Coverage Details, as read on HCPF</p>
                <dl className="max-h-72 space-y-1 overflow-y-auto text-xs">
                  {detail.fields.map((field, i) => (
                    <div key={i} className="flex justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 py-1">
                      <dt className="text-zinc-500">{field.label}</dt>
                      <dd className="text-right font-medium">{field.value}</dd>
                    </div>
                  ))}
                  {detail.fields.length === 0 && <p className="text-zinc-400 dark:text-zinc-500">No fields captured.</p>}
                </dl>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-zinc-500">Screenshot</p>
                {detail.screenshotUrl ? (
                  <img
                    src={detail.screenshotUrl}
                    alt="HCPF eligibility screen screenshot"
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800"
                  />
                ) : (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">No screenshot captured.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
