import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RunHistory } from '../components/mohamed/RunHistory'
import { computeRunOutcome } from '../lib/mohamedRunSummary'
import type { RunHistoryItem } from '../lib/mohamedQueries'

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
  return renderToStaticMarkup(
    createElement(RunHistory, { history: [run()], selectedRunId: '', nowIso: NOW, ...props }),
  )
}

test('history renders one collapsible card per run', () => {
  const html = render({ history: [run({ runId: 'a'.repeat(32) }), run({ runId: 'b'.repeat(32) })] })
  assert.equal((html.match(/<details/g) ?? []).length, 2)
})

test('the newest run (first in the list) is open by default; the rest are closed', () => {
  const html = render({ history: [run({ runId: 'a'.repeat(32) }), run({ runId: 'b'.repeat(32) })] })
  const [first, second] = html.split('<details').slice(1)
  // React's renderToStaticMarkup serialises the boolean `open` attribute as
  // `open=""`, not the bare `open` a hand-authored SSR string might use.
  assert.match(first, /^[^>]*\sopen(=""|\s|>)/) // first <details ...> carries the open attribute
  assert.doesNotMatch(second, /^[^>]*\sopen(=""|\s|>)/)
})

test('an empty history shows the empty state, not zero collapsible rows', () => {
  const html = render({ history: [] })
  assert.match(html, /No runs yet/)
  assert.doesNotMatch(html, /<details/)
})

test('a degraded history shows the reconnecting message instead of any rows', () => {
  const html = render({ degraded: true })
  assert.match(html, /Reconnecting/)
  assert.doesNotMatch(html, /<details/)
})

test('runs are segmented under day headings', () => {
  const html = render({
    history: [
      run({ runId: 'a'.repeat(32), startedAt: '2026-08-24T10:00:00.000Z' }),
      run({ runId: 'b'.repeat(32), startedAt: '2026-08-23T10:00:00.000Z' }),
      run({ runId: 'c'.repeat(32), startedAt: '2026-08-21T10:00:00.000Z' }),
    ],
  })
  assert.match(html, /Today/)
  assert.match(html, /Yesterday/)
  assert.match(html, /Aug 21/)
})

test('the billing period, not the run id, titles each card', () => {
  const html = render()
  assert.match(html, /Aug 14 – Aug 20, 2026/)
})

test('the outcome headline leads the card in plain English', () => {
  const outcome = computeRunOutcome('review_ready', [
    { step: 'rows_received', status: 'ok', claim_ref: null, code: null, detail: { rows: 26 } },
    { step: 'rows_evaluated', status: 'blocked', claim_ref: null, code: null, detail: { ready: 12, blocked: 14, qualifying_coverage_missing: 14 } },
    ...Array.from({ length: 12 }, (_, i) => ({
      step: 'reached_review',
      status: 'ok',
      claim_ref: `claim${i}`,
      code: null,
      detail: {},
    })),
  ])
  const html = render({ history: [run({ outcome })] })
  assert.match(html, /12 claims ready for your review/)
  assert.match(html, /missing one of the two required coverages/)
})

test('the primary view hides run ids, event counts and raw mode/source jargon', () => {
  const html = render()
  assert.doesNotMatch(html, /42 ev/)
  assert.doesNotMatch(html, /synthetic_fixture/)
  assert.doesNotMatch(html, /dry_run/)
  assert.match(html, /Review run/)
  // The hex ref survives only as a tiny secondary label inside the expanded body.
  assert.equal((html.match(/aaaaaaaa/g) ?? []).length, 1)
})

test('an in-flight run is announced at the head of the timeline', () => {
  const html = render({
    inFlight: {
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
    },
  })
  assert.match(html, /A run is happening right now/)
  assert.match(html, /Checking member eligibility/)
})

test('a run that just completed is flagged so the client can find theirs', () => {
  const html = render({ history: [run({ finishedAt: '2026-08-24T10:25:00.000Z' })] })
  assert.match(html, /Just finished/)
})
