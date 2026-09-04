import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groupClaimsByMember, isClaimOpen, type ClaimGroup } from '../lib/mohamedClaimGrouping'
import type { ClaimTrace } from '../lib/mohamedLedger'

function claim(claimRef: string, overrides: Partial<ClaimTrace> = {}): ClaimTrace {
  return {
    claimRef,
    portalActions: 10,
    failedActions: 0,
    reachedReview: true,
    failureCode: null,
    failureField: null,
    procedureCode: 's5130',
    modifiers: null,
    unitsX100: 400,
    chargeCents: 10_000,
    hcpfClaimId: null,
    hcpfStatus: null,
    validation: null,
    ...overrides,
  }
}

test('isClaimOpen treats null/undefined/anything but approved-or-rejected as open', () => {
  assert.equal(isClaimOpen(null), true)
  assert.equal(isClaimOpen(undefined), true)
  assert.equal(isClaimOpen('approved'), false)
  assert.equal(isClaimOpen('rejected'), false)
})

test('groupClaimsByMember groups by resolved member id, preserving claim order within a group', () => {
  const claims = [claim('a1'), claim('a2'), claim('b1')]
  const memberIds = { a1: 'F736896', a2: 'F736896', b1: 'F999999' }
  const groups = groupClaimsByMember(claims, memberIds, () => null)

  const byMember = new Map(groups.map(g => [g.memberId, g]))
  assert.deepEqual(
    byMember.get('F736896')!.claims.map(c => c.claimRef),
    ['a1', 'a2'],
  )
  assert.deepEqual(
    byMember.get('F999999')!.claims.map(c => c.claimRef),
    ['b1'],
  )
})

test('groupClaimsByMember buckets claims with an unresolved member id separately per claim, not together', () => {
  const claims = [claim('a1'), claim('a2')]
  const groups = groupClaimsByMember(claims, {}, () => null)
  assert.equal(groups.length, 2) // not merged into one "unknown" bucket -- each pending claim is its own group
  assert.ok(groups.every(g => g.memberId === null))
})

test('groupClaimsByMember sorts groups with at least one open (undecided) claim before fully-decided groups', () => {
  const claims = [claim('done1'), claim('open1'), claim('done2')]
  const memberIds = { done1: 'M-DONE', open1: 'M-OPEN', done2: 'M-DONE2' }
  const decisionFor = (ref: string): 'approved' | 'rejected' | null =>
    ref === 'open1' ? null : 'approved'

  const groups = groupClaimsByMember(claims, memberIds, decisionFor)
  const order = groups.map(g => g.memberId)
  assert.equal(order[0], 'M-OPEN')
  // the two fully-decided groups keep their original relative order (stable sort)
  assert.deepEqual(order.slice(1), ['M-DONE', 'M-DONE2'])
})

test('groupClaimsByMember treats a group as open if ANY of its claims is open, not just the first', () => {
  const claims = [claim('a1'), claim('a2'), claim('solo')]
  const memberIds = { a1: 'M-A', a2: 'M-A', solo: 'M-SOLO' }
  const decisionFor = (ref: string): 'approved' | 'rejected' | null => (ref === 'a1' ? 'approved' : ref === 'a2' ? null : 'approved')

  const groups = groupClaimsByMember(claims, memberIds, decisionFor)
  assert.equal(groups[0].memberId, 'M-A') // a2 is still open, so M-A sorts first despite a1 being decided
})
