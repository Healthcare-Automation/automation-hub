import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { setFeedEnabled } from '@/lib/marketingQueries'

/** Sources page per-feed enabled toggle. */
export async function POST(request: NextRequest) {
  const isAdmin = await verifyAdminCookieValue(request.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  const { feedRegistryId, enabled } = (body ?? {}) as { feedRegistryId?: unknown; enabled?: unknown }
  if (typeof feedRegistryId !== 'string' || typeof enabled !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 })
  }

  try {
    const { orgId } = await getDemoOrgAndUser()
    await setFeedEnabled(orgId, feedRegistryId, enabled)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[marketing/sources/toggle] failed', err)
    return NextResponse.json({ ok: false, error: 'toggle_failed' }, { status: 500 })
  }
}
