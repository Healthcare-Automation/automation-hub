import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { updateEmailDraft } from '@/lib/outreachQueries'

/** Andy hand-editing a draft's subject/body in the hub before sending. Saving resets the
 * email to qa_pending so an edited draft always gets one more look before it can be approved. */
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
  const { id, subject, text } = (body ?? {}) as { id?: unknown; subject?: unknown; text?: unknown }
  const numId = typeof id === 'number' ? id : Number(id)
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 })
  }
  if (typeof subject !== 'string' || subject.trim().length === 0) {
    return NextResponse.json({ ok: false, error: 'subject_required' }, { status: 400 })
  }
  if (typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ ok: false, error: 'body_required' }, { status: 400 })
  }

  try {
    await updateEmailDraft(numId, subject.trim(), text)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Email draft edit failed:', err)
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 503 })
  }
}
