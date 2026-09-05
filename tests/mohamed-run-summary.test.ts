import assert from 'node:assert/strict'
import { test } from 'node:test'
import demo from '../lib/mohamedDemoLedger.json' with { type: 'json' }
import type { RunLedgerSnapshot } from '../lib/mohamedLedger'
import {
  computeRunOutcome,
  describeBlockReason,
  describeDay,
  describeRunMode,
  formatPeriod,
  groupRunsByDay,
  runOutcomeFromLedger,
  type OutcomeSignal,
} from '../lib/mohamedRunSummary'

const ledger = demo as RunLedgerSnapshot

function signal(overrides: Partial<OutcomeSignal>): OutcomeSignal {
  return { step: 'rows_received', status: 'ok', claim_ref: null, code: null, detail: {}, ...overrides }
}

test('machine reason codes are translated to client language', () => {
  assert.equal(describeBlockReason('qualifying_coverage_missing'), 'missing one of the two required coverages')
  assert.equal(describeBlockReason('service_not_billable'), 'service type is not billable')
  assert.equal(describeBlockReason('units_invalid'), 'visit has no billable hours')
})

test('an unknown reason code degrades to a readable phrase, never a raw underscore code', () => {
  assert.equal(describeBlockReason('brand_new_rule_2027'), 'brand new rule 2027')
})

test('"dry run" reads as a review run that submitted nothing', () => {
  assert.match(describeRunMode('dry_run'), /Test run/)
  assert.match(describeRunMode('dry_run'), /nothing submitted/)
})

test('the demo run headlines the number of claims ready for review', () => {
  const outcome = runOutcomeFromLedger(ledger)
  assert.equal(outcome.tone, 'ready')
  assert.equal(outcome.claimsReady, 2)
  assert.equal(outcome.visitsIn, 4)
  assert.equal(outcome.visitsBlocked, 1)
  assert.equal(outcome.headline, '2 claims passed the test run')
  assert.match(outcome.subline ?? '', /1 visit held back: missing one of the two required coverages/)
  assert.deepEqual(outcome.reasons, [
    { code: 'qualifying_coverage_missing', label: 'missing one of the two required coverages', count: 1 },
  ])
})

test('a run that built nothing headlines the block count and the reason in plain English', () => {
  const outcome = computeRunOutcome('blocked', [
    signal({ step: 'rows_received', detail: { rows: 14 } }),
    signal({ step: 'rows_evaluated', status: 'blocked', detail: { ready: 0, blocked: 14, qualifying_coverage_missing: 14 } }),
  ])
  assert.equal(outcome.tone, 'attention')
  assert.equal(outcome.headline, 'No claims built — 14 visits blocked: missing one of the two required coverages')
  assert.equal(outcome.claimsReady, 0)
})

test('multiple block reasons are ranked by count, with the rest named in the subline', () => {
  const outcome = computeRunOutcome('blocked', [
    signal({ step: 'rows_evaluated', status: 'blocked', detail: { ready: 0, blocked: 9, units_invalid: 3, qualifying_coverage_missing: 6 } }),
  ])
  assert.deepEqual(outcome.reasons.map(r => r.code), ['qualifying_coverage_missing', 'units_invalid'])
  assert.match(outcome.headline, /missing one of the two required coverages/)
  assert.match(outcome.subline ?? '', /visit has no billable hours/)
})

test('a failed run explains itself in plain English rather than showing the code', () => {
  const outcome = computeRunOutcome('failed', [
    signal({ step: 'portal_action', status: 'failed', code: 'hcpf_reauthentication_required' }),
  ])
  assert.equal(outcome.tone, 'failed')
  assert.equal(outcome.headline, 'Run stopped before it finished')
  assert.match(outcome.subline ?? '', /signed us out/)
  assert.doesNotMatch(outcome.subline ?? '', /hcpf_reauthentication_required/)
})

