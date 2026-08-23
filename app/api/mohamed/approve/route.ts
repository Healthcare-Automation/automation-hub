import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { MOHAMED_COOKIE_NAME, verifyMohamedCookieValue } from '@/lib/mohamedAuth'
import { ApprovalWriteError, setClaimApproval } from '@/lib/mohamedApprovals'

export const preferredRegion = 'hnd1'

const RUN_ID = /^[0-9a-f]{32}$/
const CLAIM_REF = /^[0-9a-f]{16}$/

/**
 * The "green light" gate: marks one claim in one run as approved (or
 * un-approves it). This ONLY records intent — there is no submission path
 * yet (see docs/production-readiness-checklist.md), so approving a claim
 * here does not cause anything to be sent to HCPF. Built now so the review
 * workflow is ready the moment live submission exists.
 */
export async function POST(request: NextRequest) {
  const adminOk = await verifyAdminCookieValue(request.cookies.get(ADMIN_COOKIE_NAME)?.value)
  const mohamedOk = await verifyMohamedCookieValue(request.cookies.get(MOHAMED_COOKIE_NAME)?.value)
  if (!adminOk && !mohamedOk) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  const { runId, claimRef, approved } = (body ?? {}) as { runId?: unknown; claimRef?: unknown; approved?: unknown }
  if (typeof runId !== 'string' || !RUN_ID.test(runId)) {
    return NextResponse.json({ ok: false, error: 'invalid_run_id' }, { status: 400 })
  }
  if (typeof claimRef !== 'string' || !CLAIM_REF.test(claimRef)) {
    return NextResponse.json({ ok: false, error: 'invalid_claim_ref' }, { status: 400 })
  }
  if (typeof approved !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'invalid_approved' }, { status: 400 })
  }

  const approvedBy = adminOk ? 'admin' : 'mohamed_portal'
  try {
    await setClaimApproval(runId, claimRef, approved, approvedBy)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof ApprovalWriteError ? err.message : 'approval_write_failed'
    console.error('Mohamed claim approval failed:', err)
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
