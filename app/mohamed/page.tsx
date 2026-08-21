import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { mohamedDemoRuns } from '@/lib/mohamedDemoData'
import { MohamedDashboard } from '@/components/mohamed/MohamedDashboard'

export const dynamic = 'force-dynamic'

export default async function MohamedPage() {
  const cookieStore = await cookies()
  const isAdmin = await verifyAdminCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)
  return <MohamedDashboard runs={mohamedDemoRuns} isAdmin={isAdmin} />
}
