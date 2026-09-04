import assert from 'node:assert/strict'
import { test } from 'node:test'
import demo from '../lib/mohamedDemoLedger.json' with { type: 'json' }
import {
  describeFailure,
  describeFailureForClient,
  ledgerLooksPhiFree,
  summariseClaims,
  summariseInPlainLanguage,
  type RunLedgerSnapshot,
} from '../lib/mohamedLedger'

const ledger = demo as RunLedgerSnapshot

test('demo ledger is PHI-free and reached the end state for the ready claims', () => {
  assert.equal(ledgerLooksPhiFree(ledger), true)
  assert.equal(describeFailure(ledger), null)
  const text = JSON.stringify(ledger)
  for (const secret of ['DEMO-A1', 'DEMO-C3']) {
    assert.ok(!text.includes(secret), secret)
  }
})

test('claims are summarised from the event stream alone, including non-identifying billing specifics', () => {
  const claims = summariseClaims(ledger)
  assert.equal(claims.length, 2)
  assert.ok(claims.every(claim => claim.reachedReview && claim.failedActions === 0 && claim.portalActions > 10))
  assert.ok(claims.every(claim => /^[0-9a-f]{16}$/.test(claim.claimRef)))
  const byProcedure = new Map(claims.map(claim => [claim.procedureCode, claim]))
  assert.deepEqual(byProcedure.get('s5130'), {
    ...byProcedure.get('s5130'),
    modifiers: 'none',
    unitsX100: 700,
    chargeCents: 17_500,
  })
  assert.deepEqual(byProcedure.get('t1019'), {
    ...byProcedure.get('t1019'),
    modifiers: 'u1',
    unitsX100: 200,
    chargeCents: 5_000,
  })
  // Demo ledger never submitted anything -- new fields must default cleanly.
  assert.ok(claims.every(claim => claim.hcpfClaimId === null && claim.hcpfStatus === null && claim.validation === null))
})

test('a submitted claim surfaces HCPF\'s own receipt claim ID and status', () => {
  const submitted: RunLedgerSnapshot = {
    ...ledger,
    events: [
      ...ledger.events,
      {
        run_id: ledger.run_id,
        seq: 9001,
        at: '2026-09-05T00:00:00Z',
        stage: 'submission',
        step: 'hcpf_receipt',
        status: 'ok',
        claim_ref: '0123456789abcdef',
        action: null,
        field: null,
        code: null,
        detail: { claim_id: '2226247007206', hcpf_status: 'paid' },
        duration_ms: null,
      },
    ],
  }
  const claims = summariseClaims(submitted)
  const claim = claims.find(c => c.claimRef === '0123456789abcdef')
  assert.ok(claim)
  assert.equal(claim!.hcpfClaimId, '2226247007206')
  assert.equal(claim!.hcpfStatus, 'paid')
})

test('a validated claim surfaces match/mismatch/not_found from submission_validated', () => {
  const baseEvent = {
    run_id: ledger.run_id,
    at: '2026-09-05T00:00:00Z',
    stage: 'submission' as const,
    claim_ref: '0123456789abcdef',
    action: null,
    field: null,
    duration_ms: null,
  }
  const cases: Array<[string, 'ok' | 'failed' | 'skipped', string | null, 'match' | 'mismatch' | 'not_found' | 'error' | 'skipped']> = [
    ['match', 'ok', 'match', 'match'],
    ['status_mismatch', 'failed', 'status_mismatch', 'mismatch'],
    ['not_found_in_hcpf_search', 'failed', 'not_found_in_hcpf_search', 'not_found'],
    ['runtimeerror', 'failed', 'runtimeerror', 'error'],
    ['no_claim_id_to_validate', 'skipped', 'no_claim_id_to_validate', 'skipped'],
  ]
  for (const [code, status, _rawCode, expected] of cases) {
    const withValidation: RunLedgerSnapshot = {
      ...ledger,
      events: [
        ...ledger.events,
        {
          ...baseEvent,
          seq: 9002,
          step: 'submission_validated',
          status,
          code,
          detail: { hcpf_status: 'paid' },
        },
      ],
    }
    const claims = summariseClaims(withValidation)
    const claim = claims.find(c => c.claimRef === '0123456789abcdef')
    assert.ok(claim, `case ${code}`)
    assert.equal(claim!.validation?.status, expected, `case ${code}`)
  }
})

