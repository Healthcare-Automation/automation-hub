import { NextResponse } from 'next/server'
import djcSql from '@/lib/djcDb'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

/** Live read of the latest summary — bypasses ISR so the refresh button can poll for the new row. */
export async function GET() {
  if (!djcSql) return NextResponse.json({ ok: false }, { status: 500 })
  const rows = await djcSql<{ id: number; text: string; generated_at: string }[]>`
    select id, summary as text,
           to_char(generated_at at time zone 'America/New_York', 'Mon DD, YYYY') as generated_at
    from djc_exec_summary order by id desc limit 1`
  const r = rows[0]
  return NextResponse.json(
    r ? { ok: true, summary: { id: Number(r.id), text: r.text, generatedAt: r.generated_at } } : { ok: true, summary: null },
  )
}

// Stable Modal web-endpoint URL for djc_summary_endpoint (auth is by token, not obscurity).
const SUMMARY_URL = 'https://anddy0622--djc-automation-djc-summary-endpoint.modal.run'

/** Refresh-button hook: asks Modal to regenerate the weekly executive summary.
 *  Generation is async upstream (~30s); the client re-fetches after a delay. */
export async function POST() {
  const token = process.env.MODAL_DJC_IMPACT_TOKEN
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Summary refresh is not configured.' }, { status: 500 })
  }
  try {
    const res = await fetch(SUMMARY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Upstream error (${res.status}).` }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not reach the summary service.' }, { status: 502 })
  }
}
