import assert from 'node:assert/strict'
import { test } from 'node:test'
import demo from '../lib/mohamedDemoLedger.json' with { type: 'json' }
import {
  describeFailure,
  ledgerLooksPhiFree,
  summariseClaims,
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
