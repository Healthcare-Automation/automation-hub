import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { setInstagramDraftUsed } from '@/lib/marketingQueries'

/** Toggles the "used" checkbox on an Instagram draft (used_at set/cleared). Admin-gated, mutating. */
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
  const { draftId, used } = (body ?? {}) as { draftId?: unknown; used?: unknown }
  if (typeof draftId !== 'string' || !draftId) {
    return NextResponse.json({ ok: false, error: 'invalid_draft_id' }, { status: 400 })
  }
  if (typeof used !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'invalid_used' }, { status: 400 })
  }

  try {
    await setInstagramDraftUsed(draftId, used)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Instagram draft used-toggle failed:', err)
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 503 })
  }
}
