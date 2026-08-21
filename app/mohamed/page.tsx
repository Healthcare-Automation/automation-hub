import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { mohamedDemoRuns } from '@/lib/mohamedDemoData'
import demoLedger from '@/lib/mohamedDemoLedger.json'
import type { RunLedgerSnapshot } from '@/lib/mohamedLedger'
import { MohamedDashboard } from '@/components/mohamed/MohamedDashboard'

export const dynamic = 'force-dynamic'

export default async function MohamedPage() {
  const cookieStore = await cookies()
  const isAdmin = await verifyAdminCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)
  // Synthetic ledger from `mohamed-billing fixture-pipeline` until the run store is provisioned.
  return <MohamedDashboard runs={mohamedDemoRuns} ledger={demoLedger as RunLedgerSnapshot} isAdmin={isAdmin} />
}
