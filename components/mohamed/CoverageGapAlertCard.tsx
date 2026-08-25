'use client'

import { useState } from 'react'
import { getCoverageGapMembers } from '@/lib/mohamedReviewClient'
import type { CoverageGapAlert } from '@/lib/mohamedLedger'

function InfoIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.75v5.5M12 7.75v.01" />
    </svg>
  )
}

type Fetch = { phase: 'idle' } | { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; members: string[] }

/**
 * Coverage-gap alert — client decision 2026-08-24: these visits are never
 * billed, but that must be visible on every affected run report. It's
 * expected, working-as-designed behaviour, not a failure, so it reads as an
 * informational card, not a red banner.
 *
 * Drill-down (Andy, 2026-08-25: "I should be able to drill down on those
 * people and see who we missed") fetches the member ids on demand from the
 * VPS-only coverage-gap-members.json — the Supabase ledger never carries
 * member ids, so this is the same token-gated review-artifact path as
 * claim screenshots/fields, not a new data source.
 */
export function CoverageGapAlertCard({ runId, alert }: { runId: string; alert: CoverageGapAlert }) {
  const [expanded, setExpanded] = useState(false)
  const [fetched, setFetched] = useState<Fetch>({ phase: 'idle' })

  function toggle() {
    const next = !expanded
    setExpanded(next)
    if (next && fetched.phase === 'idle') {
      setFetched({ phase: 'loading' })
      getCoverageGapMembers(runId)
        .then(members => setFetched(members ? { phase: 'ready', members } : { phase: 'error' }))
        .catch(() => setFetched({ phase: 'error' }))
    }
  }

  return (
    <section className="relative mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white pl-5 shadow-sm">
      <span className="absolute inset-y-0 left-0 w-1 bg-amber-400" aria-hidden />
      <div className="flex items-start gap-3 p-4 pl-3.5">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold text-zinc-900">
            {alert.visitsNeverBilled} visit{alert.visitsNeverBilled === 1 ? '' : 's'} excluded — working as designed, per your rule
          </h2>
          <p className="mt-1 text-xs text-zinc-600">
            {alert.membersAffected} client{alert.membersAffected === 1 ? '' : 's'} in this run{' '}
            {alert.membersAffected === 1 ? 'is' : 'are'} missing one of the two required coverages
            (HCBS EBD Waiver / Community First Choice). Per your decision these visits are never billed
            until both coverages appear in the member&apos;s Medicaid record.
          </p>
          <button
            type="button"
            onClick={toggle}
            className="mt-2 text-xs font-medium text-amber-700 hover:underline"
          >
            {expanded ? 'Hide' : 'Show'} which clients
          </button>
          {expanded && (
            <div className="mt-2">
              {fetched.phase === 'loading' && <p className="text-xs text-zinc-400">Loading…</p>}
              {fetched.phase === 'error' && (
                <p className="text-xs text-zinc-500">Could not load the client list for this run (older runs may not have this saved).</p>
              )}
              {fetched.phase === 'ready' && (
                <ul className="flex flex-wrap gap-1.5">
                  {fetched.members.map(memberId => (
                    <li
                      key={memberId}
                      className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium tabular-nums text-amber-900 ring-1 ring-inset ring-amber-200"
                    >
                      {memberId}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
