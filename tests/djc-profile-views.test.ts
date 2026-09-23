import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeDjcProfileViewsSnapshot } from '../lib/djcViewBudget'

test('normalizes stale Sep-cycle 1050 snapshot to cycle-local 19/750', () => {
  assert.deepEqual(
    normalizeDjcProfileViewsSnapshot(
      { used: 319, total: 1050, remaining: 731, addon_active: false },
      '2026-09-22T20:00:00.000Z',
    ),
    { used: 19, total: 750, remaining: 731, addon_active: false },
  )
})

test('does not alter the unique Aug-cycle 1050 snapshot', () => {
  assert.deepEqual(
    normalizeDjcProfileViewsSnapshot(
      { used: 747, total: 1050, remaining: 303, addon_active: false },
      '2026-09-14T23:10:00.000Z',
    ),
    { used: 747, total: 1050, remaining: 303, addon_active: false },
  )
})

test('does not double-normalize fresh 19/750 payloads', () => {
  assert.deepEqual(
    normalizeDjcProfileViewsSnapshot(
      { used: 19, total: 750, remaining: 731, addon_active: false },
      '2026-09-22T20:00:00.000Z',
    ),
    { used: 19, total: 750, remaining: 731, addon_active: false },
  )
})
