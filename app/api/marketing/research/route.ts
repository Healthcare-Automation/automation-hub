import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { runFullPipeline } from '@/lib/marketingPipeline'

export const maxDuration = 120

/** "Run research now" button on the Sources page — the same pipeline as the cron route,
 * just admin-gated and triggered on demand instead of on a schedule. */
export async function POST(request: NextRequest) {
  const isAdmin = await verifyAdminCookieValue(request.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const { orgId } = await getDemoOrgAndUser()
    const result = await runFullPipeline({ orgId, triggeredBy: 'manual' })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[marketing/research] manual run failed', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
