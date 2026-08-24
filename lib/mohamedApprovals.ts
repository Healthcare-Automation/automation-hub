import mohamedApprovalSql from './mohamedApprovalDb'
import { isMohamedLedgerConfigured, mohamedQuery } from './mohamedDb'

export type ClaimApproval = {
  runId: string
  claimRef: string
  approved: boolean
  approvedBy: string | null
  approvedAt: string | null
}

type ApprovalRow = {
  run_id: string
  claim_ref: string
  approved: boolean
  approved_by: string | null
  approved_at: string | null
}

function toApproval(row: ApprovalRow): ClaimApproval {
  return {
    runId: row.run_id,
    claimRef: row.claim_ref,
    approved: row.approved,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
  }
}

/** Reads with the same read-only role as the rest of the ledger — approvals
 * are shown alongside a run's claims, so this stays on mohamed_hub_reader. */
export async function getApprovalsForRun(runId: string): Promise<Map<string, ClaimApproval>> {
  if (!isMohamedLedgerConfigured) return new Map()
  const rows = await mohamedQuery(sql => sql<ApprovalRow[]>`
    select run_id, claim_ref, approved, approved_by, approved_at
    from mohamed_claim_approvals
    where run_id = ${runId}
  `)
  return new Map(rows.map(row => [row.claim_ref, toApproval(row)]))
}

const CLAIM_REF = /^[0-9a-f]{16}$/
const RUN_ID = /^[0-9a-f]{32}$/
const APPROVER = /^[a-z0-9_.:-]{1,40}$/

export class ApprovalWriteError extends Error {}

/** Writes with the narrow mohamed_hub_approver role — insert/update on
 * mohamed_claim_approvals only. Never touches mohamed_runs/mohamed_run_events. */
export async function setClaimApproval(
  runId: string,
  claimRef: string,
  approved: boolean,
  approvedBy: string,
): Promise<void> {
  const sql = mohamedApprovalSql
  if (!sql) throw new ApprovalWriteError('not_configured')
  if (!RUN_ID.test(runId) || !CLAIM_REF.test(claimRef) || !APPROVER.test(approvedBy)) {
    throw new ApprovalWriteError('invalid_input')
  }
  await sql`
    insert into mohamed_claim_approvals (run_id, claim_ref, approved, approved_by, approved_at, updated_at)
    values (${runId}, ${claimRef}, ${approved}, ${approvedBy}, ${approved ? sql`now()` : null}, now())
    on conflict (run_id, claim_ref) do update set
      approved = excluded.approved,
      approved_by = excluded.approved_by,
      approved_at = excluded.approved_at,
      updated_at = now()
  `
}
