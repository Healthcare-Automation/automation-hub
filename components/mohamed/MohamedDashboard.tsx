import type { RunLedgerSnapshot } from '@/lib/mohamedLedger'
import { HubNav } from '@/components/HubNav'
import type { RunHistoryItem } from '@/lib/mohamedQueries'
import type { RunRequestRow } from '@/lib/mohamedRunRequests'
import type { ClaimApproval } from '@/lib/mohamedApprovals'
import type { ClientQuestion } from '@/lib/mohamedQuestions'
import { coverageGapAlert, describeFailureForClient, summariseClaims, summariseInPlainLanguage } from '@/lib/mohamedLedger'
import { describeRunProgress } from '@/lib/mohamedRunProgress'
import { formatDuration } from '@/lib/mohamedRunSummary'
import { RunHistory } from './RunHistory'
import { CsvUploadCard } from './CsvUploadCard'
import { PortalBrowserCard } from './PortalBrowserCard'
import { ClientQuestionsCard } from './ClientQuestionsCard'
import { CoverageGapAlertCard } from './CoverageGapAlertCard'
import { EligibilityChecksCard } from './EligibilityChecksCard'
import { RunTrace } from './RunTrace'
import { UpdatedAgoIndicator } from '../UpdatedAgoIndicator'

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
  review_ready: { accent: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30 ring-1 ring-inset', dot: 'bg-emerald-500', label: 'Ready for review' },
  blocked: { accent: 'bg-amber-500', badge: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30 ring-1 ring-inset', dot: 'bg-amber-500', label: 'Needs attention' },
  failed: { accent: 'bg-red-500', badge: 'bg-red-50 text-red-800 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30 ring-1 ring-inset', dot: 'bg-red-500', label: 'Stopped' },
} as const

function InfoIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.75v5.5M12 7.75v.01" />
    </svg>
  )
}

