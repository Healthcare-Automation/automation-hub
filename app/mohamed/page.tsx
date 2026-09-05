import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import demoLedger from '@/lib/mohamedDemoLedger.json'
import type { RunLedgerSnapshot } from '@/lib/mohamedLedger'
import { isMohamedLedgerConfigured } from '@/lib/mohamedDb'
import { getMohamedLedger, getMohamedRunHistory, type RunHistoryItem } from '@/lib/mohamedQueries'
import { getInFlightRunRequest, type RunRequestRow } from '@/lib/mohamedRunRequests'
import { MOHAMED_COOKIE_NAME, verifyMohamedCookieValue } from '@/lib/mohamedAuth'
import { MohamedDashboard } from '@/components/mohamed/MohamedDashboard'
import { LiveDashboardRefresh } from '@/components/LiveDashboardRefresh'

export const dynamic = 'force-dynamic'
// The Mohamed Supabase project lives in ap-northeast-1 (Tokyo). Vercel's default
// function region is US East (iad1) — every query was paying a ~200-250ms
// trans-Pacific round trip before the page could render. Running the
// function itself in Tokyo (hnd1) cuts that to a same-region call.
export const preferredRegion = 'hnd1'

export default async function MohamedPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const cookieStore = await cookies()
  const isAdmin = await verifyAdminCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)
  const isMohamed = await verifyMohamedCookieValue(cookieStore.get(MOHAMED_COOKIE_NAME)?.value)
  const { run } = await searchParams

  // The synthetic demo ledger exists ONLY for local dev / unconfigured
  // installs. In production (ledger configured) we never show fake data:
  // a transient DB failure renders an honest "retrying" banner instead of
  // silently swapping in a demo run (Andy, 2026-08-24).
  let ledger: RunLedgerSnapshot | undefined = isMohamedLedgerConfigured ? undefined : (demoLedger as RunLedgerSnapshot)
  let history: RunHistoryItem[] = []
  let historyDegraded = false
  let ledgerSource: 'live' | 'synthetic' | 'unavailable' = 'synthetic'
  let inFlight: RunRequestRow | null = null
  // Distinguishes "the in-flight query itself failed" (transient DB hiccup)
  // from "genuinely nothing is running" — collapsing both to null made the
  // live board flicker (Andy, 2026-08-25). The client keeps its last-known
  // board when this is true instead of tearing it down.
  let inFlightDegraded = false

  if (isMohamedLedgerConfigured) {
    const selected = typeof run === 'string' && /^[0-9a-f]{32}$/.test(run) ? run : undefined
    // allSettled, not all: one slow/failed query must not throw away the others.
    const [liveR, runsR, requestR] = await Promise.allSettled([
      getMohamedLedger(selected),
      getMohamedRunHistory(),
      isAdmin || isMohamed ? getInFlightRunRequest() : Promise.resolve(null),
    ])
    if (runsR.status === 'fulfilled') history = runsR.value
    else historyDegraded = true
    if (requestR.status === 'fulfilled') inFlight = requestR.value
    else inFlightDegraded = true
    if (liveR.status === 'fulfilled' && liveR.value) {
      ledger = liveR.value
      ledgerSource = 'live'
    } else {
      ledgerSource = 'unavailable'
    }
  }

  return (
    <>
      {/* Auto-refresh so nobody has to hit reload: fast (5s) while a run is
          actively in flight so "pending" resolves on its own, slower (20s)
          the rest of the time. */}
      {(isAdmin || isMohamed) && <LiveDashboardRefresh intervalMs={inFlight ? 5_000 : 20_000} />}
      <MohamedDashboard
        ledger={ledger}
        ledgerSource={ledgerSource}
        history={history}
        historyDegraded={historyDegraded}
        isAdmin={isAdmin}
        isMohamed={isMohamed}
        inFlight={inFlight}
        inFlightDegraded={inFlightDegraded}
      />
    </>
  )
}
