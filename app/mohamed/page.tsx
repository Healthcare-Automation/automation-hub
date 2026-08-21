import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { mohamedDemoRuns } from '@/lib/mohamedDemoData'
import demoLedger from '@/lib/mohamedDemoLedger.json'
import type { RunLedgerSnapshot } from '@/lib/mohamedLedger'
import { isMohamedLedgerConfigured } from '@/lib/mohamedDb'
import { getMohamedLedger, getMohamedRunHistory, type RunHistoryItem } from '@/lib/mohamedQueries'
import { MohamedDashboard } from '@/components/mohamed/MohamedDashboard'

export const dynamic = 'force-dynamic'

export default async function MohamedPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const cookieStore = await cookies()
  const isAdmin = await verifyAdminCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)
  const { run } = await searchParams

  let ledger: RunLedgerSnapshot = demoLedger as RunLedgerSnapshot
  let history: RunHistoryItem[] = []
  let ledgerSource: 'live' | 'synthetic' | 'unavailable' = 'synthetic'

  if (isMohamedLedgerConfigured) {
    try {
      const selected = typeof run === 'string' && /^[0-9a-f]{32}$/.test(run) ? run : undefined
      const [live, runs] = await Promise.all([getMohamedLedger(selected), getMohamedRunHistory()])
      history = runs
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
    />
  )
}
