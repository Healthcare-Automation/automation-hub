import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PROGRESS_STAGES, parseRunProgress } from '../lib/mohamedRunRequests'

test('null progress parses to null', () => {
  assert.equal(parseRunProgress(null), null)
})

test('waiting_for_portal_session is a paused state with no stage index', () => {
  const state = parseRunProgress('waiting_for_portal_session')
  assert.ok(state)
  assert.equal(state.paused, true)
  assert.equal(state.stageIndex, -1)
  assert.equal(state.percent, 0)
})

test('each named stage resolves to its position in PROGRESS_STAGES', () => {
  PROGRESS_STAGES.forEach((stage, index) => {
    const state = parseRunProgress(stage)
    assert.ok(state)
    assert.equal(state.paused, false)
    assert.equal(state.stageIndex, index)
  })
})

test('claims_completed aliases onto entering_claims_on_hcpf', () => {
  const aliased = parseRunProgress('claims_completed')
  const direct = parseRunProgress('entering_claims_on_hcpf')
  assert.equal(aliased?.stageIndex, direct?.stageIndex)
})

test('N_of_M counter is parsed and moves percent within the stage', () => {
  const early = parseRunProgress('checking_eligibility:1_of_10')
  const late = parseRunProgress('checking_eligibility:9_of_10')
  assert.ok(early && late)
  assert.deepEqual(early.counter, { done: 1, total: 10 })
  assert.ok(late.percent > early.percent)
})

test('percent increases monotonically across stage order at the same within-stage fraction', () => {
  const percents = PROGRESS_STAGES.map(stage => parseRunProgress(stage)?.percent ?? -1)
  for (let i = 1; i < percents.length; i++) assert.ok(percents[i] > percents[i - 1], `${percents[i - 1]} -> ${percents[i]}`)
})

test('unknown stage code has stageIndex -1 and percent 0', () => {
  const state = parseRunProgress('some_future_stage')
  assert.ok(state)
  assert.equal(state.stageIndex, -1)
  assert.equal(state.percent, 0)
})
