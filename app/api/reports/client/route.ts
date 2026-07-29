import { NextRequest, NextResponse } from 'next/server'
import { getClientReport } from '@/lib/clientReport'
import { renderClientReportEmail } from '@/lib/clientReportEmail'

export const maxDuration = 60

/**
 * Sends the combined client-facing report (Operational · DJC · Kimedics) by email.
 *
 * The HTML is rendered HERE from the same queries the dashboard uses, then handed to a Modal
 * endpoint that only does the SMTP send — so the email can never disagree with the page, and the
 * mail credentials stay on Modal where the other report senders already live. Auth reuses the
 * existing DJC impact token, so the only new configuration is the endpoint URL.
 */
const DEFAULT_ENDPOINT =
  'https://anddy0622--djc-automation-djc-client-report-endpoint.modal.run'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  let body: { recipients?: unknown } = {}
  try { body = await req.json() } catch { /* fall through to validation */ }

  const recipients: string[] = Array.isArray(body.recipients)
    ? body.recipients.map(x => String(x).trim()).filter(Boolean)
    : []
  if (recipients.length === 0) {
    return NextResponse.json({ ok: false, error: 'Add at least one recipient.' }, { status: 400 })
  }
  const invalid = recipients.filter(e => !EMAIL_RE.test(e))
  if (invalid.length) {
    return NextResponse.json(
      { ok: false, error: `Invalid email${invalid.length > 1 ? 's' : ''}: ${invalid.join(', ')}` },
      { status: 400 },
    )
  }

  const token = (process.env.MODAL_DJC_IMPACT_TOKEN || '').trim()
  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'MODAL_DJC_IMPACT_TOKEN is not configured on the server.' },
      { status: 503 },
    )
  }
  const endpoint = (process.env.MODAL_DJC_CLIENT_REPORT_URL || DEFAULT_ENDPOINT).trim()

  try {
    const report = await getClientReport()
    const html = renderClientReportEmail(report)
    const subject = `Proxi — automation report, ${new Date().toLocaleDateString('en-US',
      { month: 'long', day: 'numeric', year: 'numeric' })}`

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 45_000)
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, recipients, subject, html }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return NextResponse.json(
        { ok: false, error: `Send failed (${res.status}). ${detail.slice(0, 200)}` },
        { status: 502 },
      )
    }
    return NextResponse.json({ ok: true, recipients })
  } catch (err) {
    console.error('Client report send failed:', err)
    return NextResponse.json({ ok: false, error: 'Could not build or send the report.' }, { status: 500 })
  }
}
