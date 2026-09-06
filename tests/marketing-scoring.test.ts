import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeTrendScore } from '../lib/marketing/scoring'

const BASE = {
  dentalHealthcareRelevance: 80,
  evidenceStrength: 70,
  distinctSourceCount: 3,
  storyPotential: 60,
  learnedInterestFit: 50,
}

test('momentum falls back to pure recency decay when itemCounts is omitted', () => {
  const fresh = computeTrendScore({ ...BASE, daysSinceMostRecentItem: 0 })
  const stale = computeTrendScore({ ...BASE, daysSinceMostRecentItem: 30 })
  assert.equal(fresh.breakdown.momentumRecency, 100)
  assert.equal(stale.breakdown.momentumRecency, 0)
  assert.ok(fresh.total > stale.total)
})

test('momentum rewards accelerating item velocity over a flat baseline rate', () => {
  const accelerating = computeTrendScore({
    ...BASE,
    daysSinceMostRecentItem: 0,
    itemCounts: { last24h: 5, last7d: 10, last30d: 12 }, // most of the 30d volume just showed up
  })
  const flat = computeTrendScore({
    ...BASE,
    daysSinceMostRecentItem: 0,
    itemCounts: { last24h: 0, last7d: 3, last30d: 12 }, // steady trickle, nothing new today
  })
  assert.ok(
    accelerating.breakdown.momentumRecency > flat.breakdown.momentumRecency,
    `expected accelerating (${accelerating.breakdown.momentumRecency}) > flat (${flat.breakdown.momentumRecency})`,
  )
  assert.ok(accelerating.total > flat.total)
  assert.match(accelerating.explanation, /5 items\/24h, 10\/7d, 12\/30d/)
})

test('a cluster with zero real history (30d count 0) does not divide by zero', () => {
  const result = computeTrendScore({
    ...BASE,
    daysSinceMostRecentItem: 0,
    itemCounts: { last24h: 1, last7d: 1, last30d: 0 },
  })
  assert.ok(Number.isFinite(result.breakdown.momentumRecency))
  assert.ok(result.breakdown.momentumRecency <= 100)
})
