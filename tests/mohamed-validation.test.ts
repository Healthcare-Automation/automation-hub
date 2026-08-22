import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  evaluateBillingRows,
  splitBillingPeriod,
  type BillingSourceRow,
} from '../lib/mohamedValidation'

function row(overrides: Partial<BillingSourceRow> = {}): BillingSourceRow {
  return {
    sourceRowId: 'demo-row-1',
    memberRef: 'A1234567',
    serviceDate: '2026-08-28',
    serviceCode: 'HOMEMAKING',
    procedureCode: 'S5130',
    modifiers: [],
    units: 4,
    chargeAmountCents: 10000,
    sandataStatus: 'verified',
    eligibilityCoverages: ['HCBS Elderly, Blind, & Disabled Waiver', 'Community First Choice Services'],
    ...overrides,
  }
}

test('billing periods split at a calendar-month boundary', () => {
  assert.deepEqual(splitBillingPeriod('2026-08-28', '2026-09-03'), [
    { startDate: '2026-08-28', endDate: '2026-08-31' },
    { startDate: '2026-09-01', endDate: '2026-09-03' },
  ])
})

test('billing periods never exceed seven days', () => {
  assert.deepEqual(splitBillingPeriod('2026-08-01', '2026-08-17'), [
    { startDate: '2026-08-01', endDate: '2026-08-07' },
    { startDate: '2026-08-08', endDate: '2026-08-14' },
    { startDate: '2026-08-15', endDate: '2026-08-17' },
  ])
})

test('Sandata status is informational, never a gate (client decision 2026-08-21)', () => {
  for (const sandataStatus of ['pending', 'rejected', 'unknown', 'verified'] as const) {
    const [result] = evaluateBillingRows([row({ sandataStatus })])
    assert.equal(result.disposition, 'ready_for_review', sandataStatus)
  }
})

test('member must carry BOTH qualifying coverages', () => {
  for (const eligibilityCoverages of [
    [],
    ['Unrelated Coverage'],
    ['HCBS Elderly, Blind, & Disabled Waiver'],
    ['Community First Choice Services'],
  ]) {
    const [result] = evaluateBillingRows([row({ eligibilityCoverages })])
    assert.equal(result.disposition, 'blocked', eligibilityCoverages.join('+'))
    assert.ok(result.reasons.includes('qualifying_coverage_missing'))
  }
})

test('invalid member IDs and non-positive billing values are blocked', () => {
  const [result] = evaluateBillingRows([
    row({ memberRef: '1234567', units: 0, chargeAmountCents: -1 }),
  ])
  assert.equal(result.disposition, 'blocked')
  assert.deepEqual(result.reasons.sort(), [
    'charge_amount_invalid',
    'member_id_invalid',
    'units_invalid',
  ])
})

test('invalid dates and missing service fields are blocked (parity with the Python rules)', () => {
  const [result] = evaluateBillingRows([
    row({ serviceDate: 'not-a-date', serviceCode: ' ', procedureCode: '' }),
  ])
  assert.equal(result.disposition, 'blocked')
  for (const reason of ['service_date_invalid', 'service_code_missing', 'procedure_code_missing']) {
    assert.ok(result.reasons.includes(reason), reason)
  }
  for (const bad of ['2026-02-30', '20260814', '08/14/2026']) {
    const [r] = evaluateBillingRows([row({ serviceDate: bad })])
    assert.ok(r.reasons.includes('service_date_invalid'), bad)
  }
})

test('distinct services remain distinct review items', () => {
  const results = evaluateBillingRows([
    row(),
    row({ sourceRowId: 'demo-row-2', serviceCode: 'PERSONAL_CARE', procedureCode: 'T1019' }),
  ])
  assert.equal(results.length, 2)
  assert.notEqual(results[0].reviewKey, results[1].reviewKey)
  assert.ok(results.every(result => result.disposition === 'ready_for_review'))
})

test('dry-run evaluation never marks a row as submitted', () => {
  const [result] = evaluateBillingRows([row()])
  assert.equal(result.disposition, 'ready_for_review')
  assert.equal(result.submissionAllowed, false)
})
