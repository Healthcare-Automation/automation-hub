import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { resetPreferenceHistory } from '@/lib/marketingPreferences'

export async function POST(request: NextRequest) {
  const isAdmin = await verifyAdminCookieValue(request.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const { orgId } = await getDemoOrgAndUser()
    await resetPreferenceHistory(orgId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Marketing preference reset failed:', err)
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 503 })
  }
}
