import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { markLinkedinActionConnected } from '@/lib/outreachQueries'

/**
 * Andy clicks this after he's checked LinkedIn himself and confirmed the connection request
 * was actually ACCEPTED by the other person (distinct from linkedin-mark-sent, which only
 * records the note going out). There's no API-based way to detect an accept, so this is a
 * manual confirmation step, same as mark-sent. This is the point that genuinely counts as
 * "reached out" for pipeline_stage purposes -- per Andy, sending the note is a request, not
 * a completed reach-out.
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
    await markLinkedinActionConnected(numId, numCompanyId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Mark-connected write failed:', err)
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 503 })
  }
}
