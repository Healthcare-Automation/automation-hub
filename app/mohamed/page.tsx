import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import demoLedger from '@/lib/mohamedDemoLedger.json'
import type { RunLedgerSnapshot } from '@/lib/mohamedLedger'
import { isMohamedLedgerConfigured } from '@/lib/mohamedDb'
import { isMohamedApprovalConfigured } from '@/lib/mohamedApprovalDb'
import { getMohamedLedger, getMohamedRunHistory, type RunHistoryItem } from '@/lib/mohamedQueries'
import { getApprovalsForRun, type ClaimApproval } from '@/lib/mohamedApprovals'
import { getInFlightRunRequest, type RunRequestRow } from '@/lib/mohamedRunRequests'
import { getClientQuestions, type ClientQuestion } from '@/lib/mohamedQuestions'
import { MOHAMED_COOKIE_NAME, verifyMohamedCookieValue } from '@/lib/mohamedAuth'
import { MohamedDashboard } from '@/components/mohamed/MohamedDashboard'
import { LiveDashboardRefresh } from '@/components/LiveDashboardRefresh'

export const dynamic = 'force-dynamic'
// The Mohamed Supabase project lives in ap-northeast-1 (Tokyo). Vercel's default
// function region is US East (iad1) — every query was paying a ~200-250ms
// trans-Pacific round trip, times 2-3 sequential-ish queries, before the page
// could render. Running the function itself in Tokyo (hnd1) instead cuts that
// to a same-region call. This is the single biggest lever on /mohamed's load time.
export const preferredRegion = 'hnd1'

export default async function MohamedPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const cookieStore = await cookies()
  const isAdmin = await verifyAdminCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)
  const isMohamed = await verifyMohamedCookieValue(cookieStore.get(MOHAMED_COOKIE_NAME)?.value)
  // Both admin and the Mohamed portal session can approve — same access rule
  // as viewing/uploading (Sean uses the same shared Mohamed access code).
  const canApprove = (isAdmin || isMohamed) && isMohamedApprovalConfigured
  const { run } = await searchParams

  // The synthetic demo ledger exists ONLY for local dev / unconfigured
  // installs. In production (ledger configured) we never show fake data:
  // a transient DB failure renders an honest "retrying" banner instead of
  // silently swapping in a demo run (which made the page appear to flip
  // between two different dashboards on refresh — Andy, 2026-08-24).
  let ledger: RunLedgerSnapshot | undefined = isMohamedLedgerConfigured
    ? undefined
    : (demoLedger as RunLedgerSnapshot)
  let history: RunHistoryItem[] = []
  let approvals = new Map<string, ClaimApproval>()
  let ledgerSource: 'live' | 'synthetic' | 'unavailable' = 'synthetic'
  let inFlight: RunRequestRow | null = null
  let questions: ClientQuestion[] = []

  if (isMohamedLedgerConfigured) {
    const selected = typeof run === 'string' && /^[0-9a-f]{32}$/.test(run) ? run : undefined
    // allSettled, not all: one slow/failed query must not throw away the
    // other three (that all-or-nothing catch was half the flip-flop bug).
    const [liveR, runsR, requestR, questionsR] = await Promise.allSettled([
      getMohamedLedger(selected),
      getMohamedRunHistory(),
      isAdmin ? getInFlightRunRequest() : Promise.resolve(null),
      getClientQuestions(),
    ])
    if (runsR.status === 'fulfilled') history = runsR.value
    if (requestR.status === 'fulfilled') inFlight = requestR.value
    if (questionsR.status === 'fulfilled') questions = questionsR.value
    if (liveR.status === 'fulfilled' && liveR.value) {
      ledger = liveR.value
      ledgerSource = 'live'
      approvals = await getApprovalsForRun(liveR.value.run_id).catch(() => new Map())
    } else {
      // Pooler unreachable/saturated or the ledger query failed: keep the
      // page honest — no demo data, just a retrying banner.
      ledgerSource = 'unavailable'
    }
  }

  return (
    <>
      {/* Auto-refresh so Andy never has to hit reload: fast (5s) while a run
          is actively in flight so "pending" resolves on its own, slower
          (20s) the rest of the time. Only mounted for admins — Mohamed's
          view doesn't have a trigger button, so there's nothing to wait on. */}
      {isAdmin && <LiveDashboardRefresh intervalMs={inFlight ? 5_000 : 20_000} />}
      <MohamedDashboard
        ledger={ledger}
        ledgerSource={ledgerSource}
        history={history}
        approvals={approvals}
        isAdmin={isAdmin}
        canApprove={canApprove}
        inFlight={inFlight}
        questions={questions}
      />
    </>
  )
}
