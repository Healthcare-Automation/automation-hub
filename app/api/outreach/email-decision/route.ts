import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { setEmailDecision } from '@/lib/outreachQueries'

/**
 * QA approve/fail for a drafted email. This does NOT send anything — RESEARCH +
 * DRAFT + APPROVAL MODE means email sends require a separate, not-yet-built
 * sending step gated on deliverability infra (uzu-deliverability-guardian).
 * This endpoint only records Andy's QA verdict on the copy itself.
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
  const { id, decision, note } = (body ?? {}) as { id?: unknown; decision?: unknown; note?: unknown }
  const numId = typeof id === 'number' ? id : Number(id)
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 })
  }
  if (decision !== 'approved' && decision !== 'qa_failed') {
    return NextResponse.json({ ok: false, error: 'invalid_decision' }, { status: 400 })
  }
  if (decision === 'qa_failed' && (typeof note !== 'string' || note.trim().length === 0)) {
    return NextResponse.json({ ok: false, error: 'reason_required_for_qa_fail' }, { status: 400 })
  }

  try {
    await setEmailDecision(numId, decision, typeof note === 'string' ? note.trim() || null : null)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Email decision write failed:', err)
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 503 })
  }
}
