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

export type ClaimLineTrace = {
  procedureCode: string | null
  modifiers: string | null
  unitsX100: number | null
  chargeCents: number | null
}

export type ClaimTrace = {
  claimRef: string
  portalActions: number
  failedActions: number
  reachedReview: boolean
  failureCode: string | null
  failureField: string | null
  /** First service line's code/modifiers -- the claim's headline. */
  procedureCode: string | null
  modifiers: string | null
  /** CLAIM totals: the sum over every service line. pipeline.py records one
   * claim_drafted event per line, and the old summary kept only the LAST
   * line's numbers, so a two-line claim's card showed line 2's units and
   * charge while its screenshot showed line 1 (Andy, 2026-09-05: "the
   * number shown on the left needs to always match the input numbers in
   * the screenshot"). Per-line numbers live in `lines`. */
  unitsX100: number | null
  chargeCents: number | null
  lines: ClaimLineTrace[]
  /** HCPF's own receipt detail (Andy, 2026-09-05: "for the real claims,
   * we need to show on automation hub if they actually went through or
   * not") -- null unless this run actually submitted the claim and the
   * receipt scrape succeeded. hcpfStatus is HCPF's own status word,
   * lowercased at the source (audit.py's ledger detail validator requires
   * it), never re-interpreted here. */
  hcpfClaimId: string | null
  hcpfStatus: string | null
  /** What HCPF actually paid, from the mandatory post-submission Search
   * Claims re-check (Andy, 2026-09-05: "how much of those were actually
   * paid vs claimed"). null = not checked yet; 0 = genuinely $0 (denied). */
  paidCents: number | null
  /** The post-submission validation result: an independent HCPF Search
   * Claims re-check compared against the receipt. null when this claim was
   * never submitted or the validation pass hasn't run yet. */
  validation: {
    status: 'match' | 'mismatch' | 'not_found' | 'error' | 'skipped'
    hcpfStatus: string | null
  } | null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
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
      lines: [],
      hcpfClaimId: null,
      hcpfStatus: null,
      paidCents: null,
      validation: null,
    }
    if (event.step === 'claim_drafted') {
      const line: ClaimLineTrace = {
        procedureCode: str(event.detail.procedure_code),
        modifiers: str(event.detail.modifiers),
        unitsX100: num(event.detail.units_x100),
        chargeCents: num(event.detail.charge_cents),
      }
      trace.lines.push(line)
      if (trace.procedureCode === null) trace.procedureCode = line.procedureCode
      if (trace.modifiers === null) trace.modifiers = line.modifiers
      if (line.unitsX100 !== null) trace.unitsX100 = (trace.unitsX100 ?? 0) + line.unitsX100
      if (line.chargeCents !== null) trace.chargeCents = (trace.chargeCents ?? 0) + line.chargeCents
    }
    if (event.step === 'portal_action') {
      trace.portalActions += 1
      if (event.status === 'failed') trace.failedActions += 1
    }
    if (event.step === 'reached_review' && event.status === 'ok') trace.reachedReview = true
    if (event.step === 'hcpf_receipt' && event.status === 'ok') {
      trace.hcpfClaimId = str(event.detail.claim_id)
      trace.hcpfStatus = str(event.detail.hcpf_status)
    }
    if (event.step === 'submission_validated') {
      const code = event.code ?? ''
      const status: NonNullable<ClaimTrace['validation']>['status'] =
        event.status === 'skipped'
          ? 'skipped'
          : code === 'match'
            ? 'match'
            : code === 'status_mismatch'
              ? 'mismatch'
              : code === 'not_found_in_hcpf_search'
                ? 'not_found'
                : 'error'
      const confirmedStatus = str(event.detail.hcpf_status)
      trace.validation = { status, hcpfStatus: confirmedStatus }
      // The re-check is HCPF's later, authoritative word: it fills in a
      // status the receipt scrape missed and carries the paid amount.
      if (confirmedStatus && (status === 'match' || status === 'mismatch')) trace.hcpfStatus = confirmedStatus
      const paid = num(event.detail.paid_cents)
      if (paid !== null) trace.paidCents = paid
      if (trace.hcpfClaimId === null) trace.hcpfClaimId = str(event.detail.hcpf_claim_id)
    }
    if (event.status === 'failed' && !trace.failureCode && event.step !== 'submission_validated') {
      trace.failureCode = event.code
      trace.failureField = event.field
    }
    byRef.set(event.claim_ref, trace)
  }
  return [...byRef.values()]
}

/** True when the claim was actually sent to HCPF (a submit event that
 * succeeded), regardless of whether the receipt scrape later worked. */
export function wasSubmitted(ledger: RunLedgerSnapshot, claimRef: string): boolean {
  return ledger.events.some(e => e.claim_ref === claimRef && e.step === 'submit' && e.status === 'ok')
}

