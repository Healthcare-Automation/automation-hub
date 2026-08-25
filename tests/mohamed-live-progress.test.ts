import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  describeMemberState,
  describePhase,
  describeStepLabel,
  isBoardStale,
  isTerminalPhase,
  parseProgressPayload,
  summariseBoard,
  STALE_AFTER_MS,
  type LiveMember,
} from '../lib/mohamedLiveProgress'

function member(memberId: string, state: string, claims: Record<string, string> = {}): LiveMember {
  return { memberId, state, claims }
}

test('every machine member state reads as plain English, never a raw code', () => {
  assert.equal(describeMemberState('waiting').label, 'Waiting')
  assert.equal(describeMemberState('checking_coverage').label, 'Checking coverage…')
  assert.equal(describeMemberState('covered').label, 'Coverage confirmed')
  assert.equal(describeMemberState('no_coverage').label, 'Missing required coverage')
  assert.equal(describeMemberState('lookup_failed').label, 'Coverage check failed')
  assert.equal(describeMemberState('entering_claim').label, 'Entering claim…')
  assert.equal(describeMemberState('review_reached').label, 'Claim ready for review')
  assert.equal(describeMemberState('claim_failed').label, 'Claim entry failed')
  assert.equal(describeMemberState('blocked').label, 'Held back by billing rules')
})

test('wizard step states name the step they are on', () => {
  assert.equal(describeMemberState('step:01-member-info').label, 'Entering claim — member info')
  assert.equal(describeMemberState('step:02-diagnosis').label, 'Entering claim — diagnosis')
  assert.equal(describeMemberState('step:03-service-line-2').label, 'Entering claim — service line 2')
})

test('an unknown state degrades to a readable phrase and is not counted as finished', () => {
  const view = describeMemberState('some_new_state')
  assert.equal(view.label, 'Some new state')
  assert.equal(view.weight, 0)
  assert.equal(view.bucket, 'inProgress')
})

test('colour carries the meaning: working blue, good emerald, held amber, broken red', () => {
  assert.equal(describeMemberState('checking_coverage').tone, 'blue')
  assert.equal(describeMemberState('step:02-diagnosis').tone, 'blue')
  assert.equal(describeMemberState('review_reached').tone, 'emerald')
  assert.equal(describeMemberState('blocked').tone, 'amber')
  assert.equal(describeMemberState('no_coverage').tone, 'amber')
  assert.equal(describeMemberState('claim_failed').tone, 'red')
  assert.equal(describeMemberState('lookup_failed').tone, 'red')
})

test('only in-flight states pulse', () => {
  assert.equal(describeMemberState('checking_coverage').busy, true)
  assert.equal(describeMemberState('entering_claim').busy, true)
  assert.equal(describeMemberState('step:01-member-info').busy, true)
  assert.equal(describeMemberState('waiting').busy, false)
  assert.equal(describeMemberState('review_reached').busy, false)
})

test('the three-leg tracker advances Coverage -> Claim entry -> Review', () => {
  assert.deepEqual(describeMemberState('waiting').legs, ['pending', 'pending', 'pending'])
  assert.deepEqual(describeMemberState('checking_coverage').legs, ['active', 'pending', 'pending'])
  assert.deepEqual(describeMemberState('covered').legs, ['done', 'pending', 'pending'])
  assert.deepEqual(describeMemberState('step:02-diagnosis').legs, ['done', 'active', 'pending'])
  assert.deepEqual(describeMemberState('review_reached').legs, ['done', 'done', 'done'])
  assert.deepEqual(describeMemberState('no_coverage').legs, ['warn', 'skipped', 'skipped'])
  assert.deepEqual(describeMemberState('claim_failed').legs, ['done', 'fail', 'skipped'])
})

test('later wizard steps weigh more than earlier ones, and never overtake review', () => {
  const one = describeMemberState('step:01-member-info').weight
  const two = describeMemberState('step:02-diagnosis').weight
  const three = describeMemberState('step:03-service-line-1').weight
  assert.ok(describeMemberState('entering_claim').weight < one)
  assert.ok(one < two && two < three)
  assert.ok(three < describeMemberState('review_reached').weight)
})

