import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { MOHAMED_COOKIE_NAME, verifyMohamedCookieValue } from '@/lib/mohamedAuth'
import { getInFlightRunRequest } from '@/lib/mohamedRunRequests'

/** Read-only: is the latest in-flight run request waiting on a portal-session
 * repair? Used by CsvUploadCard so an upload never looks like it went into a
 * black hole while the keeper is mid-repair. */
export async function GET(req: NextRequest) {
  const adminOk = await verifyAdminCookieValue(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  const mohamedOk = await verifyMohamedCookieValue(req.cookies.get(MOHAMED_COOKIE_NAME)?.value)
  if (!adminOk && !mohamedOk) {
    return NextResponse.json({ ok: false, error: 'Sign in first.' }, { status: 401 })
  }

  try {
    const inFlight = await getInFlightRunRequest()
    const waiting = inFlight?.progress === 'waiting_for_portal_session'
    return NextResponse.json({ ok: true, waitingForPortalSession: waiting })
  } catch {
    // Best-effort: a failed health check must not block uploads — the card
    // just skips the amber notice this refresh.
    return NextResponse.json({ ok: true, waitingForPortalSession: false })
  }
}
