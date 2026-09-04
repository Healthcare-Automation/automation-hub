import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { recordFeedback, recomputeObservedPreferences } from '@/lib/marketingPreferences'
import type { FeedbackTargetType } from '@/lib/marketing/types'

const VALID_TARGET_TYPES: FeedbackTargetType[] = ['story_opportunity', 'story_angle', 'content_draft']

/** Records a feedback event and recomputes observed preferences — the feedback ->
 * learning loop from BUILD_BRIEF.md. Mutating, so admin-gated per PORT_BRIEF.md #4. */
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
  const { targetType, targetId, tags, freeText } = (body ?? {}) as {
    targetType?: unknown; targetId?: unknown; tags?: unknown; freeText?: unknown
  }
  if (typeof targetType !== 'string' || !VALID_TARGET_TYPES.includes(targetType as FeedbackTargetType)) {
    return NextResponse.json({ ok: false, error: 'invalid_target_type' }, { status: 400 })
  }
  if (typeof targetId !== 'string' || !targetId) {
    return NextResponse.json({ ok: false, error: 'invalid_target_id' }, { status: 400 })
  }
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) {
    return NextResponse.json({ ok: false, error: 'invalid_tags' }, { status: 400 })
  }

  try {
    const { orgId } = await getDemoOrgAndUser()
    await recordFeedback({
      orgId,
      targetType: targetType as FeedbackTargetType,
      targetId,
      tags,
      freeText: typeof freeText === 'string' ? freeText : undefined,
    })
    await recomputeObservedPreferences(orgId, { minOccurrences: 3 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Marketing feedback write failed:', err)
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 503 })
  }
}
