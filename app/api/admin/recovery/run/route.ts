import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'

/**
 * Proxy to the Modal recovery endpoint. The hub does not run the recovery
 * engine itself — it posts the request to the Modal-hosted Python function
 * (``recovery_endpoint`` in scrape_gmail_modal.py).
 *
 * Required env:
 *   MODAL_RECOVERY_ENDPOINT_URL
 *   MODAL_RECOVERY_TOKEN
 */
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value
  if (!(await verifyAdminCookieValue(cookie))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const endpoint = (process.env.MODAL_RECOVERY_ENDPOINT_URL || '').trim()
  const token = (process.env.MODAL_RECOVERY_TOKEN || '').trim()
  if (!endpoint || !token) {
    return NextResponse.json(
      { ok: false, error: 'Recovery endpoint not configured (MODAL_RECOVERY_ENDPOINT_URL / MODAL_RECOVERY_TOKEN)' },
      { status: 503 },
    )
  }

  let body: any = {}
  try { body = await req.json() } catch { body = {} }

  const jobIds: string[] = Array.isArray(body.jobIds) ? body.jobIds.map((x: any) => String(x)) : []
  const sinceHours = Number(body.sinceHours ?? 48)
  const dryRun = Boolean(body.dryRun)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 120_000)
  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        jobIds,
        sinceHours,
        dryRun,
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
      { ok: false, error: `Recovery endpoint failed: ${e?.message ?? String(e)}` },
      { status: 502 },
    )
  } finally {
    clearTimeout(timer)
  }
}
