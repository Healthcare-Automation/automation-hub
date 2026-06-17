import { NextRequest, NextResponse } from 'next/server'

// Building the all-time stats + rendering + SMTP send happens upstream on Modal and takes a few
// seconds; keep a comfortable budget under the Vercel function ceiling.
export const maxDuration = 60

/**
 * Proxy to the per-automation Modal "impact report" endpoints. The hub collects recipient
 * emails and forwards them; the Modal endpoint builds + sends the all-time report.
 *
 * Required env (set on Vercel, Production scope, then redeploy — env is bound at deploy time):
 *   MODAL_KIMEDICS_IMPACT_URL / MODAL_KIMEDICS_IMPACT_TOKEN
 *   MODAL_DJC_IMPACT_URL      / MODAL_DJC_IMPACT_TOKEN
 */
const CONFIG: Record<string, { urlEnv: string; tokenEnv: string; label: string }> = {
  kimedics: { urlEnv: 'MODAL_KIMEDICS_IMPACT_URL', tokenEnv: 'MODAL_KIMEDICS_IMPACT_TOKEN', label: 'Kimedics' },
  djc: { urlEnv: 'MODAL_DJC_IMPACT_URL', tokenEnv: 'MODAL_DJC_IMPACT_TOKEN', label: 'DJC' },
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch { body = {} }

  const automation = String(body.automation || '').toLowerCase()
  const cfg = CONFIG[automation]
  if (!cfg) {
    return NextResponse.json({ ok: false, error: 'Unknown automation.' }, { status: 400 })
  }

  const recipients: string[] = Array.isArray(body.recipients)
    ? body.recipients.map((x: any) => String(x).trim()).filter(Boolean)
    : []
  if (recipients.length === 0) {
    return NextResponse.json({ ok: false, error: 'Add at least one recipient.' }, { status: 400 })
  }
  const invalid = recipients.filter((e) => !EMAIL_RE.test(e))
  if (invalid.length) {
    return NextResponse.json(
      { ok: false, error: `Invalid email${invalid.length > 1 ? 's' : ''}: ${invalid.join(', ')}` },
      { status: 400 },
    )
  }

  const endpoint = (process.env[cfg.urlEnv] || '').trim()
  const token = (process.env[cfg.tokenEnv] || '').trim()
  if (!endpoint || !token) {
    const missing = [!endpoint ? cfg.urlEnv : null, !token ? cfg.tokenEnv : null].filter(Boolean)
    return NextResponse.json(
      {
        ok: false,
        error: `${cfg.label} report endpoint not configured. Missing on the server: ${missing.join(', ')}. Add them on Vercel (Production scope) and redeploy — env vars are bound at deploy time.`,
        missing,
      },
      { status: 503 },
    )
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 55_000)
  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        recipients,
        invoker: `hub:${req.headers.get('x-forwarded-for') ?? 'unknown'}`,
      }),
      signal: ctrl.signal,
    })
    const text = await upstream.text()
    let json: any
    try { json = JSON.parse(text) } catch { json = { ok: false, error: text.slice(0, 300) } }
    return NextResponse.json(json, { status: upstream.ok ? 200 : 502 })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.name === 'AbortError' ? 'Timed out sending the report.' : e?.message || 'Request failed.' },
      { status: 504 },
    )
  } finally {
    clearTimeout(timer)
  }
}
