import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RunHistory } from '../components/mohamed/RunHistory'
import type { RunHistoryItem } from '../lib/mohamedQueries'

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

test('history renders one collapsible row per run', () => {
  const history = [run({ runId: 'a'.repeat(32) }), run({ runId: 'b'.repeat(32) })]
  const html = renderToStaticMarkup(
    createElement(RunHistory, { history, selectedRunId: '' }),
  )
  assert.equal((html.match(/<details/g) ?? []).length, 2)
})

test('the newest run (first in the list) is open by default; the rest are closed', () => {
  const history = [run({ runId: 'a'.repeat(32) }), run({ runId: 'b'.repeat(32) })]
  const html = renderToStaticMarkup(
    createElement(RunHistory, { history, selectedRunId: '' }),
  )
  const [first, second] = html.split('<details').slice(1)
  // React's renderToStaticMarkup serialises the boolean `open` attribute as
  // `open=""`, not the bare `open` a hand-authored SSR string might use.
  assert.match(first, /^[^>]*\sopen(=""|\s|>)/) // first <details ...> carries the open attribute
  assert.doesNotMatch(second, /^[^>]*\sopen(=""|\s|>)/)
})

test('an empty history shows the empty state, not zero collapsible rows', () => {
  const html = renderToStaticMarkup(createElement(RunHistory, { history: [], selectedRunId: '' }))
  assert.match(html, /No runs yet/)
  assert.doesNotMatch(html, /<details/)
})

test('a degraded history shows the reconnecting message instead of any rows', () => {
  const html = renderToStaticMarkup(
    createElement(RunHistory, { history: [run()], selectedRunId: '', degraded: true }),
  )
  assert.match(html, /Reconnecting/)
  assert.doesNotMatch(html, /<details/)
})
