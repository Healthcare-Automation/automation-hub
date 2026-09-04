import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { createContentDraft } from '@/lib/marketingQueries'

/** Generates a content draft from a selected angle — LinkedIn post or video script
 * only, per BUILD_BRIEF.md MVP scope. Never auto-generates both. Admin-gated. */
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
  const { opportunityId, angleId, format } = (body ?? {}) as {
    opportunityId?: unknown; angleId?: unknown; format?: unknown
  }
  if (typeof opportunityId !== 'string' || !opportunityId || typeof angleId !== 'string' || !angleId) {
    return NextResponse.json({ ok: false, error: 'invalid_ids' }, { status: 400 })
  }
  if (format !== 'linkedin_post' && format !== 'video_script') {
    return NextResponse.json({ ok: false, error: 'invalid_format' }, { status: 400 })
  }

  try {
    const { orgId } = await getDemoOrgAndUser()
    const draftId = await createContentDraft(orgId, opportunityId, angleId, format)
    return NextResponse.json({ ok: true, draftId })
  } catch (err) {
    console.error('Marketing content generation failed:', err)
    return NextResponse.json({ ok: false, error: 'generation_failed' }, { status: 503 })
  }
}
