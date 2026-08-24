import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normaliseApprovalBody } from '../lib/mohamedApprovals'

test('new decision shape: approved / clear need no reason', () => {
  assert.deepEqual(normaliseApprovalBody({ decision: 'approved' }), { ok: true, action: 'approved', reason: null })
  assert.deepEqual(normaliseApprovalBody({ decision: 'clear' }), { ok: true, action: 'clear', reason: null })
  // A stray reason on approve is dropped, not stored.
  assert.deepEqual(normaliseApprovalBody({ decision: 'approved', reason: 'x' }), { ok: true, action: 'approved', reason: null })
})

test('rejected requires a non-empty reason, trimmed, max 2000 chars', () => {
  assert.deepEqual(normaliseApprovalBody({ decision: 'rejected', reason: ' units wrong ' }), {
    ok: true,
    action: 'rejected',
    reason: 'units wrong',
  })
  assert.deepEqual(normaliseApprovalBody({ decision: 'rejected' }), { ok: false, error: 'reason_required' })
  assert.deepEqual(normaliseApprovalBody({ decision: 'rejected', reason: '   ' }), { ok: false, error: 'reason_required' })
  assert.deepEqual(normaliseApprovalBody({ decision: 'rejected', reason: 'x'.repeat(2001) }), {
    ok: false,
    error: 'reason_too_long',
  })
  assert.equal(normaliseApprovalBody({ decision: 'rejected', reason: 'x'.repeat(2000) }).ok, true)
})

test('legacy {approved: boolean} shape still works: true→approved, false→clear', () => {
  assert.deepEqual(normaliseApprovalBody({ approved: true }), { ok: true, action: 'approved', reason: null })
  assert.deepEqual(normaliseApprovalBody({ approved: false }), { ok: true, action: 'clear', reason: null })
})

test('garbage bodies are rejected', () => {
  assert.equal(normaliseApprovalBody({}).ok, false)
  assert.equal(normaliseApprovalBody(null).ok, false)
  assert.equal(normaliseApprovalBody({ decision: 'maybe' }).ok, false)
  assert.equal(normaliseApprovalBody({ approved: 'yes' }).ok, false)
  // decision wins over a conflicting legacy field; an invalid decision is
  // still an error even when approved is present.
  assert.equal(normaliseApprovalBody({ decision: 'nope', approved: true }).ok, false)
})
