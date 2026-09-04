import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { selectAngle } from '@/lib/marketingQueries'

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
  const { opportunityId, angleId } = (body ?? {}) as { opportunityId?: unknown; angleId?: unknown }
  if (typeof opportunityId !== 'string' || !opportunityId || typeof angleId !== 'string' || !angleId) {
    return NextResponse.json({ ok: false, error: 'invalid_ids' }, { status: 400 })
  }

  try {
    await selectAngle(opportunityId, angleId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Marketing select-angle write failed:', err)
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 503 })
  }
}
