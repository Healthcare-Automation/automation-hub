import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { enqueueRunRequest, getInFlightRunRequest, EnqueueError } from '@/lib/mohamedRunRequests'

/**
 * Admin-only: Mohamed can view run results but does not operate the pipeline.
 * A VPS-side systemd timer polls mohamed_run_requests every ~1 minute and picks
 * this up — there is no direct connection from the hub to the VPS, so this
 * enqueues a request rather than running anything itself. Expect up to a
 * ~1 minute delay before the run actually starts.
 */
export async function POST(req: NextRequest) {
  const isAdmin = await verifyAdminCookieValue(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!isAdmin) return NextResponse.json({ ok: false, error: 'Sign in as admin first.' }, { status: 401 })

  const inFlight = await getInFlightRunRequest().catch(() => null)
  if (inFlight) {
    return NextResponse.json({
      ok: false,
      error: `A run is already ${inFlight.status} (requested ${inFlight.requestedAt}). Wait for it to finish.`,
      inFlight,
    }, { status: 409 })
  }

  try {
    const request = await enqueueRunRequest('hub_admin', 'fixture')
    return NextResponse.json({ ok: true, request })
  } catch (err) {
    const message = err instanceof EnqueueError ? err.message : 'Could not queue the run — try again.'
    console.error('Mohamed trigger failed:', err)
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}

export async function GET(req: NextRequest) {
  const isAdmin = await verifyAdminCookieValue(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!isAdmin) return NextResponse.json({ ok: false, error: 'Sign in as admin first.' }, { status: 401 })
  const request = await getInFlightRunRequest().catch(() => null)
  return NextResponse.json({ ok: true, inFlight: request })
}
