import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { requestRunCancel, CancelError } from '@/lib/mohamedRunRequests'

// Same reasoning as app/mohamed/page.tsx: co-locate with the Tokyo-region
// Mohamed Supabase project instead of paying a trans-Pacific round trip.
export const preferredRegion = 'hnd1'

/**
 * Admin-only: stops an in-flight run. This is a REQUEST, not a kill switch —
 * see lib/mohamedRunRequests.ts requestRunCancel. The VPS poller (already
 * mid-run) checks the flag between claims and stops there; a claim already
 * being entered on HCPF always finishes on its own, never yanked away
 * half-done. Expect the run to keep going for up to one more claim after
 * this returns ok:true.
 */
export async function POST(req: NextRequest) {
  const isAdmin = await verifyAdminCookieValue(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!isAdmin) return NextResponse.json({ ok: false, error: 'Sign in as admin first.' }, { status: 401 })

  let body: unknown = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const requestId = Number((body as { requestId?: unknown })?.requestId)
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid requestId.' }, { status: 400 })
  }

  try {
    const cancelled = await requestRunCancel(requestId, 'hub_admin')
    if (!cancelled) {
      return NextResponse.json(
        { ok: false, error: 'Nothing to cancel — the run already finished, or a stop was already requested.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof CancelError ? err.message : 'Could not send the stop request — try again.'
    console.error('Mohamed cancel failed:', err)
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
