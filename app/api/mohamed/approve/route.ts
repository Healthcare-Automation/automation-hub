import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { MOHAMED_COOKIE_NAME, verifyMohamedCookieValue } from '@/lib/mohamedAuth'
import { ApprovalWriteError, normaliseApprovalBody, setClaimApproval } from '@/lib/mohamedApprovals'

export const preferredRegion = 'hnd1'

const RUN_ID = /^[0-9a-f]{32}$/
const CLAIM_REF = /^[0-9a-f]{16}$/

/**
 * The "green light" gate: records one reviewer decision per claim per run —
 * approved, rejected (with a required reason, Andy's feedback-loop ask), or
 * cleared back to undecided. This ONLY records intent — there is no
 * submission path yet (see docs/production-readiness-checklist.md), so
 * approving a claim here does not cause anything to be sent to HCPF. Built
 * now so the review workflow is ready the moment live submission exists.
 *
 * Body: {runId, claimRef, decision: 'approved'|'rejected'|'clear', reason?}.
 * The legacy {approved: boolean} shape still works (true→approved,
 * false→clear) so nothing cached/in-flight breaks on deploy.
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
  const { runId, claimRef } = (body ?? {}) as { runId?: unknown; claimRef?: unknown }
  if (typeof runId !== 'string' || !RUN_ID.test(runId)) {
    return NextResponse.json({ ok: false, error: 'invalid_run_id' }, { status: 400 })
  }
  if (typeof claimRef !== 'string' || !CLAIM_REF.test(claimRef)) {
    return NextResponse.json({ ok: false, error: 'invalid_claim_ref' }, { status: 400 })
  }
  const parsed = normaliseApprovalBody(body)
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 })
  }

  const approvedBy = adminOk ? 'admin' : 'mohamed_portal'
  try {
    await setClaimApproval(runId, claimRef, parsed.action, approvedBy, parsed.reason)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof ApprovalWriteError ? err.message : 'approval_write_failed'
    console.error('Mohamed claim approval failed:', err)
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
