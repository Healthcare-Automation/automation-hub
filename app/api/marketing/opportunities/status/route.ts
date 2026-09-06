import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { updateOpportunityStatus } from '@/lib/marketingQueries'

const VALID_STATUSES = new Set(['new', 'watching', 'selected', 'archived'])

/** Briefing card "Watch" / "Not relevant" actions. Admin-gated like every other write in
 * the Marketing tab (FeedbackForm, PickAngleButton) — the whole /marketing area is
 * admin-only per proxy.ts, so this mirrors the existing in-page gating convention. */
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
  const { opportunityId, status } = (body ?? {}) as { opportunityId?: unknown; status?: unknown }
  if (typeof opportunityId !== 'string' || typeof status !== 'string' || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 })
  }

  await updateOpportunityStatus(opportunityId, status as 'new' | 'watching' | 'selected' | 'archived')
  return NextResponse.json({ ok: true })
}
