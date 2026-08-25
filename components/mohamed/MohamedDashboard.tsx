import Link from 'next/link'
import type { RunLedgerSnapshot } from '@/lib/mohamedLedger'
import type { RunHistoryItem } from '@/lib/mohamedQueries'
import type { RunRequestRow } from '@/lib/mohamedRunRequests'
import type { ClaimApproval } from '@/lib/mohamedApprovals'
import type { ClientQuestion } from '@/lib/mohamedQuestions'
import { coverageGapAlert, describeFailureForClient, summariseClaims, summariseInPlainLanguage } from '@/lib/mohamedLedger'
import { describeRunProgress } from '@/lib/mohamedRunProgress'
import { RunHistory } from './RunHistory'
import { CsvUploadCard } from './CsvUploadCard'
import { ClaimsByMember } from './ClaimsByMember'
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
  inFlightDegraded = false,
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
  /** True when the server's in-flight-run query itself failed this render
   * (not the same as "nothing is running") — RunHistory keeps its last
   * known live board on the client instead of tearing it down, so a
   * transient DB blip can't make the live board flicker away and back. */
  inFlightDegraded?: boolean
  questions?: ClientQuestion[]
  questionsDegraded?: boolean
}) {
  const hero = ledger ? statusHero[ledger.status] : null
  const claims = ledger ? summariseClaims(ledger) : []
  const reviewable = claims.filter(c => c.reachedReview)
  const approvedCount = reviewable.filter(c => approvals.get(c.claimRef)?.approved).length
  const rejectedCount = reviewable.filter(c => approvals.get(c.claimRef)?.decision === 'rejected').length
  const gapAlert = ledger ? coverageGapAlert(ledger) : null
  const failureExplanation = ledger?.status === 'failed' ? describeFailureForClient(ledger) : null

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

      {/* Status: the one thing to read if nothing else. One compact row —
          badge, when, plain-language summary — plus the three-line failure
          explanation underneath when the run failed. */}
      {ledger && hero ? (
        <section data-section="status" className={`mt-7 rounded-2xl border p-4 ${hero.border} ${hero.bg}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${hero.badge}`}>{hero.label}</span>
              <span className="shrink-0 text-[11px] text-zinc-500">{timeAgo(ledger.finished_at ?? ledger.started_at)}</span>
              <span className="text-sm text-zinc-900">{summariseInPlainLanguage(ledger)}</span>
            </div>
            {/* Compact only: the step-by-step progress list lives at the head
                of the run-history timeline, where the in-flight run becomes
                the next card — one place, not two. */}
            {(isAdmin || isMohamed) && (
              <div className="w-full text-right text-[11px] text-zinc-500 sm:w-64">
                {inFlight ? (
                  <a href="#run-history" className="inline-flex items-center gap-1.5 font-medium text-emerald-800 hover:underline">
                    <span className="relative flex h-2 w-2" aria-hidden>
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    {describeRunProgress(inFlight.progress) ?? 'A run is in progress'}
                  </a>
                ) : (
                  'Upload a CSV below to start a run'
                )}
              </div>
            )}
          </div>
          {reviewable.length > 0 && (
            <p className="mt-1.5 text-xs text-zinc-600">
              {rejectedCount > 0
                ? `${approvedCount} approved · ${rejectedCount} rejected`
                : `${approvedCount} of ${reviewable.length} claim${reviewable.length === 1 ? '' : 's'} approved`}
            </p>
          )}
          {failureExplanation && (
            <dl className="mt-3 space-y-1.5 border-t border-red-200 pt-3 text-xs">
              <div>
                <dt className="inline font-semibold text-red-900">What happened: </dt>
                <dd className="inline text-red-800">{failureExplanation.whatHappened}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-red-900">What the system did: </dt>
                <dd className="inline text-red-800">{failureExplanation.whatSystemDid}</dd>
              </div>
              {failureExplanation.whatToDo && (
                <div>
                  <dt className="inline font-semibold text-red-900">What to do: </dt>
                  <dd className="inline text-red-800">{failureExplanation.whatToDo}</dd>
                </div>
              )}
            </dl>
          )}
          {ledgerSource === 'synthetic' && (
            <p className="mt-2 text-[11px] text-zinc-500">Showing a synthetic run. Live runs appear here once one has completed.</p>
          )}
        </section>
      ) : (
        <section data-section="status" className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-900">No runs yet. Upload a CSV below to start one.</p>
        </section>
      )}

      {ledgerSource === 'unavailable' && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          Reconnecting to the run database… the page refreshes automatically, your data is safe.
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
          <ClaimsByMember
            runId={ledger.run_id}
            claims={reviewable}
            approvals={approvals}
            approvalDegraded={approvalsDegraded}
            canApprove={canApprove}
          />
        ) : (
          <p className="text-xs text-zinc-500">No claims reached review in this run.</p>
        )}
      </section>

      {ledger && claims.some(c => !c.reachedReview) && (
        <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {claims.filter(c => !c.reachedReview).length} claim(s) in this run did not reach HCPF review — see technical detail below for why.
        </section>
      )}

      {/* Coverage-gap alert — client decision 2026-08-24: these visits are
          never billed, but that must be visible on every affected run
          report. It's expected, working-as-designed behaviour, not a
          failure, so it reads as an informational card, not a red banner. */}
      {gapAlert && (
        <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 text-base text-amber-600" aria-hidden>ⓘ</span>
            <div>
              <h2 className="text-xs font-semibold text-amber-900">
                {gapAlert.visitsNeverBilled} visit{gapAlert.visitsNeverBilled === 1 ? '' : 's'} excluded — working as designed, per your rule
              </h2>
              <p className="mt-1 text-xs text-amber-800">
                {gapAlert.membersAffected} client{gapAlert.membersAffected === 1 ? '' : 's'} in this run{' '}
                {gapAlert.membersAffected === 1 ? 'is' : 'are'} missing one of the two required coverages
                (HCBS EBD Waiver / Community First Choice). Per your decision these visits are never billed
                until both coverages appear in the member&apos;s Medicaid record.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* `nowIso` is resolved here, on the server, and passed down: RunHistory
          is a client component, and a bare Date.now() inside it would render
          'Today' on the server and possibly 'Yesterday' on hydration. */}
      <RunHistory
        history={history}
        selectedRunId={ledger?.run_id ?? ''}
        canApprove={canApprove}
        degraded={historyDegraded}
        nowIso={new Date().toISOString()}
        inFlight={isAdmin || isMohamed ? inFlight : null}
        inFlightDegraded={inFlightDegraded}
      />

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
