import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'

/**
 * Proxy to the Modal check-in endpoint (``checkin_endpoint`` in
 * scrape_gmail_modal.py). Read-only on the automation side: runs consistency
 * checks over recently-touched Kimedics jobs, emails the review packets to
 * Andy + Sean, and returns the full report JSON for this page to render.
 *
 * Required env:
 *   MODAL_CHECKIN_ENDPOINT_URL
 *   MODAL_KIMEDICS_IMPACT_TOKEN   (the endpoint reuses the impact token)
 */
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value
  if (!(await verifyAdminCookieValue(cookie))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const endpoint = (process.env.MODAL_CHECKIN_ENDPOINT_URL || '').trim()
  const token = (process.env.MODAL_KIMEDICS_IMPACT_TOKEN || '').trim()
  if (!endpoint || !token) {
    return NextResponse.json(
      { ok: false, error: 'Check-in endpoint not configured (MODAL_CHECKIN_ENDPOINT_URL / MODAL_KIMEDICS_IMPACT_TOKEN)' },
      { status: 503 },
    )
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 240_000)
  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        invoker: `admin_ui:${req.headers.get('x-forwarded-for') ?? 'unknown'}`,
      }),
      signal: ctrl.signal,
    })
    const text = await upstream.text()
    let json: any
    try { json = JSON.parse(text) } catch { json = { ok: false, error: text.slice(0, 500) } }
    return NextResponse.json(json, { status: upstream.ok ? 200 : 502 })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: `Check-in endpoint failed: ${e?.message ?? String(e)}` },
      { status: 502 },
    )
  } finally {
    clearTimeout(timer)
  }
}
