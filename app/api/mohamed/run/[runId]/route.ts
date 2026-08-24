import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { MOHAMED_COOKIE_NAME, verifyMohamedCookieValue } from '@/lib/mohamedAuth'
import { getMohamedLedger } from '@/lib/mohamedQueries'
import { getApprovalsForRun } from '@/lib/mohamedApprovals'

export const dynamic = 'force-dynamic'
// Same reasoning as app/mohamed/page.tsx: the Mohamed Supabase project lives
// in Tokyo, so run the function there instead of paying trans-Pacific hops.
export const preferredRegion = 'hnd1'

const RUN_ID = /^[0-9a-f]{32}$/

/**
 * Run drill-down for the side panel: one run's PHI-free ledger plus its
 * approvals, as JSON. Powers RunDetailPanel so clicking a run in the history
 * table opens in place instead of a disorienting full-page navigation
 * (the /mohamed?run=<id> deep link still works as the fallback view).
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
    // Approvals failing must not sink the panel — same degrade rule as the page.
    const approvals = await getApprovalsForRun(runId).catch(() => new Map())
    return NextResponse.json({ ok: true, ledger, approvals: Object.fromEntries(approvals) })
  } catch (err) {
    console.error('Mohamed run detail failed:', err)
    return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 })
  }
}