export type SubmissionSummary = {
  /** Claims this run actually sent to HCPF. */
  submitted: number
  paid: number
  denied: number
  /** Submitted but HCPF's status is something else / unknown yet. */
  other: number
  chargedCents: number
  /** Sum of HCPF's paid amounts over submitted claims that have been
   * re-checked. null when none has. */
  paidCents: number | null
  /** Claims whose re-check disagreed with the receipt, or wasn't found. */
  flagged: number
}

/** Paid-vs-claimed roll-up for a submit-mode run (Andy, 2026-09-05). */
export function summariseSubmissions(ledger: RunLedgerSnapshot, claims = summariseClaims(ledger)): SubmissionSummary {
  const out: SubmissionSummary = { submitted: 0, paid: 0, denied: 0, other: 0, chargedCents: 0, paidCents: null, flagged: 0 }
  for (const claim of claims) {
    if (!wasSubmitted(ledger, claim.claimRef)) continue
    out.submitted += 1
    out.chargedCents += claim.chargeCents ?? 0
    if (claim.hcpfStatus === 'paid') out.paid += 1
    else if (claim.hcpfStatus === 'denied') out.denied += 1
    else out.other += 1
    if (claim.paidCents !== null) out.paidCents = (out.paidCents ?? 0) + claim.paidCents
    if (claim.validation && (claim.validation.status === 'mismatch' || claim.validation.status === 'not_found')) out.flagged += 1
  }
  return out
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

export type CoverageGapAlert = { visitsNeverBilled: number; membersAffected: number }

/** The coverage-gap alert event, when this run held visits back because a
 * member lacked one of the two required coverages (client decision
 * 2026-08-24: never bill these — but always alert). */
export function coverageGapAlert(ledger: RunLedgerSnapshot): CoverageGapAlert | null {
  const event = ledger.events.find(e => e.step === 'coverage_gap_alert')
  if (!event) return null
  const visits = Number(event.detail['visits_never_billed'] ?? 0)
  const members = Number(event.detail['members_affected'] ?? 0)
  if (!visits) return null
  return { visitsNeverBilled: visits, membersAffected: members }
}

/** A single plain-language sentence for someone who does not want to read an event log.
 * This is the first thing a non-technical reader should see. */
export function summariseInPlainLanguage(ledger: RunLedgerSnapshot): string {
  const claims = summariseClaims(ledger)
  const reached = claims.filter(c => c.reachedReview).length
  const failed = claims.filter(c => !c.reachedReview).length
  const blockedStage = ledger.stages.find(s => s.stage === 'billing_rules')
  const isSubmit = ledger.mode === 'submit'

  if (ledger.status === 'failed') {
    const failure = ledger.first_failure
    const where = failure ? STAGE_LABELS[failure.stage] : 'an unknown stage'
    const sub = summariseSubmissions(ledger, claims)
    const tail = isSubmit && sub.submitted > 0
      ? ` ${sub.submitted} claim${sub.submitted === 1 ? ' was' : 's were'} submitted before it stopped.`
      : ' Nothing was submitted.'
    return `Stopped during ${where.toLowerCase()} — ${reached} claim${reached === 1 ? '' : 's'} made it through before the run failed.${tail}`
  }
  if (reached === 0 && failed === 0) {
    return blockedStage?.status === 'blocked'
      ? 'No claims were built — every row this run saw was blocked by a billing rule (see Billing rules below for why).'
      : 'This run found nothing to bill.'
  }
  if (isSubmit) {
    const sub = summariseSubmissions(ledger, claims)
    const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
    const parts: string[] = [`${sub.submitted} claim${sub.submitted === 1 ? '' : 's'} submitted to HCPF`]
    if (sub.paid > 0) parts.push(`${sub.paid} paid`)
    if (sub.denied > 0) parts.push(`${sub.denied} denied`)
    if (sub.other > 0) parts.push(`${sub.other} awaiting HCPF`)
    const totals = sub.paidCents !== null ? ` — ${money(sub.paidCents)} paid of ${money(sub.chargedCents)} claimed` : ''
    const unfinished = failed > 0 ? ` ${failed} claim${failed === 1 ? '' : 's'} did not reach HCPF.` : ''
    return `${parts.join(', ')}${totals}.${unfinished}`
  }
  if (failed > 0) {
    return `${reached} of ${reached + failed} claim${reached + failed === 1 ? '' : 's'} reached HCPF Review; ${failed} did not. Nothing was submitted — this was a test run.`
  }
  return `All ${reached} claim${reached === 1 ? '' : 's'} reached HCPF Review successfully. Nothing was submitted — this was a test run.`
}

export type ClientFailureExplanation = {
  whatHappened: string
  whatSystemDid: string
  whatToDo: string | null
}

/** Maps a ledger failure/reason code to three plain-English fields for a
 * non-technical reader. Source of truth for what self-heals vs needs a
 * human: /root/projects/mohamed/docs/failure-modes-runbook.md. Falls back
 * to a generic-but-honest explanation for any code not in the table below
 * so a newly-introduced code never regresses to a raw string on screen. */
const FAILURE_EXPLANATIONS: Record<string, ClientFailureExplanation> = {
  hcpf_reauthentication_required: {
    whatHappened: 'The billing portal signed us out and stayed signed out for more than 35 minutes.',
    whatSystemDid: 'The system tried repeatedly to repair the session automatically and could not within that window.',
    whatToDo:
      'No action needed from you — this is being looked into. Your upload is safe and will retry once the session is repaired.',
  },
  stale_session: {
    whatHappened: 'The billing portal detected a second, overlapping login and locked the session.',
    whatSystemDid: 'The system is waiting out the portal’s lock (about 15–25 minutes) and will retry the login automatically.',
    whatToDo: null,
  },
  service_line_rejected: {
    whatHappened: 'HCPF rejected one or more service lines on this claim.',
    whatSystemDid: 'The system captured a screenshot of the portal’s exact rejection message for this claim.',
    whatToDo: 'Open the claim’s failure screenshot below to see the portal’s exact message.',
  },
  websockettimeoutexception: {
    whatHappened: 'The portal page stopped responding partway through this run.',
    whatSystemDid: 'The system recovered by opening a fresh browser tab and continued with the next claim.',
    whatToDo: null,
  },
  invalid_claim_draft: {
    whatHappened: 'A claim could not be assembled from the uploaded data.',
    whatSystemDid: 'The system stopped before submitting anything for this claim.',
    whatToDo: 'Check the source row in the billing report for missing or malformed fields.',
  },
  overlaps_present: {
    whatHappened: 'This billing period overlaps with a period that was already billed.',
    whatSystemDid: 'The system held these visits back rather than risk a duplicate claim.',
    whatToDo: 'Confirm the intended billing period and re-run if it was uploaded by mistake.',
  },
  eligibility_lookup_failed: {
    whatHappened: 'The portal did not answer one or more coverage checks (its page did not load in time).',
    whatSystemDid: 'The system retried each check automatically before giving up.',
    whatToDo: 'Usually resolves on its own — upload the same file again in a few minutes.',
  },
  eligibility_unavailable: {
    whatHappened: 'The portal\u2019s coverage-check page did not answer for any client in this run, so no coverage could be confirmed.',
    whatSystemDid: 'The system stopped the run rather than guess at coverage \u2014 nothing was checked against a billing rule and nothing was submitted.',
    whatToDo: 'Usually a temporary portal hiccup. Upload the same file again in a few minutes; if it keeps happening, flag it to Andy.',
  },
  hcpf_session_died: {
    whatHappened: 'The billing portal ended your session partway through this run.',
    whatSystemDid: 'The system stopped entering claims the moment it noticed, rather than continuing to try against a session that had already ended.',
    whatToDo: 'No action needed — the system repairs the session automatically. Upload the same file again in a few minutes.',
  },
  structural_data_missing: {
    whatHappened: 'One or more rows in the uploaded file are missing required billing information (like a service code or billing amount).',
    whatSystemDid: 'The system refused to run rather than bill the clean rows and silently skip the broken ones.',
    whatToDo: 'Check the flagged rows in AxisCare\u2019s Billing Report export, fix the missing fields, and upload again.',
  },
  cancelled_by_client: {
    whatHappened: 'This run was stopped from the hub before it finished.',
    whatSystemDid: 'The system finished the claim it was already working on, then stopped rather than start another.',
    whatToDo: 'Any claims already reached review before the stop are still shown below. Upload the file again to bill the rest.',
  },
}

const GENERIC_EXPLANATION: ClientFailureExplanation = {
  whatHappened: 'The run stopped on an error the automation has not seen described yet.',
  whatSystemDid: 'The system stopped before submitting anything and recorded exactly where.',
  whatToDo: 'See the technical detail below, or ask Andy to check the failure-modes runbook for this code.',
}

/** Three plain-English lines for a raw failure code, or null when there is
 * no code. Matched by substring since the raw code often carries a suffix
 * (e.g. "service_line_rejected:2"). */
export function explainFailureCode(code: string | null | undefined): ClientFailureExplanation | null {
  if (!code) return null
  const lower = code.toLowerCase()
  const matchedKey = Object.keys(FAILURE_EXPLANATIONS).find(key => lower.includes(key))
  return matchedKey ? FAILURE_EXPLANATIONS[matchedKey] : GENERIC_EXPLANATION
}

/** Three plain-English lines (what happened / what the system already did /
 * what you should do) for a run's failure code, replacing raw ledger codes
 * on the status strip. */
export function describeFailureForClient(ledger: RunLedgerSnapshot): ClientFailureExplanation | null {
  return explainFailureCode(ledger.first_failure?.code)
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
