import Link from 'next/link'
import type { RunLedgerSnapshot } from '@/lib/mohamedLedger'
import type { RunHistoryItem } from '@/lib/mohamedQueries'
import type { RunRequestRow } from '@/lib/mohamedRunRequests'
import type { ClaimApproval } from '@/lib/mohamedApprovals'
import type { ClientQuestion } from '@/lib/mohamedQuestions'
import { coverageGapAlert, summariseClaims, summariseInPlainLanguage } from '@/lib/mohamedLedger'
import { describeRunProgress } from '@/lib/mohamedRunRequests'
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
  historyDegraded = false,
  approvals = new Map(),
  approvalsDegraded = false,
  isAdmin,
  isMohamed = false,
  canApprove,
  inFlight = null,
  questions = [],
  questionsDegraded = false,
}: {
  ledger?: RunLedgerSnapshot
  ledgerSource?: 'live' | 'synthetic' | 'unavailable'
  history?: RunHistoryItem[]
  historyDegraded?: boolean
  approvals?: Map<string, ClaimApproval>
  approvalsDegraded?: boolean
  isAdmin: boolean
  isMohamed?: boolean
  canApprove: boolean
  inFlight?: RunRequestRow | null
  questions?: ClientQuestion[]
  questionsDegraded?: boolean
}) {
  const hero = ledger ? statusHero[ledger.status] : null
  const claims = ledger ? summariseClaims(ledger) : []
  const reviewable = claims.filter(c => c.reachedReview)
  const approvedCount = reviewable.filter(c => approvals.get(c.claimRef)?.approved).length
  const rejectedCount = reviewable.filter(c => approvals.get(c.claimRef)?.decision === 'rejected').length
  const gapAlert = ledger ? coverageGapAlert(ledger) : null

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
              <Link href="/" prefetch className="rounded-md px-3 py-1.5 text-zinc-500 hover:text-zinc-900">Proxi</Link>
              <Link href="/mohamed" className="rounded-md bg-zinc-900 px-3 py-1.5 text-white">Mohamed</Link>
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
        <section data-section="status" className={`mt-7 rounded-2xl border p-5 ${hero.border} ${hero.bg}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${hero.badge}`}>{hero.label}</span>
                <span className="text-[11px] text-zinc-500">Last run {timeAgo(ledger.finished_at ?? ledger.started_at)}</span>
              </div>
              <p className="mt-2 text-sm font-medium text-zinc-900">{summariseInPlainLanguage(ledger)}</p>
              {reviewable.length > 0 && (
                <p className="mt-2 text-xs text-zinc-600">
                  {rejectedCount > 0
                    ? `${approvedCount} approved · ${rejectedCount} rejected`
                    : `${approvedCount} of ${reviewable.length} claim${reviewable.length === 1 ? '' : 's'} approved`}
                </p>
              )}
            </div>
            {isAdmin && (
              <div className="text-right text-[11px] text-zinc-500">
                {inFlight ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                    {describeRunProgress(inFlight.progress) ?? `A run is ${inFlight.status}`} — updates automatically
                  </span>
                ) : (
                  'Upload a CSV below to start a run'
                )}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section data-section="status" className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm text-emerald-900">No runs yet. Upload a CSV below to start one.</p>
        </section>
      )}

      {/* Coverage-gap alert — client decision 2026-08-24: these visits are
          never billed, but that must be loudly visible on every run report,
          not buried in the event log. */}
      {gapAlert && (
        <section className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-lg" aria-hidden>⚠️</span>
            <div>
              <h2 className="text-sm font-semibold text-red-900">
                {gapAlert.visitsNeverBilled} visit{gapAlert.visitsNeverBilled === 1 ? '' : 's'} NOT billed — missing required coverage
              </h2>
              <p className="mt-1 text-xs text-red-800">
                {gapAlert.membersAffected} client{gapAlert.membersAffected === 1 ? '' : 's'} in this run{' '}
                {gapAlert.membersAffected === 1 ? 'is' : 'are'} missing one of the two required coverages
                (HCBS EBD Waiver / Community First Choice). Per your decision these visits are never billed
                until both coverages appear. They will keep being excluded on every run until the coverage
                shows up in the member&apos;s Medicaid record.
              </p>
            </div>
          </div>
        </section>
      )}

      {ledgerSource === 'unavailable' && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          Reconnecting to the run database… the page refreshes automatically, your data is safe.
        </p>
      )}
      {ledger && ledgerSource === 'synthetic' && (
        <p className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-600">
          Showing a synthetic run. Live runs appear here once one has completed.
        </p>
      )}

      {(isAdmin || isMohamed) && <CsvUploadCard hasFile={Boolean(ledger)} />}

      {/* The one thing everyone must see before anything can move forward:
          every claim that reached HCPF review, its full field list, its
          screenshot, and an explicit approve action. Nothing here submits
          anything -- there is no live submission path yet -- but this is
          exactly where that gate will live once one exists. Always
          rendered, even when the ledger itself is unavailable -- gating
          this on `ledger` truthiness was the same vanishing-section bug
          this task exists to kill, just one level up. */}
      <section data-section="claims" className="mt-7">
        <div className="mb-3">
          <h2 className="text-base font-semibold">Claims needing review</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Every claim that reached HCPF review. Nothing is submitted — review the fields and screenshot, then approve.
          </p>
        </div>
        {!ledger ? (
          <p className="text-xs text-amber-700">Reconnecting… refreshes automatically.</p>
        ) : reviewable.length > 0 ? (
          <div className="space-y-2">
            {reviewable.map(claim => (
              <ClaimReviewCard
                key={claim.claimRef}
                runId={ledger.run_id}
                claim={claim}
                approval={approvalsDegraded ? null : (approvals.get(claim.claimRef) ?? null)}
                approvalDegraded={approvalsDegraded}
                canApprove={canApprove}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">No claims reached review in this run.</p>
        )}
      </section>

      {ledger && claims.some(c => !c.reachedReview) && (
        <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {claims.filter(c => !c.reachedReview).length} claim(s) in this run did not reach HCPF review — see technical detail below for why.
        </section>
      )}

      <RunHistory history={history} selectedRunId={ledger?.run_id ?? ''} canApprove={canApprove} degraded={historyDegraded} />

      {/* Clarifying billing-rule questions for Mohamed — answered here so
          decisions live next to the runs they govern, not in chat threads. */}
      <ClientQuestionsCard questions={questions} canAnswer={canApprove} degraded={questionsDegraded} />

      <details data-section="technical" className="mt-7 rounded-2xl border border-zinc-200 bg-white">
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-zinc-600">Technical detail (for debugging)</summary>
        <div className="border-t border-zinc-200 px-1 pb-1">
          {ledger ? <RunTrace ledger={ledger} /> : <p className="px-4 py-4 text-xs text-amber-700">Reconnecting… refreshes automatically.</p>}
        </div>
      </details>

      <footer data-section="footer" className="mt-8 border-t border-zinc-200 pt-4 text-[11px] text-zinc-500">
        Automation Hub · Mohamed workspace
      </footer>
    </div>
  )
}
