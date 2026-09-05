import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { MOHAMED_COOKIE_NAME, verifyMohamedCookieValue } from '@/lib/mohamedAuth'
import { getMohamedLedger } from '@/lib/mohamedQueries'

export const dynamic = 'force-dynamic'
// Same reasoning as app/mohamed/page.tsx: the Mohamed Supabase project lives
// in Tokyo, so run the function there instead of paying trans-Pacific hops.
export const preferredRegion = 'hnd1'

const RUN_ID = /^[0-9a-f]{32}$/

/**
 * Run drill-down: one run's PHI-free ledger as JSON. Powers the expanded
 * run row in RunHistory (claims, HCPF status, paid vs claimed).
 * Auth-gated exactly like /api/mohamed/approve — same cookies, same 401.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const adminOk = await verifyAdminCookieValue(request.cookies.get(ADMIN_COOKIE_NAME)?.value)
  const mohamedOk = await verifyMohamedCookieValue(request.cookies.get(MOHAMED_COOKIE_NAME)?.value)
  if (!adminOk && !mohamedOk) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { runId } = await params
  if (!RUN_ID.test(runId)) {
    return NextResponse.json({ ok: false, error: 'invalid_run_id' }, { status: 400 })
  }

  try {
    const ledger = await getMohamedLedger(runId)
    if (!ledger) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, ledger })
  } catch (err) {
    console.error('Mohamed run detail failed:', err)
    return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 })
  }
}
