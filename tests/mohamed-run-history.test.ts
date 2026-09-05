import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RunHistory } from '../components/mohamed/RunHistory'
import { computeRunOutcome } from '../lib/mohamedRunSummary'
import type { RunHistoryItem } from '../lib/mohamedQueries'
import type { RunRequestRow } from '../lib/mohamedRunRequests'

const NOW = '2026-08-24T10:30:00.000Z'

function run(overrides: Partial<RunHistoryItem> = {}): RunHistoryItem {
  return {
    runId: 'a'.repeat(32),
    mode: 'dry_run',
    source: 'synthetic_fixture',
    periodStart: '2026-08-14',
    periodEnd: '2026-08-20',
    startedAt: '2026-08-24T10:00:00.000Z',
    finishedAt: '2026-08-24T10:05:00.000Z',
    status: 'review_ready',
    eventCount: 42,
    ...overrides,
  }
}

function render(props: Partial<Parameters<typeof RunHistory>[0]> = {}) {
  return renderToStaticMarkup(createElement(RunHistory, { history: [run()], latestLedger: null, nowIso: NOW, ...props }))
}

const submitted = (n = 3) =>
  computeRunOutcome(
    'review_ready',
    [
      { step: 'rows_received', status: 'ok', claim_ref: null, code: null, detail: { rows: 10 } },
      ...Array.from({ length: n }, (_, i) => [
        { step: 'claim_drafted', status: 'ok', claim_ref: `c${i}`, code: null, detail: { charge_cents: 10_000 } },
        { step: 'reached_review', status: 'ok', claim_ref: `c${i}`, code: null, detail: {} },
        { step: 'submit', status: 'ok', claim_ref: `c${i}`, code: null, detail: {} },
        { step: 'hcpf_receipt', status: 'ok', claim_ref: `c${i}`, code: null, detail: { claim_id: `100${i}`, hcpf_status: i === 0 ? 'denied' : 'paid' } },
        { step: 'submission_validated', status: 'ok', claim_ref: `c${i}`, code: 'match', detail: { hcpf_claim_id: `100${i}`, hcpf_status: i === 0 ? 'denied' : 'paid', paid_cents: i === 0 ? 0 : 9_000, charged_cents: 10_000 } },
      ]).flat(),
    ],
    'submit',
  )

test('the filter defaults to Submissions and hides test runs', () => {
  const html = render({ history: [run({ runId: 'a'.repeat(32), mode: 'dry_run' }), run({ runId: 'b'.repeat(32), mode: 'submit' })] })
  assert.match(html, /aria-selected="true"[^>]*>Submissions/)
  assert.equal((html.match(/bbbbbbbb/g) ?? []).length, 0) // refs only render inside an opened row
  assert.match(html, /Submissions <span[^>]*>1</)
  assert.match(html, /Tests <span[^>]*>1</)
  assert.match(html, /All <span[^>]*>2</)
})

test('with only test runs the Submissions filter shows an honest empty state', () => {
  const html = render({ history: [run({ mode: 'dry_run' })] })
  assert.match(html, /No submissions yet/)
})

test('every run renders collapsed as one line; nothing is open by default', () => {
  const html = render({ history: [run({ runId: 'a'.repeat(32), mode: 'submit' }), run({ runId: 'b'.repeat(32), mode: 'submit' })] })
  assert.equal((html.match(/<li class="relative"/g) ?? []).length, 2)
  assert.doesNotMatch(html, /Loading claims/)
  assert.doesNotMatch(html, /ref aaaaaaaa/)
})

test('a submission run headlines what was sent and what HCPF paid', () => {
  const html = render({ history: [run({ mode: 'submit', outcome: submitted() })] })
  assert.match(html, /3 claims submitted — \$180\.00 paid of \$300\.00 claimed/)
  assert.match(html, />Submission</)
})

test('a test run says so and never claims anything was submitted', () => {
  const outcome = computeRunOutcome('review_ready', [
    { step: 'rows_received', status: 'ok', claim_ref: null, code: null, detail: { rows: 26 } },
    { step: 'rows_evaluated', status: 'blocked', claim_ref: null, code: null, detail: { ready: 12, blocked: 14, qualifying_coverage_missing: 14 } },
    ...Array.from({ length: 12 }, (_, i) => ({ step: 'reached_review', status: 'ok', claim_ref: `claim${i}`, code: null, detail: {} })),
  ])
  const html = render({ history: [run({ outcome })] })
  assert.match(html, /No submissions yet/) // default filter
  const all = renderToStaticMarkup(createElement(RunHistory, { history: [run({ outcome })], latestLedger: null, nowIso: NOW }))
  assert.match(all, /No submissions yet/)
})

test('an empty history shows the empty state', () => {
  assert.match(render({ history: [] }), /No runs yet/)
})

test('a degraded history shows the reconnecting message instead of any rows', () => {
  const html = render({ degraded: true })
  assert.match(html, /Reconnecting/)
  assert.doesNotMatch(html, /<li class="relative"/)
})

test('runs are segmented under day headings', () => {
  const html = render({
    history: [
      run({ runId: 'a'.repeat(32), mode: 'submit', startedAt: '2026-08-24T10:00:00.000Z' }),
      run({ runId: 'b'.repeat(32), mode: 'submit', startedAt: '2026-08-23T10:00:00.000Z' }),
      run({ runId: 'c'.repeat(32), mode: 'submit', startedAt: '2026-08-21T10:00:00.000Z' }),
    ],
  })
  assert.match(html, /Today/)
  assert.match(html, /Yesterday/)
  assert.match(html, /Aug 21/)
})

test('the billing period, not the run id, titles each row; no raw mode/source jargon', () => {
  const html = render({ history: [run({ mode: 'submit' })] })
  assert.match(html, /Aug 14 – Aug 20, 2026/)
  assert.doesNotMatch(html, /42 ev/)
  assert.doesNotMatch(html, /synthetic_fixture/)
  assert.doesNotMatch(html, /dry_run/)
})

test('an in-flight run IS the top panel, with its progress, and there is no second live card', () => {
  const inFlight: RunRequestRow = {
    id: 1,
    requestedAt: NOW,
    requestedBy: 'mohamed',
    kind: 'live',
    status: 'running',
    claimedAt: null,
    finishedAt: null,
    runId: null,
    errorCode: null,
    progress: 'checking_eligibility:3_of_9',
    progressAt: null,
    cancelRequestedAt: null,
    submitMode: true,
  }
  const html = render({ inFlight })
  assert.match(html, /Running now/)
  assert.match(html, /Checking member eligibility/)
  assert.equal((html.match(/data-section="status"/g) ?? []).length, 1)
  assert.doesNotMatch(html, /A run is happening right now/)
  assert.doesNotMatch(html, /Latest run/)
})

test('a run that just completed is flagged so the client can find theirs', () => {
  const html = render({ history: [run({ mode: 'submit', finishedAt: '2026-08-24T10:25:00.000Z' })] })
  assert.match(html, /Just finished/)
})
