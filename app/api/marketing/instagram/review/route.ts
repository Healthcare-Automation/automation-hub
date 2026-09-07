import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { recordInstagramReview } from '@/lib/marketingQueries'
import { INSTAGRAM_REVIEW_TAGS, type InstagramReviewTag } from '@/lib/marketing/types'

/** Approve/disapprove buttons on the Instagram queue — writes a first-class
 * marketing_feedback_events row (target_type='content_draft', tags=['approved'|'disapproved'])
 * that also feeds the generator's "learn from past feedback" context. Admin-gated, mutating. */
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
  const { draftId, tag } = (body ?? {}) as { draftId?: unknown; tag?: unknown }
  if (typeof draftId !== 'string' || !draftId) {
    return NextResponse.json({ ok: false, error: 'invalid_draft_id' }, { status: 400 })
  }
  if (typeof tag !== 'string' || !INSTAGRAM_REVIEW_TAGS.includes(tag as InstagramReviewTag)) {
    return NextResponse.json({ ok: false, error: 'invalid_tag' }, { status: 400 })
  }

  try {
    const { orgId } = await getDemoOrgAndUser()
    await recordInstagramReview(orgId, draftId, tag as InstagramReviewTag)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Instagram draft review failed:', err)
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 503 })
  }
}
