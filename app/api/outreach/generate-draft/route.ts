import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { createDraftRequest } from '@/lib/outreachQueries'

/**
 * Andy clicking "Generate draft" on a company. Queues a request in
 * outreach_draft_requests -- a Hermes cron job (drain_draft_queue) picks it up, runs the
 * research + copywriting + humanizer pipeline (uzu-outreach-copy, uzu-conversion-craft,
 * humanizer, structural-humanizer per the outbound skill chain), and writes the result.
 * This endpoint never drafts anything itself -- see db/schema.sql draft_requests comment.
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
  const { companyId, channel } = (body ?? {}) as { companyId?: unknown; channel?: unknown }
  const numId = typeof companyId === 'number' ? companyId : Number(companyId)
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid_company_id' }, { status: 400 })
  }
  if (channel !== 'email' && channel !== 'linkedin' && channel !== 'both') {
    return NextResponse.json({ ok: false, error: 'invalid_channel' }, { status: 400 })
  }

  try {
    await createDraftRequest(numId, channel)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Draft request write failed:', err)
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 503 })
  }
}
