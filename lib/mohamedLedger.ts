/**
 * Mirror of the Python PHI-free run ledger (src/mohamed_billing/audit.py).
 *
 * A ledger never carries member identifiers, names, service dates tied to a
 * member, or field values — only hashed claim refs, counts, stage/step names,
 * action/field names, reason/error codes and timings. The hub displays it
 * verbatim; it must never be enriched with source data.
 */

export type LedgerStatus = 'started' | 'ok' | 'blocked' | 'failed' | 'skipped'
export type LedgerStage =
  | 'extraction'
  | 'billing_rules'
  | 'claim_assembly'
  | 'overlap_guard'
  | 'hcpf_navigation'
  | 'submission'

export const LEDGER_STAGES: LedgerStage[] = [
  'extraction',
  'billing_rules',
  'claim_assembly',
  'overlap_guard',
  'hcpf_navigation',
  'submission',
]

export const STAGE_LABELS: Record<LedgerStage, string> = {
  extraction: 'AxisCare extraction',
  billing_rules: 'Billing rules',
  claim_assembly: 'Claim assembly',
  overlap_guard: 'Overlap guard',
  hcpf_navigation: 'HCPF review navigation',
  submission: 'Claim submission',
}

export type RunEvent = {
  run_id: string
  seq: number
  at: string
  stage: LedgerStage
  step: string
  status: LedgerStatus
  claim_ref: string | null
  action: string | null
  field: string | null
  code: string | null
  detail: Record<string, number | string>
  duration_ms: number | null
}

export type StageSummary = { stage: LedgerStage; status: 'passed' | 'blocked' | 'failed' | 'not_run'; events: number }

export type RunLedgerSnapshot = {
  run_id: string
  mode: string
  source: string
  period_start: string
  period_end: string
  started_at: string
  finished_at: string | null
  status: 'review_ready' | 'blocked' | 'failed'
  stages: StageSummary[]
  first_failure: RunEvent | null
  events: RunEvent[]
}

export type ClaimTrace = {
  claimRef: string
  portalActions: number
  failedActions: number
  reachedReview: boolean
  failureCode: string | null
  failureField: string | null
  procedureCode: string | null
  modifiers: string | null
  unitsX100: number | null
  chargeCents: number | null
}

/** One row per claim, derived purely from the event stream. */
export function summariseClaims(ledger: RunLedgerSnapshot): ClaimTrace[] {
  const byRef = new Map<string, ClaimTrace>()
  for (const event of ledger.events) {
    if (!event.claim_ref) continue
    const trace = byRef.get(event.claim_ref) ?? {
      claimRef: event.claim_ref,
      portalActions: 0,
      failedActions: 0,
      reachedReview: false,
      failureCode: null,
      failureField: null,
      procedureCode: null,
      modifiers: null,
      unitsX100: null,
      chargeCents: null,
    }
    if (event.step === 'claim_drafted') {
      trace.procedureCode = typeof event.detail.procedure_code === 'string' ? event.detail.procedure_code : null
      trace.modifiers = typeof event.detail.modifiers === 'string' ? event.detail.modifiers : null
      trace.unitsX100 = typeof event.detail.units_x100 === 'number' ? event.detail.units_x100 : null
      trace.chargeCents = typeof event.detail.charge_cents === 'number' ? event.detail.charge_cents : null
    }
    if (event.step === 'portal_action') {
      trace.portalActions += 1
      if (event.status === 'failed') trace.failedActions += 1
    }
    if (event.step === 'reached_review' && event.status === 'ok') trace.reachedReview = true
    if (event.status === 'failed' && !trace.failureCode) {
      trace.failureCode = event.code
      trace.failureField = event.field
    }
    byRef.set(event.claim_ref, trace)
  }
  return [...byRef.values()]
}

/** Where the run stopped, in one line, or null when it reached the end state. */
export function describeFailure(ledger: RunLedgerSnapshot): string | null {
  const failure = ledger.first_failure
  if (!failure) return null
  const where = [STAGE_LABELS[failure.stage], failure.step].join(' › ')
  const what = [failure.action, failure.field].filter(Boolean).join(':')
  const claim = failure.claim_ref ? ` (claim ${failure.claim_ref})` : ''
  return `${where}${what ? ` › ${what}` : ''}${claim}: ${failure.code ?? 'failed'} at event #${failure.seq}`
}

const IDENTIFIER_LIKE = /[A-Z]{2,}-?[A-Z0-9]{2,}|\d{4}-\d{2}-\d{2}/

/** Defensive check used by tests and by the ingest path: a ledger must not contain identifier-like strings in free positions. */
export function ledgerLooksPhiFree(ledger: RunLedgerSnapshot): boolean {
  for (const event of ledger.events) {
    for (const value of [event.step, event.action, event.field, event.code, ...Object.values(event.detail)]) {
      if (typeof value === 'string' && IDENTIFIER_LIKE.test(value)) return false
    }
  }
  return true
}
