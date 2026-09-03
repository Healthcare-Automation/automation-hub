import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { MOHAMED_COOKIE_NAME, verifyMohamedCookieValue } from '@/lib/mohamedAuth'
import {
  BrowserCommandError,
  BrowserNotMigratedError,
  enqueueBrowserCommand,
  getBrowserStatus,
  getLatestBrowserCommand,
} from '@/lib/mohamedBrowser'
import { getInFlightRunRequest } from '@/lib/mohamedRunRequests'

// Same reasoning as app/mohamed/page.tsx: co-locate with the Tokyo-region
// Mohamed Supabase project instead of paying a trans-Pacific round trip.
export const preferredRegion = 'hnd1'

/**
 * Portal browser on/off (Andy 2026-09-03). GET: current state for the card
 * (admin or Mohamed). POST {command:'start'|'stop'}: admin-only — enqueues a
 * command the VPS poll tick executes within ~1 minute. There is no direct
 * hub->VPS connection; a stop while a run is in flight is REJECTED by the
 * poller (never yanks a half-entered claim off the portal) and shows up
 * here as the latest command's errorCode.
 */
export async function GET(req: NextRequest) {
  const adminOk = await verifyAdminCookieValue(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  const mohamedOk = await verifyMohamedCookieValue(req.cookies.get(MOHAMED_COOKIE_NAME)?.value)
  if (!adminOk && !mohamedOk) return NextResponse.json({ ok: false, error: 'Sign in first.' }, { status: 401 })

  try {
    const [status, latest, inFlight] = await Promise.all([
      getBrowserStatus(),
      getLatestBrowserCommand(),
      getInFlightRunRequest().catch(() => null),
    ])
    return NextResponse.json({ ok: true, status, latest, runInFlight: Boolean(inFlight) })
  } catch (err) {
    if (err instanceof BrowserNotMigratedError) {
      return NextResponse.json({ ok: true, status: null, latest: null, runInFlight: false, notMigrated: true })
    }
    console.error('Mohamed browser status failed:', err)
    return NextResponse.json({ ok: false, error: 'Could not read the browser status — try again.' }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  const isAdmin = await verifyAdminCookieValue(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!isAdmin) return NextResponse.json({ ok: false, error: 'Sign in as admin first.' }, { status: 401 })

  let body: unknown = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const command = (body as { command?: unknown })?.command
  if (command !== 'start' && command !== 'stop') {
    return NextResponse.json({ ok: false, error: 'command must be "start" or "stop".' }, { status: 400 })
  }

  if (command === 'stop') {
    // Fail fast with a clear message instead of making the user wait a
    // minute for the poller to reject it. The poller re-checks anyway.
    const inFlight = await getInFlightRunRequest().catch(() => null)
    if (inFlight) {
      return NextResponse.json(
        { ok: false, error: 'A billing run is in progress. Stop the run first, or wait for it to finish.' },
        { status: 409 },
      )
    }
  }

  try {
    const request = await enqueueBrowserCommand(command, 'hub_admin')
    return NextResponse.json({ ok: true, request })
  } catch (err) {
    if (err instanceof BrowserCommandError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 409 })
    }
    console.error('Mohamed browser command failed:', err)
    return NextResponse.json({ ok: false, error: 'Could not send the request — try again.' }, { status: 503 })
  }
}
