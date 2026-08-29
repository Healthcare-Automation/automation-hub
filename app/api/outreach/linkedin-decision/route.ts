import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { setLinkedinActionDecision } from '@/lib/outreachQueries'

/**
 * Andy's manual profile-match verification gate for the LinkedIn queue.
 * uzu-linkedin-queue policy: UZU never automates LinkedIn sending/connecting —
 * this endpoint only records Andy's approve/reject decision on a proposed
 * profile match. Approving does NOT send anything; Andy still executes
 * connect/DM manually from his own browser. Rejecting requires a reason so
 * the research loop can learn from a bad match (per the skill's design).
 *
 * outreach_linkedin_actions.status/.verification_note are the one exception
 * to "hub reads outreach_* tables only" — see db/postgres_schema.sql header
 * in outreach_automation. scripts/pull_linkedin_approvals.py reads this back
 * into the working SQLite DB.
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
  if (decision !== 'approved' && decision !== 'rejected') {
    return NextResponse.json({ ok: false, error: 'invalid_decision' }, { status: 400 })
  }
  if (decision === 'rejected' && (typeof note !== 'string' || note.trim().length === 0)) {
    return NextResponse.json({ ok: false, error: 'reason_required_for_rejection' }, { status: 400 })
  }

  try {
    await setLinkedinActionDecision(numId, decision, typeof note === 'string' ? note.trim() || null : null)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('LinkedIn action decision write failed:', err)
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 503 })
  }
}
