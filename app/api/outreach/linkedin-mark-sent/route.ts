import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { markLinkedinActionSent } from '@/lib/outreachQueries'

/**
 * Andy clicks this AFTER he's already sent the connection request/DM himself,
 * manually, in his own logged-in browser. This endpoint never sends anything --
 * it only records that a human already did, per uzu-account-safety (no
 * automated LinkedIn sending, ever).
 */
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
  const { id, companyId } = (body ?? {}) as { id?: unknown; companyId?: unknown }
  const numId = typeof id === 'number' ? id : Number(id)
  const numCompanyId = typeof companyId === 'number' ? companyId : Number(companyId)
  if (!Number.isInteger(numId) || numId <= 0 || !Number.isInteger(numCompanyId) || numCompanyId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 })
  }

  try {
    await markLinkedinActionSent(numId, numCompanyId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Mark-sent write failed:', err)
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 503 })
  }
}
