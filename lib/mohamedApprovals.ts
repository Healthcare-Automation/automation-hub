import mohamedApprovalSql from './mohamedApprovalDb'
import { isMohamedLedgerConfigured, mohamedQuery } from './mohamedDb'

export type ClaimDecision = 'approved' | 'rejected'

export type ClaimApproval = {
  runId: string
  claimRef: string
  approved: boolean
  decision: ClaimDecision | null
  reason: string | null
  approvedBy: string | null
  approvedAt: string | null
}

type ApprovalRow = {
  run_id: string
  claim_ref: string
  approved: boolean
  decision?: string | null
  reason?: string | null
  approved_by: string | null
  approved_at: string | null
}

function toApproval(row: ApprovalRow): ClaimApproval {
  const decision = row.decision === 'approved' || row.decision === 'rejected' ? row.decision : null
  return {
    runId: row.run_id,
    claimRef: row.claim_ref,
    approved: row.approved,
    // Pre-migration rows have no decision column; treat approved=true as an
    // approved decision so the UI renders the same either way.
    decision: decision ?? (row.approved ? 'approved' : null),
    reason: row.reason ?? null,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
  }
}

/** Postgres "column does not exist" — how we feature-detect the 005 migration. */
function isMissingColumn(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: string }).code === '42703')
}

/** Reads with the same read-only role as the rest of the ledger — approvals
 * are shown alongside a run's claims, so this stays on mohamed_hub_reader. */
export async function getApprovalsForRun(runId: string): Promise<Map<string, ClaimApproval>> {
  if (!isMohamedLedgerConfigured) return new Map()
  let rows: ApprovalRow[]
  try {
    rows = await mohamedQuery(sql => sql<ApprovalRow[]>`
      select run_id, claim_ref, approved, decision, reason, approved_by, approved_at
      from mohamed_claim_approvals
      where run_id = ${runId}
    `)
  } catch (err) {
    // 005_claim_reviews.sql not applied yet: fall back to the legacy column
    // set so the page keeps working pre-migration instead of breaking.
    if (!isMissingColumn(err)) throw err
    rows = await mohamedQuery(sql => sql<ApprovalRow[]>`
      select run_id, claim_ref, approved, approved_by, approved_at
      from mohamed_claim_approvals
      where run_id = ${runId}
    `)
  }
  return new Map(rows.map(row => [row.claim_ref, toApproval(row)]))
}

const CLAIM_REF = /^[0-9a-f]{16}$/
const RUN_ID = /^[0-9a-f]{32}$/
const APPROVER = /^[a-z0-9_.:-]{1,40}$/
export const REASON_MAX_LENGTH = 2000

export class ApprovalWriteError extends Error {}

export type ApprovalAction = ClaimDecision | 'clear'

export type NormalisedApprovalBody =
  | { ok: true; action: ApprovalAction; reason: string | null }
  | { ok: false; error: string }

/**
 * Pure request-shape logic for /api/mohamed/approve, extracted so it can be
 * unit-tested without a server. Accepts the new
 * {decision: 'approved'|'rejected'|'clear', reason?} shape and the legacy
 * {approved: boolean} shape (true→approved, false→clear) for back-compat.
 */
export function normaliseApprovalBody(body: unknown): NormalisedApprovalBody {
  const { decision, approved, reason } = (body ?? {}) as {
    decision?: unknown
    approved?: unknown
    reason?: unknown
  }
  let action: ApprovalAction
  if (decision === 'approved' || decision === 'rejected' || decision === 'clear') {
    action = decision
  } else if (decision === undefined && typeof approved === 'boolean') {
    action = approved ? 'approved' : 'clear'
  } else {
    return { ok: false, error: 'invalid_decision' }
  }
  if (action === 'rejected') {
    const text = typeof reason === 'string' ? reason.trim() : ''
    if (!text) return { ok: false, error: 'reason_required' }
    if (text.length > REASON_MAX_LENGTH) return { ok: false, error: 'reason_too_long' }
    return { ok: true, action, reason: text }
  }
  return { ok: true, action, reason: null }
}

/** Same 6s hang watchdog idea as mohamedQuery(), for the approval write
 * handle — a dead cached socket must not hang the approve request forever. */
async function raceWrite<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ApprovalWriteError('write_timeout')), 6000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Writes with the narrow mohamed_hub_approver role — insert/update on
 * mohamed_claim_approvals only. Never touches mohamed_runs/mohamed_run_events.
 *
 * action='clear' resets the row to undecided. `approved` stays as a boolean
 * for back-compat with pre-decision readers: true only when
 * action='approved'. Degrades pre-migration (005_claim_reviews.sql):
 * approve/clear fall back to the legacy column set; reject cannot be stored
 * without the columns and throws 'not_migrated'.
 */
export async function setClaimApproval(
  runId: string,
  claimRef: string,
  action: ApprovalAction,
  approvedBy: string,
  reason: string | null = null,
): Promise<void> {
  const sql = mohamedApprovalSql
  if (!sql) throw new ApprovalWriteError('not_configured')
  if (!RUN_ID.test(runId) || !CLAIM_REF.test(claimRef) || !APPROVER.test(approvedBy)) {
    throw new ApprovalWriteError('invalid_input')
  }
  if (action === 'rejected' && (!reason || reason.length > REASON_MAX_LENGTH)) {
    throw new ApprovalWriteError('invalid_reason')
  }
  const approved = action === 'approved'
  const decision = action === 'clear' ? null : action
  const storedReason = action === 'rejected' ? reason : null
  try {
    await raceWrite(sql`
      insert into mohamed_claim_approvals (run_id, claim_ref, approved, decision, reason, approved_by, approved_at, updated_at)
      values (${runId}, ${claimRef}, ${approved}, ${decision}, ${storedReason}, ${approvedBy}, ${approved ? sql`now()` : null}, now())
      on conflict (run_id, claim_ref) do update set
        approved = excluded.approved,
        decision = excluded.decision,
        reason = excluded.reason,
        approved_by = excluded.approved_by,
        approved_at = excluded.approved_at,
        updated_at = now()
    `)
  } catch (err) {
    if (!isMissingColumn(err)) throw err
    // 005 migration not applied. A rejection has nowhere to live — surface
    // that explicitly so the UI can say "run the migration". Approve/clear
    // still work through the legacy columns.
    if (action === 'rejected') throw new ApprovalWriteError('not_migrated')
    await raceWrite(sql`
      insert into mohamed_claim_approvals (run_id, claim_ref, approved, approved_by, approved_at, updated_at)
      values (${runId}, ${claimRef}, ${approved}, ${approvedBy}, ${approved ? sql`now()` : null}, now())
      on conflict (run_id, claim_ref) do update set
        approved = excluded.approved,
        approved_by = excluded.approved_by,
        approved_at = excluded.approved_at,
        updated_at = now()
    `)
  }
}
