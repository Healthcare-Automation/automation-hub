import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groupClaimsByMember, isClaimFlagged } from '../lib/mohamedClaimGrouping'
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
    lines: [],
    hcpfClaimId: null,
    hcpfStatus: null,
    paidCents: null,
    validation: null,
    alreadySubmitted: false,
    ...overrides,
  }
}

test('isClaimFlagged: denied, or a re-check that disagreed / found nothing', () => {
  assert.equal(isClaimFlagged(claim('a')), false)
  assert.equal(isClaimFlagged(claim('a', { hcpfStatus: 'paid', validation: { status: 'match', hcpfStatus: 'paid' } })), false)
  assert.equal(isClaimFlagged(claim('a', { hcpfStatus: 'denied' })), true)
  assert.equal(isClaimFlagged(claim('a', { hcpfStatus: 'paid', validation: { status: 'mismatch', hcpfStatus: 'denied' } })), true)
  assert.equal(isClaimFlagged(claim('a', { hcpfStatus: 'paid', validation: { status: 'not_found', hcpfStatus: null } })), true)
  // An underpayment is NOT a flag -- HCPF pays its own fee schedule.
  assert.equal(isClaimFlagged(claim('a', { hcpfStatus: 'paid', paidCents: 9_000, validation: { status: 'match', hcpfStatus: 'paid' } })), false)
})

test('groupClaimsByMember groups by resolved member id, preserving claim order within a group', () => {
  const claims = [claim('a1'), claim('a2'), claim('b1')]
  const groups = groupClaimsByMember(claims, { a1: 'F736896', a2: 'F736896', b1: 'F999999' })
  const byMember = new Map(groups.map(g => [g.memberId, g]))
  assert.deepEqual(byMember.get('F736896')!.claims.map(c => c.claimRef), ['a1', 'a2'])
  assert.deepEqual(byMember.get('F999999')!.claims.map(c => c.claimRef), ['b1'])
})

test('groupClaimsByMember buckets claims with an unresolved member id separately per claim, not together', () => {
  const groups = groupClaimsByMember([claim('a1'), claim('a2')], {})
  assert.equal(groups.length, 2)
  assert.ok(groups.every(g => g.memberId === null))
})

test('groups with a flagged claim sort first; the rest keep their order', () => {
  const claims = [claim('ok1'), claim('bad', { hcpfStatus: 'denied' }), claim('ok2')]
  const groups = groupClaimsByMember(claims, { ok1: 'M-1', bad: 'M-BAD', ok2: 'M-2' })
  assert.deepEqual(groups.map(g => g.memberId), ['M-BAD', 'M-1', 'M-2'])
})

test('a group is flagged if ANY of its claims is, not just the first', () => {
  const claims = [claim('a1'), claim('a2', { hcpfStatus: 'denied' }), claim('solo')]
  const groups = groupClaimsByMember(claims, { a1: 'M-A', a2: 'M-A', solo: 'M-SOLO' })
  assert.equal(groups[0].memberId, 'M-A')
})
