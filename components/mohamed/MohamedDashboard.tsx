import type { RunLedgerSnapshot } from '@/lib/mohamedLedger'
import type { RunHistoryItem } from '@/lib/mohamedQueries'
import type { RunRequestRow } from '@/lib/mohamedRunRequests'
import type { ClaimApproval } from '@/lib/mohamedApprovals'
import type { ClientQuestion } from '@/lib/mohamedQuestions'
import { summariseClaims, summariseInPlainLanguage } from '@/lib/mohamedLedger'
import { RunHistory } from './RunHistory'
import { CsvUploadCard } from './CsvUploadCard'
import { ClaimReviewCard } from './ClaimReviewCard'
import { ClientQuestionsCard } from './ClientQuestionsCard'
import { RunTrace } from './RunTrace'

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.round(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

const statusHero = {
  review_ready: { border: 'border-emerald-200', bg: 'bg-emerald-50', badge: 'bg-emerald-600 text-white', label: 'Ready for review' },
  blocked: { border: 'border-amber-200', bg: 'bg-amber-50', badge: 'bg-amber-500 text-white', label: 'Needs attention' },
  failed: { border: 'border-red-200', bg: 'bg-red-50', badge: 'bg-red-600 text-white', label: 'Stopped' },
} as const

/**
 * Single-platform Mohamed dashboard: everything happens here, on the hub —
 * no Guacamole, no SSH, no second screen for day-to-day use. Structured
 * around one question at a time:
 *   1. Is the latest run working? (status hero)
 *   2. What needs my eyes right now? (claim review cards — full field list
 *      + screenshot, must be reviewed before approval)
 *   3. What happened before? (collapsed history)
 * The old raw stage-grid/event-log view still exists (RunTrace) but is
 * tucked below as a collapsed "Technical detail" section for debugging,
 * not the first thing anyone has to read.
 */
export function MohamedDashboard({
  ledger,
  ledgerSource = 'synthetic',
  history = [],
  approvals = new Map(),
  isAdmin,
  canApprove,
  inFlight = null,
  questions = [],
}: {
  ledger?: RunLedgerSnapshot
  ledgerSource?: 'live' | 'synthetic' | 'unavailable'
  history?: RunHistoryItem[]
  approvals?: Map<string, ClaimApproval>
  isAdmin: boolean
  canApprove: boolean
  inFlight?: RunRequestRow | null
  questions?: ClientQuestion[]
}) {
  const hero = ledger ? statusHero[ledger.status] : null
  const claims = ledger ? summariseClaims(ledger) : []
  const reviewable = claims.filter(c => c.reachedReview)
  const approvedCount = reviewable.filter(c => approvals.get(c.claimRef)?.approved).length

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-emerald-700">UZU STUDIO</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Mohamed billing automation</h1>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {isAdmin && (
            <nav className="flex rounded-lg border border-zinc-200 bg-white p-1">
              <a href="/" className="rounded-md px-3 py-1.5 text-zinc-500 hover:text-zinc-900">Proxi</a>
              <a href="/mohamed" className="rounded-md bg-zinc-900 px-3 py-1.5 text-white">Mohamed</a>
            </nav>
          )}
          {!isAdmin && (
            <form method="post" action="/api/mohamed/logout">
              <button type="submit" className="text-zinc-500 hover:text-zinc-900">Sign out</button>
            </form>
          )}
        </div>
      </header>

      {/* Status: the one thing to read if nothing else. */}
      {ledger && hero ? (
        <section className={`mt-7 rounded-2xl border p-5 ${hero.border} ${hero.bg}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${hero.badge}`}>{hero.label}</span>
                <span className="text-[11px] text-zinc-500">Last run {timeAgo(ledger.finished_at ?? ledger.started_at)}</span>
              </div>
              <p className="mt-2 text-sm font-medium text-zinc-900">{summariseInPlainLanguage(ledger)}</p>
              {reviewable.length > 0 && (
                <p className="mt-2 text-xs text-zinc-600">
                  {approvedCount} of {reviewable.length} claim{reviewable.length === 1 ? '' : 's'} approved
                </p>
              )}
            </div>
            {isAdmin && (
              <div className="text-right text-[11px] text-zinc-500">
                {inFlight ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                    A run is {inFlight.status} — checking automatically
                  </span>
                ) : (
                  'Upload a CSV below to start a run'
                )}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm text-emerald-900">No runs yet. Upload a CSV below to start one.</p>
        </section>
      )}

      {ledger && ledgerSource !== 'live' && (
        <p className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-600">
          {ledgerSource === 'unavailable'
            ? 'The run ledger store is unreachable right now — showing the last synthetic run instead.'
            : 'Showing a synthetic run. Live runs appear here once one has completed.'}
        </p>
      )}

      {isAdmin && <CsvUploadCard hasFile={Boolean(ledger)} />}

      {/* Clarifying billing-rule questions for Mohamed — answered here so
          decisions live next to the runs they govern, not in chat threads. */}
      <ClientQuestionsCard questions={questions} canAnswer={canApprove} />

      {/* The one thing everyone must see before anything can move forward:
          every claim that reached HCPF review, its full field list, its
          screenshot, and an explicit approve action. Nothing here submits
          anything -- there is no live submission path yet -- but this is
          exactly where that gate will live once one exists. */}
      {ledger && reviewable.length > 0 && (
        <section className="mt-7">
          <div className="mb-3">
            <h2 className="text-base font-semibold">Claims needing review</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Every claim that reached HCPF review. Nothing is submitted — review the fields and screenshot, then approve.
            </p>
          </div>
          <div className="space-y-2">
            {reviewable.map(claim => (
              <ClaimReviewCard
                key={claim.claimRef}
                runId={ledger.run_id}
                claim={claim}
                approval={approvals.get(claim.claimRef) ?? null}
                canApprove={canApprove}
              />
            ))}
          </div>
        </section>
      )}

      {ledger && claims.some(c => !c.reachedReview) && (
        <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {claims.filter(c => !c.reachedReview).length} claim(s) in this run did not reach HCPF review — see technical detail below for why.
        </section>
      )}

      {history.length > 0 && <RunHistory history={history} selectedRunId={ledger?.run_id ?? ''} />}

      {ledger && (
        <details className="mt-7 rounded-2xl border border-zinc-200 bg-white">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-zinc-600">Technical detail (for debugging)</summary>
          <div className="border-t border-zinc-200 px-1 pb-1">
            <RunTrace ledger={ledger} />
          </div>
        </details>
      )}

      <footer className="mt-8 border-t border-zinc-200 pt-4 text-[11px] text-zinc-500">
        Automation Hub · Mohamed workspace
      </footer>
    </div>
  )
}
