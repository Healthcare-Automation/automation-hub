import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { logReply } from '@/lib/outreachQueries'

const CLASSIFICATIONS = new Set([
  'positive_interest', 'meeting_intent', 'question', 'soft_interest', 'not_now',
  'objection', 'already_solved', 'wrong_person', 'referral', 'unsubscribe',
  'negative', 'ooo', 'bounce', 'automated', 'other',
])

/**
 * Manual reply intake — there's no inbox integration yet, so Andy pastes in
 * what a prospect replied and classifies it here. Per uzu-reply-intelligence's
 * hard rule, logging a human reply (anything except bounce/ooo/automated)
 * immediately pauses that company's sequence and cancels pending steps —
 * handled inside logReply, not here, so the rule can't be skipped by a caller.
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
  const { companyId, contactId, channel, text, classification } = (body ?? {}) as {
    companyId?: unknown; contactId?: unknown; channel?: unknown; text?: unknown; classification?: unknown
  }
  const numCompanyId = typeof companyId === 'number' ? companyId : Number(companyId)
  if (!Number.isInteger(numCompanyId) || numCompanyId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid_company_id' }, { status: 400 })
  }
  if (typeof classification !== 'string' || !CLASSIFICATIONS.has(classification)) {
    return NextResponse.json({ ok: false, error: 'invalid_classification' }, { status: 400 })
  }
  if (typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ ok: false, error: 'text_required' }, { status: 400 })
  }
  const numContactId = typeof contactId === 'number' ? contactId
    : contactId ? Number(contactId) : null

  try {
    await logReply(
      numCompanyId,
      Number.isInteger(numContactId) ? numContactId : null,
      typeof channel === 'string' && channel ? channel : 'email',
      text.trim(),
      classification,
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Reply log failed:', err)
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 503 })
  }
}