test('a failure on a claim that later reached review is not the run failure', () => {
  // Live 2026-09-03 (run 90a10026): transient hcpfnavigationerror on one
  // claim, continuation retry succeeded, 57/57 reached review. The VPS
  // ledger now reports review_ready; the hub must not resurrect the
  // recovered blip as the explanation of anything.
  const outcome = computeRunOutcome('review_ready', [
    signal({ step: 'portal_action', status: 'failed', code: 'hcpfnavigationerror', claim_ref: 'aaaa' }),
    signal({ step: 'claim_drafted', claim_ref: 'aaaa' }),
    signal({ step: 'reached_review', claim_ref: 'aaaa' }),
  ])
  assert.equal(outcome.tone, 'ready')
  assert.equal(outcome.claimsReady, 1)
  assert.equal(outcome.claimsFailed, 0)
})

test('drafted claims that never reached review are counted as unfinished', () => {
  const outcome = computeRunOutcome('review_ready', [
    signal({ step: 'claim_drafted', claim_ref: 'aaaa' }),
    signal({ step: 'claim_drafted', claim_ref: 'bbbb' }),
    signal({ step: 'reached_review', claim_ref: 'aaaa' }),
  ])
  assert.equal(outcome.claimsReady, 1)
  assert.equal(outcome.claimsFailed, 1)
  assert.match(outcome.subline ?? '', /did not reach the review screen/)
})

test('a run with nothing to bill is neither green nor alarming', () => {
  const outcome = computeRunOutcome('review_ready', [signal({ step: 'rows_received', detail: { rows: 0 } })])
  assert.equal(outcome.tone, 'idle')
  assert.equal(outcome.headline, 'Nothing to bill in this period')
})

test('the billing period is formatted the way a person says it', () => {
  assert.equal(formatPeriod('2026-08-14', '2026-08-20'), 'Aug 14 – Aug 20, 2026')
  assert.equal(formatPeriod('2025-12-29', '2026-01-04'), 'Dec 29, 2025 – Jan 4, 2026')
})

test('days are labelled Today / Yesterday / a date, against an explicit now', () => {
  const now = '2026-08-25T09:00:00.000Z'
  assert.equal(describeDay('2026-08-25', now), 'Today')
  assert.equal(describeDay('2026-08-24', now), 'Yesterday')
  assert.equal(describeDay('2026-08-22', now), 'Aug 22')
  assert.equal(describeDay('2025-08-22', now), 'Aug 22, 2025')
})

test('runs are bucketed by day, newest-first order preserved', () => {
  const groups = groupRunsByDay(
    [
      { startedAt: '2026-08-25T11:00:00.000Z' },
      { startedAt: '2026-08-25T09:00:00.000Z' },
      { startedAt: '2026-08-24T09:00:00.000Z' },
    ],
    '2026-08-25T12:00:00.000Z',
  )
  assert.deepEqual(groups.map(g => g.label), ['Today', 'Yesterday'])
  assert.deepEqual(groups.map(g => g.runs.length), [2, 1])
})

test('a claim skipped by dedup (already submitted by an earlier run) is not "unfinished"', () => {
  // Live 2026-09-05: the Aug 28 batch showed "1 claim did not reach HCPF" --
  // it was F736896's week, submitted 6 minutes earlier in a test run, and
  // correctly skipped. Andy: "can we look into the 1 unfinished bill?"
  const outcome = computeRunOutcome(
    'review_ready',
    [
      { step: 'claim_drafted', status: 'ok', claim_ref: 'dup', code: null, detail: { charge_cents: 35_048 } },
      { step: 'claim_already_submitted', status: 'skipped', claim_ref: 'dup', code: 'already_submitted', detail: {} },
      { step: 'claim_drafted', status: 'ok', claim_ref: 'ok', code: null, detail: { charge_cents: 100 } },
      { step: 'reached_review', status: 'ok', claim_ref: 'ok', code: null, detail: {} },
      { step: 'submit', status: 'ok', claim_ref: 'ok', code: null, detail: {} },
    ],
    'submit',
  )
  assert.equal(outcome.claimsFailed, 0)
  assert.equal(outcome.alreadySubmitted, 1)
  assert.equal(outcome.submitted, 1)
  assert.match(outcome.subline ?? '', /1 already billed by an earlier run/)
})
