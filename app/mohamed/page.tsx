import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { mohamedDemoRuns } from '@/lib/mohamedDemoData'
import demoLedger from '@/lib/mohamedDemoLedger.json'
import type { RunLedgerSnapshot } from '@/lib/mohamedLedger'
import { isMohamedLedgerConfigured } from '@/lib/mohamedDb'
import { getMohamedLedger, getMohamedRunHistory, type RunHistoryItem } from '@/lib/mohamedQueries'
import { getInFlightRunRequest, type RunRequestRow } from '@/lib/mohamedRunRequests'
import { MohamedDashboard } from '@/components/mohamed/MohamedDashboard'

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
  const { run } = await searchParams

  let ledger: RunLedgerSnapshot = demoLedger as RunLedgerSnapshot
  let history: RunHistoryItem[] = []
  let ledgerSource: 'live' | 'synthetic' | 'unavailable' = 'synthetic'
  let inFlight: RunRequestRow | null = null

  if (isMohamedLedgerConfigured) {
    try {
      const selected = typeof run === 'string' && /^[0-9a-f]{32}$/.test(run) ? run : undefined
      const [live, runs, request] = await Promise.all([
        getMohamedLedger(selected),
        getMohamedRunHistory(),
        isAdmin ? getInFlightRunRequest() : Promise.resolve(null),
      ])
      history = runs
      inFlight = request
      if (live) {
        ledger = live
        ledgerSource = 'live'
      }
    } catch {
      // Pooler unreachable or saturated: degrade to the synthetic ledger and say so.
      ledgerSource = 'unavailable'
    }
  }

  return (
    <MohamedDashboard
      runs={mohamedDemoRuns}
      ledger={ledger}
      ledgerSource={ledgerSource}
      history={history}
      isAdmin={isAdmin}
      inFlight={inFlight}
    />
  )
}
