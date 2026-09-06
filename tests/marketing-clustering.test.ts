import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pickBestCluster, windowCounts } from '../lib/marketingClustering'

test('pickBestCluster attaches to the closest cluster above threshold', () => {
  const clusters = [
    { id: 'a', embedding: [1, 0, 0] },
    { id: 'b', embedding: [0, 1, 0] },
  ]
  const result = pickBestCluster([1, 0, 0], clusters, 0.9)
  assert.equal(result?.id, 'a')
  assert.ok(result && result.similarity >= 0.9)
})

test('pickBestCluster returns null (create new) when nothing clears the threshold', () => {
  const clusters = [{ id: 'a', embedding: [1, 0, 0] }]
  const result = pickBestCluster([0, 1, 0], clusters, 0.5)
  assert.equal(result, null)
})

test('pickBestCluster returns null against an empty cluster set', () => {
  assert.equal(pickBestCluster([1, 0, 0], [], 0.5), null)
})

test('pickBestCluster picks the single best match, not just the first that clears the bar', () => {
  const clusters = [
    { id: 'weak', embedding: [0.9, 0.436, 0] }, // similarity ~0.9
    { id: 'strong', embedding: [1, 0, 0] }, // similarity 1.0
  ]
  const result = pickBestCluster([1, 0, 0], clusters, 0.8)
  assert.equal(result?.id, 'strong')
})

test('windowCounts buckets items into 24h/7d/30d windows using published_at', () => {
  const now = Date.now()
  const hours = (n: number) => new Date(now - n * 60 * 60 * 1000)
  const evidence = [
    { published_at: hours(1), retrieved_at: hours(1) }, // within all three windows
    { published_at: hours(24 * 5), retrieved_at: hours(24 * 5) }, // within 7d and 30d only
    { published_at: hours(24 * 20), retrieved_at: hours(24 * 20) }, // within 30d only
    { published_at: hours(24 * 45), retrieved_at: hours(24 * 45) }, // outside all windows
  ]
  const counts = windowCounts(evidence)
  assert.equal(counts.last24h, 1)
  assert.equal(counts.last7d, 2)
  assert.equal(counts.last30d, 3)
})

test('windowCounts falls back to retrieved_at when published_at is null', () => {
  const now = Date.now()
  const evidence = [{ published_at: null, retrieved_at: new Date(now - 60 * 60 * 1000) }]
  const counts = windowCounts(evidence)
  assert.equal(counts.last24h, 1)
  assert.equal(counts.last7d, 1)
  assert.equal(counts.last30d, 1)
})
