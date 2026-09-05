import type { RunLedgerSnapshot } from '@/lib/mohamedLedger'
import { HubNav } from '@/components/HubNav'
import type { RunHistoryItem } from '@/lib/mohamedQueries'
import type { RunRequestRow } from '@/lib/mohamedRunRequests'
import { RunHistory } from './RunHistory'
import { CsvUploadCard } from './CsvUploadCard'
import { PortalBrowserCard } from './PortalBrowserCard'
import { UpdatedAgoIndicator } from '../UpdatedAgoIndicator'

/**
 * Single-platform Mohamed dashboard (Andy, 2026-09-05 restructure):
 *
 *   1. ONE status panel at the top. While a run is in flight it IS the live
 *      progress board (every stage + per-member status); otherwise it is the
 *      latest run's outcome. The old separate hero + "A run is happening
 *      right now" card + "Running" pill said the same thing three times.
 *   2. Portal browser + upload.
 *   3. Run history with a Submissions / Tests / All filter, one compact
 *      collapsed row per run, and EVERYTHING about a run (claims with HCPF
 *      status + paid vs claimed, held-back visits, eligibility checks) only
 *      inside that run's drill-down. No global cards, no approve/reject, no
 *      questions card, no technical detail.
 *
 * RunHistory owns the top panel too, because the in-flight board and the
 * "latest run" outcome are the same slot and it already has the live-board
 * degrade cache.
 */
export function MohamedDashboard({
  ledger,
  ledgerSource = 'synthetic',
  history = [],
  historyDegraded = false,
  isAdmin,
  isMohamed = false,
  inFlight = null,
  inFlightDegraded = false,
}: {
  ledger?: RunLedgerSnapshot
  ledgerSource?: 'live' | 'synthetic' | 'unavailable'
  history?: RunHistoryItem[]
  historyDegraded?: boolean
  isAdmin: boolean
  isMohamed?: boolean
  inFlight?: RunRequestRow | null
  /** True when the server's in-flight-run query itself failed this render
   * (not the same as "nothing is running") — RunHistory keeps its last
   * known live board on the client instead of tearing it down. */
  inFlightDegraded?: boolean
}) {
  const canSee = isAdmin || isMohamed

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
          {canSee && <UpdatedAgoIndicator />}
          {isAdmin && <HubNav active="mohamed" />}
          {!isAdmin && (
            <form method="post" action="/api/mohamed/logout">
              <button type="submit" className="font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">Sign out</button>
            </form>
          )}
        </div>
      </header>

      {ledgerSource === 'unavailable' && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 px-4 py-2 text-xs">
          Reconnecting to the run database… the page refreshes automatically, your data is safe.
        </p>
      )}
      {ledgerSource === 'synthetic' && ledger && (
        <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">Showing a synthetic run. Live runs appear here once one has completed.</p>
      )}

      {/* `nowIso` is resolved here, on the server, and passed down: RunHistory
          is a client component, and a bare Date.now() inside it would render
          'Today' on the server and possibly 'Yesterday' on hydration. */}
      <RunHistory
        history={history}
        latestLedger={ledger ?? null}
        canCancel={isAdmin}
        degraded={historyDegraded}
        nowIso={new Date().toISOString()}
        inFlight={canSee ? inFlight : null}
        inFlightDegraded={inFlightDegraded}
        middle={
          canSee ? (
            <>
              <PortalBrowserCard canControl={isAdmin} initial={null} />
              <CsvUploadCard hasFile={Boolean(ledger)} isAdmin={isAdmin} />
            </>
          ) : null
        }
      />

      <footer data-section="footer" className="mt-8 border-t border-zinc-200 dark:border-zinc-800 pt-4 text-[11px] text-zinc-400 dark:text-zinc-500">
        Automation Hub · Mohamed workspace
      </footer>
    </div>
  )
}