test('a failure is described down to stage, step, action, field and claim', () => {
  const failed: RunLedgerSnapshot = {
    ...ledger,
    status: 'failed',
    first_failure: {
      run_id: ledger.run_id,
      seq: 17,
      at: ledger.started_at,
      stage: 'hcpf_navigation',
      step: 'portal_action',
      status: 'failed',
      claim_ref: 'abcdef0123456789',
      action: 'fill',
      field: 'charge_amount',
      code: 'runtimeerror',
      detail: {},
      duration_ms: 3,
    },
  }
  assert.equal(
    describeFailure(failed),
    'HCPF review navigation › portal_action › fill:charge_amount (claim abcdef0123456789): runtimeerror at event #17',
  )
})

test('identifier-like strings are flagged as not PHI-free', () => {
  const tainted: RunLedgerSnapshot = {
    ...ledger,
    events: [{ ...ledger.events[0], detail: { member: 'DEMO-A1' } }],
  }
  assert.equal(ledgerLooksPhiFree(tainted), false)
})

test('plain-language summary describes a clean run', () => {
  const summary = summariseInPlainLanguage(ledger)
  assert.match(summary, /reached HCPF Review/)
  assert.match(summary, /Nothing was submitted/)
})

test('plain-language summary describes a failed run', () => {
  const failed: RunLedgerSnapshot = {
    ...ledger,
    status: 'failed',
    first_failure: {
      run_id: ledger.run_id,
      seq: 17,
      at: ledger.started_at,
      stage: 'hcpf_navigation',
      step: 'portal_action',
      status: 'failed',
      claim_ref: 'abcdef0123456789',
      action: 'fill',
      field: 'charge_amount',
      code: 'runtimeerror',
      detail: {},
      duration_ms: 3,
    },
  }
  assert.match(summariseInPlainLanguage(failed), /Stopped during/)
})

test('plain-language summary describes an all-blocked run', () => {
  const blocked: RunLedgerSnapshot = {
    ...ledger,
    status: 'blocked',
    stages: ledger.stages.map(s => (s.stage === 'billing_rules' ? { ...s, status: 'blocked' as const } : { ...s, status: 'not_run' as const })),
    events: ledger.events.filter(e => e.stage === 'extraction' || e.stage === 'billing_rules'),
  }
  assert.match(summariseInPlainLanguage(blocked), /blocked by a billing rule/)
})

test('describeFailureForClient maps known codes to plain-English three-liners', () => {
  const base: RunLedgerSnapshot = { ...ledger, status: 'failed' }
  const withCode = (code: string): RunLedgerSnapshot => ({
    ...base,
    first_failure: { ...ledger.events[0], code, seq: 1, status: 'failed' },
  })

  const reauth = describeFailureForClient(withCode('hcpf_reauthentication_required'))
  assert.ok(reauth)
  assert.match(reauth.whatHappened, /signed us out/)
  assert.match(reauth.whatSystemDid, /automatically/)

  const rejected = describeFailureForClient(withCode('service_line_rejected:2'))
  assert.ok(rejected)
  assert.match(rejected.whatToDo ?? '', /failure screenshot/)

  const timeout = describeFailureForClient(withCode('WebSocketTimeoutException'))
  assert.ok(timeout)
  assert.match(timeout.whatSystemDid, /fresh browser tab/)
})

test('describeFailureForClient falls back to a generic-but-honest explanation for unknown codes', () => {
  const unknown = describeFailureForClient({
    ...ledger,
    status: 'failed',
    first_failure: { ...ledger.events[0], code: 'brand_new_code_2027', seq: 1, status: 'failed' },
  })
  assert.ok(unknown)
  assert.match(unknown.whatToDo ?? '', /runbook/)
})

test('describeFailureForClient returns null when there is no failure', () => {
  assert.equal(describeFailureForClient(ledger), null)
})
