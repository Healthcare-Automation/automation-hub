import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { ingestManualUrl } from '@/lib/marketingQueries'

/** Real fetch() against a pasted URL via lib/marketing/adapters/manualUrl.ts — manual
 * ingestion, admin-gated per PORT_BRIEF.md #4. */
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
  const { url } = (body ?? {}) as { url?: unknown }
  if (typeof url !== 'string' || !url) {
    return NextResponse.json({ ok: false, error: 'invalid_url' }, { status: 400 })
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_url' }, { status: 400 })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ ok: false, error: 'invalid_url' }, { status: 400 })
  }

  try {
    const { orgId } = await getDemoOrgAndUser()
    await ingestManualUrl(orgId, url)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Marketing URL ingestion failed:', err)
    return NextResponse.json({ ok: false, error: 'ingest_failed' }, { status: 503 })
  }
}
