import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { updateInstagramDraftNotes } from '@/lib/marketingQueries'

/** Saves Andy's freeform review notes on an Instagram draft. Admin-gated, mutating. */
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
  const { draftId, notes } = (body ?? {}) as { draftId?: unknown; notes?: unknown }
  if (typeof draftId !== 'string' || !draftId) {
    return NextResponse.json({ ok: false, error: 'invalid_draft_id' }, { status: 400 })
  }
  if (typeof notes !== 'string') {
    return NextResponse.json({ ok: false, error: 'invalid_notes' }, { status: 400 })
  }

  try {
    await updateInstagramDraftNotes(draftId, notes)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Instagram draft notes save failed:', err)
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 503 })
  }
}
