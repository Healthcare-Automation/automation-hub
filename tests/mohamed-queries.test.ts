import assert from 'node:assert/strict'
import { test } from 'node:test'
import demo from '../lib/mohamedDemoLedger.json' with { type: 'json' }
import { describeFailure, type RunLedgerSnapshot } from '../lib/mohamedLedger'
import {
  attachRunOutcomes,
  buildSnapshot,
  toHistoryItem,
  type EventRow,
  type OutcomeSignalRow,
  type RunRow,
} from '../lib/mohamedQueries'

const ledger = demo as RunLedgerSnapshot

function runRow(): RunRow {
  return {
    run_id: ledger.run_id,
    mode: ledger.mode,
    source: ledger.source,
    period_start: new Date(`${ledger.period_start}T00:00:00Z`) as unknown as string,
    period_end: ledger.period_end,
    started_at: new Date(ledger.started_at) as unknown as string,
    finished_at: ledger.finished_at,
    status: ledger.status,
    event_count: ledger.events.length,
  }
}

test('buildSnapshot reproduces the Python ledger shape from DB rows (any order)', () => {
  const rows: EventRow[] = [...ledger.events].reverse().map(event => ({ ...event, detail: event.detail }))
  const snapshot = buildSnapshot(runRow(), rows)

  assert.equal(snapshot.period_start, ledger.period_start)
  assert.equal(snapshot.events.length, ledger.events.length)
  assert.deepEqual(snapshot.events.map(e => e.seq), ledger.events.map(e => e.seq))
  assert.deepEqual(snapshot.stages, ledger.stages)
  assert.equal(snapshot.first_failure, null)
  assert.equal(describeFailure(snapshot), null)
})

test('buildSnapshot derives first_failure and tolerates null detail', () => {
  // The demo claim at event 10 later reaches review, so a failure there is
  // "recovered" and must NOT be the first_failure (see the recovered-claim
  // tests below). Make it a real, unrecovered failure by also dropping that
  // claim's later reached_review row.
  const target = ledger.events[10]
  const rows: EventRow[] = ledger.events
    .filter(event => !(event.step === 'reached_review' && event.claim_ref === target.claim_ref))
    .map((event, index) =>
      index === 10
        ? { ...event, status: 'failed', code: 'runtimeerror', action: 'fill', field: 'units', detail: null }
        : { ...event, detail: event.detail },
    )
  const snapshot = buildSnapshot(runRow(), rows)
  assert.equal(snapshot.first_failure?.seq, 11)
  assert.deepEqual(snapshot.first_failure?.detail, {})
  assert.equal(snapshot.stages.find(s => s.stage === snapshot.first_failure?.stage)?.status, 'failed')
})

test('history items normalise dates and counts', () => {
  const item = toHistoryItem(runRow())
  assert.equal(item.periodStart, ledger.period_start)
  assert.equal(item.startedAt, new Date(ledger.started_at).toISOString())
  assert.equal(item.eventCount, ledger.events.length)
})

test('a flat multi-run signal projection folds into one outcome per run', () => {
  const items = [
    toHistoryItem({ ...runRow(), run_id: 'run-a' }),
    toHistoryItem({ ...runRow(), run_id: 'run-b', status: 'blocked' }),
    toHistoryItem({ ...runRow(), run_id: 'run-c' }),
  ]
  const signals: OutcomeSignalRow[] = [
    { run_id: 'run-a', step: 'rows_received', status: 'ok', claim_ref: null, code: null, detail: { rows: 5 } },
    { run_id: 'run-a', step: 'reached_review', status: 'ok', claim_ref: 'c1', code: null, detail: {} },
    { run_id: 'run-b', step: 'rows_evaluated', status: 'blocked', claim_ref: null, code: null, detail: { ready: 0, blocked: 3, units_invalid: 3 } },
  ]

  const [a, b, c] = attachRunOutcomes(items, signals)
  assert.equal(a.outcome?.headline, '1 claim ready for your review')
  assert.equal(a.outcome?.visitsIn, 5)
  assert.match(b.outcome?.headline ?? '', /No claims built — 3 visits blocked: visit has no billable hours/)
  // A run with no signal rows still gets an honest outcome, not a crash.
  assert.equal(c.outcome?.tone, 'idle')
})

test('a stored "failed" run whose only failures were later recovered reads as review_ready', () => {
  // Live 2026-09-03, run 90a10026: 57/57 reached review; the ledger was
  // written 'failed' by the pre-fix VPS code because of one transient,
  // retried navigation error. The hub must derive the honest status from
  // the events rather than trusting that snapshot.
  const item = { ...toHistoryItem(runRow()), runId: 'r1', status: 'failed' as const }
  const signals: OutcomeSignalRow[] = [
    { run_id: 'r1', step: 'portal_action', status: 'failed', claim_ref: 'aaaa', code: 'hcpfnavigationerror', detail: {} },
    { run_id: 'r1', step: 'reached_review', status: 'ok', claim_ref: 'aaaa', code: 'continuation_retry', detail: {} },
    { run_id: 'r1', step: 'reached_review', status: 'ok', claim_ref: 'bbbb', code: null, detail: {} },
  ]
  const [out] = attachRunOutcomes([item], signals)
  assert.equal(out.status, 'review_ready')
  assert.equal(out.outcome?.tone, 'ready')
  assert.doesNotMatch(out.outcome?.headline ?? '', /stopped before it finished/)
})

test('a stored "failed" run with a run-level failure stays failed', () => {
  const item = { ...toHistoryItem(runRow()), runId: 'r2', status: 'failed' as const }
  const signals: OutcomeSignalRow[] = [
    { run_id: 'r2', step: 'reached_review', status: 'ok', claim_ref: 'aaaa', code: null, detail: {} },
    { run_id: 'r2', step: 'run_stopped', status: 'failed', claim_ref: null, code: 'hcpf_session_died', detail: {} },
  ]
  const [out] = attachRunOutcomes([item], signals)
  assert.equal(out.status, 'failed')
  assert.equal(out.outcome?.headline, 'Run stopped before it finished')
})
