import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareOpportunityRank } from '../lib/marketing/ranking'

test('live data always outranks demo data, regardless of score', () => {
  const highScoreDemo = { isDemoData: true, totalScore: 99 }
  const lowScoreLive = { isDemoData: false, totalScore: 1 }
  const sorted = [highScoreDemo, lowScoreLive].sort(compareOpportunityRank)
  assert.deepEqual(sorted, [lowScoreLive, highScoreDemo])
})

test('within the same demo/live group, higher score ranks first', () => {
  const a = { isDemoData: false, totalScore: 40 }
  const b = { isDemoData: false, totalScore: 90 }
  const sorted = [a, b].sort(compareOpportunityRank)
  assert.deepEqual(sorted, [b, a])
})

test('opportunities with no score yet sort last within their group', () => {
  const scored = { isDemoData: false, totalScore: 10 }
  const unscored = { isDemoData: false, totalScore: null }
  const sorted = [unscored, scored].sort(compareOpportunityRank)
  assert.deepEqual(sorted, [scored, unscored])
})

test('a full mixed set sorts live-then-demo, each group by score descending', () => {
  const items = [
    { id: 'demo-high', isDemoData: true, totalScore: 95 },
    { id: 'live-low', isDemoData: false, totalScore: 20 },
    { id: 'live-high', isDemoData: false, totalScore: 80 },
    { id: 'demo-low', isDemoData: true, totalScore: 10 },
  ]
  const sorted = items.slice().sort(compareOpportunityRank).map((i) => i.id)
  assert.deepEqual(sorted, ['live-high', 'live-low', 'demo-high', 'demo-low'])
})
