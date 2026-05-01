import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'

/**
 * Proxy to a Modal "rescrape" endpoint that re-runs the Kimedics scraper for a
 * specific list of job_ids. The hub does not run the scraper itself.
 *
 * Required env (set on Vercel; until both are present, this endpoint returns a
 * clear "not configured" response so the UI button can display a helpful hint
 * rather than silently 500):
 *   MODAL_RESCRAPE_ENDPOINT_URL
 *   MODAL_RESCRAPE_TOKEN
 */
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value
  if (!(await verifyAdminCookieValue(cookie))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const endpoint = (process.env.MODAL_RESCRAPE_ENDPOINT_URL || '').trim()
  const token = (process.env.MODAL_RESCRAPE_TOKEN || '').trim()
  if (!endpoint || !token) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Rescrape endpoint not configured. Set MODAL_RESCRAPE_ENDPOINT_URL and MODAL_RESCRAPE_TOKEN once the proxi_salesforce_automation Modal endpoint is deployed.',
      },
      { status: 503 },
    )
  }

  let body: any = {}
  try { body = await req.json() } catch { body = {} }

  const jobIds: string[] = Array.isArray(body.jobIds)
    ? body.jobIds.map((x: any) => String(x).trim()).filter(Boolean)
    : []
  if (jobIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'jobIds array is required' },
      { status: 400 },
    )
  }
  const dryRun = Boolean(body.dryRun)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 180_000)
  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        jobIds,
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
      { ok: false, error: `Rescrape endpoint failed: ${e?.message ?? String(e)}` },
      { status: 502 },
    )
  } finally {
    clearTimeout(timer)
  }
}