/**
 * Single-platform Mohamed dashboard: everything happens here, on the hub —
 * no Guacamole, no SSH, no second screen for day-to-day use. Structured
 * around one question at a time:
 *   1. Is the latest run working? (status hero)
 *   2. What happened before, and what needs my eyes? (run history — each
 *      run's claim review cards — full field list + screenshot, must be
 *      reviewed before approval — live inside that run's card, newest run
 *      open by default, so there is no separate global "needs review" list
 *      to keep in sync with the run it belongs to)
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
      <header className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-[13px] font-bold">U</span>
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-emerald-700 dark:text-emerald-400">UZU STUDIO</p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Mohamed billing automation</h1>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {(isAdmin || isMohamed) && <UpdatedAgoIndicator />}
          {isAdmin && <HubNav active="mohamed" />}
          {!isAdmin && (
            <form method="post" action="/api/mohamed/logout">
              <button type="submit" className="font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">Sign out</button>
            </form>
          )}
        </div>
      </header>

      {/* Status: the one thing to read if nothing else. One compact row —
          badge, when, plain-language summary — plus the three-line failure
          explanation underneath when the run failed. */}
      {ledger && hero ? (
        <section data-section="status" className="relative mt-6 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-5 shadow-sm">
          <span className={`absolute inset-y-0 left-0 w-1 ${hero.accent}`} aria-hidden />
          <div className="p-4 pl-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${hero.badge}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${hero.dot}`} aria-hidden />
                  {hero.label}
                </span>
                <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500">{timeAgo(ledger.finished_at ?? ledger.started_at)}</span>
                {formatDuration(ledger.started_at, ledger.finished_at) && (
                  <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500">· took {formatDuration(ledger.started_at, ledger.finished_at)}</span>
                )}
                <span className="text-sm text-zinc-800 dark:text-zinc-200">{summariseInPlainLanguage(ledger)}</span>
              </div>
              {/* Compact only: the step-by-step progress list lives at the head
                  of the run-history timeline, where the in-flight run becomes
                  the next card — one place, not two. */}
              {(isAdmin || isMohamed) && (
                <div className="w-full text-right text-[11px] text-zinc-500 sm:w-64">
                  {inFlight ? (
                    <a href="#run-history" className="inline-flex items-center gap-1.5 font-medium text-emerald-800 dark:text-emerald-300 hover:underline">
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
              <p className="mt-1.5 text-xs text-zinc-500">
                {rejectedCount > 0
                  ? `${approvedCount} approved · ${rejectedCount} rejected`
                  : `${approvedCount} of ${reviewable.length} claim${reviewable.length === 1 ? '' : 's'} approved`}
              </p>
            )}
            {failureExplanation && (
              <dl className="mt-3 space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3 text-xs">
                <div>
                  <dt className="inline font-semibold text-red-900 dark:text-red-200">What happened: </dt>
                  <dd className="inline text-red-800 dark:text-red-300">{failureExplanation.whatHappened}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-red-900 dark:text-red-200">What the system did: </dt>
                  <dd className="inline text-red-800 dark:text-red-300">{failureExplanation.whatSystemDid}</dd>
                </div>
                {failureExplanation.whatToDo && (
                  <div>
                    <dt className="inline font-semibold text-red-900 dark:text-red-200">What to do: </dt>
                    <dd className="inline text-red-800 dark:text-red-300">{failureExplanation.whatToDo}</dd>
                  </div>
                )}
              </dl>
            )}
            {ledgerSource === 'synthetic' && (
              <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">Showing a synthetic run. Live runs appear here once one has completed.</p>
            )}
          </div>
        </section>
      ) : (
        <section data-section="status" className="relative mt-6 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-5 shadow-sm">
          <span className="absolute inset-y-0 left-0 w-1 bg-emerald-500" aria-hidden />
          <p className="p-4 pl-3.5 text-sm text-zinc-700 dark:text-zinc-300">No runs yet. Upload a CSV below to start one.</p>
        </section>
      )}

      {ledgerSource === 'unavailable' && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 px-4 py-2 text-xs">
          Reconnecting to the run database… the page refreshes automatically, your data is safe.
        </p>
      )}

      {/* Portal browser on/off — Chrome on the VPS runs only while billing
          needs it (Andy 2026-09-03). Fetches its own state client-side so
          the page's 4-way parallel query budget (mohamedDb max:4) is untouched. */}
      {(isAdmin || isMohamed) && <PortalBrowserCard canControl={isAdmin} initial={null} />}

      {(isAdmin || isMohamed) && <CsvUploadCard hasFile={Boolean(ledger)} isAdmin={isAdmin} />}

      {/* Coverage-gap alert — client decision 2026-08-24: these visits are
          never billed, but that must be visible on every affected run
          report. Drill-down (Andy 2026-08-25) lives in its own client
          component since it fetches member ids from the VPS on demand. */}
      {gapAlert && ledger && <CoverageGapAlertCard runId={ledger.run_id} alert={gapAlert} />}

      {/* Per-individual eligibility-check drill-down (Andy, 2026-09-04:
          "I want to see each user and their screenshot of the eligibility
          screen"). Independent of the coverage-gap alert above — covers
          every member checked this run, passed or not. */}
      {ledger && <EligibilityChecksCard runId={ledger.run_id} />}

      {/* `nowIso` is resolved here, on the server, and passed down: RunHistory
          is a client component, and a bare Date.now() inside it would render
          'Today' on the server and possibly 'Yesterday' on hydration. */}
      <RunHistory
        history={history}
        selectedRunId={ledger?.run_id ?? ''}
        canApprove={canApprove}
        canCancel={isAdmin}
        degraded={historyDegraded}
        nowIso={new Date().toISOString()}
        inFlight={isAdmin || isMohamed ? inFlight : null}
        inFlightDegraded={inFlightDegraded}
      />

      {/* Clarifying billing-rule questions for Mohamed — answered here so
          decisions live next to the runs they govern, not in chat threads. */}
      <ClientQuestionsCard questions={questions} canAnswer={canApprove} degraded={questionsDegraded} />

      <details data-section="technical" className="mt-5 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300">Technical detail (for debugging)</summary>
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-1 pb-1">
          {ledger ? <RunTrace ledger={ledger} /> : <p className="px-4 py-4 text-xs text-amber-700 dark:text-amber-300">Reconnecting… refreshes automatically.</p>}
        </div>
      </details>

      <footer data-section="footer" className="mt-8 border-t border-zinc-200 dark:border-zinc-800 pt-4 text-[11px] text-zinc-400 dark:text-zinc-500">
        Automation Hub · Mohamed workspace
      </footer>
    </div>
  )
}