test('the summary counts members by outcome and averages overall progress', () => {
  const summary = summariseBoard([
    member('A1', 'waiting'),
    member('A2', 'checking_coverage'),
    member('A3', 'review_reached'),
    member('A4', 'blocked'),
    member('A5', 'claim_failed'),
  ])
  assert.equal(summary.total, 5)
  assert.equal(summary.waiting, 1)
  assert.equal(summary.inProgress, 1)
  assert.equal(summary.ready, 1)
  assert.equal(summary.heldBack, 1)
  assert.equal(summary.failed, 1)
  assert.equal(summary.percent, 63) // (0 + .15 + 1 + 1 + 1) / 5
})

test('an empty board summarises to zero rather than dividing by zero', () => {
  assert.deepEqual(summariseBoard([]), { total: 0, waiting: 0, inProgress: 0, ready: 0, heldBack: 0, failed: 0, percent: 0 })
})

test('phases read as sentences, and finished/failed are terminal', () => {
  assert.equal(describePhase('checking_coverage'), 'Checking coverage for each client')
  assert.equal(describePhase('entering_claims'), 'Entering claims on the HCPF portal')
  assert.equal(describePhase('brand_new_phase'), 'brand new phase')
  assert.equal(isTerminalPhase('finished'), true)
  assert.equal(isTerminalPhase('failed'), true)
  assert.equal(isTerminalPhase('entering_claims'), false)
})

test('a board older than the stale window is not treated as live', () => {
  const now = Date.parse('2026-08-25T06:30:00Z')
  assert.equal(isBoardStale('2026-08-25T06:29:00Z', now), false)
  assert.equal(isBoardStale(new Date(now - STALE_AFTER_MS - 1_000).toISOString(), now), true)
  assert.equal(isBoardStale(null, now), true)
  assert.equal(isBoardStale('not-a-date', now), true)
})

test('a real payload parses into sorted member rows', () => {
  const board = parseProgressPayload({
    ok: true,
    progress: {
      request_id: 22,
      run_id: 'bb6263b8',
      phase: 'entering_claims',
      updated_at: '2026-08-25T06:28:12+00:00',
      members: {
        F736896: { state: 'step:02-diagnosis', claims: { deadbeef: 'step:02-diagnosis' } },
        A100000: { state: 'waiting', claims: {} },
      },
    },
  })
  assert.ok(board)
  assert.equal(board.requestId, 22)
  assert.equal(board.runId, 'bb6263b8')
  assert.equal(board.phase, 'entering_claims')
  assert.deepEqual(board.members.map(m => m.memberId), ['A100000', 'F736896'])
  assert.equal(board.members[1].claims.deadbeef, 'step:02-diagnosis')
})

test('no live board, a failed call, or a malformed payload all parse to null', () => {
  assert.equal(parseProgressPayload({ ok: true, progress: null }), null)
  assert.equal(parseProgressPayload({ ok: false, error: 'unauthorized' }), null)
  assert.equal(parseProgressPayload(null), null)
  assert.equal(parseProgressPayload('nope'), null)
})

test('a half-written board keeps the members it can read and defaults the rest', () => {
  const board = parseProgressPayload({
    ok: true,
    progress: { phase: 'starting', members: { A1: {}, A2: null, A3: { state: 'covered', claims: { x: 7 } } } },
  })
  assert.ok(board)
  assert.equal(board.requestId, null)
  assert.equal(board.updatedAt, null)
  assert.deepEqual(board.members.map(m => `${m.memberId}:${m.state}`), ['A1:waiting', 'A3:covered'])
  assert.deepEqual(board.members[1].claims, {}) // non-string claim state dropped
})

test('step labels stay readable for an unseen step', () => {
  assert.equal(describeStepLabel('07-mystery-step'), 'mystery step')
})
