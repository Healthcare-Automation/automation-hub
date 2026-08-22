import assert from 'node:assert/strict'
import { test } from 'node:test'
import demo from '../lib/mohamedDemoLedger.json' with { type: 'json' }
import { describeFailure, type RunLedgerSnapshot } from '../lib/mohamedLedger'
import { buildSnapshot, toHistoryItem, type EventRow, type RunRow } from '../lib/mohamedQueries'

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
  const rows: EventRow[] = ledger.events.map((event, index) =>
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
