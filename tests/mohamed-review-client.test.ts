import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractMemberId, stepDisplayLabel, type ReviewField } from '../lib/mohamedReviewClient'

test('extractMemberId finds the first field whose label looks like a member id', () => {
  const fields: ReviewField[] = [
    { label: 'Total Charged', value: '10.00' },
    { label: 'Member ID', value: 'F736896' },
  ]
  assert.equal(extractMemberId(fields), 'F736896')
})

test('extractMemberId is case- and separator-insensitive', () => {
  assert.equal(extractMemberId([{ label: 'member_id', value: 'A1' }]), 'A1')
  assert.equal(extractMemberId([{ label: 'MemberId', value: 'A2' }]), 'A2')
})

test('extractMemberId returns null when there is no matching field or fields is null', () => {
  assert.equal(extractMemberId([{ label: 'Total Charged', value: '10.00' }]), null)
  assert.equal(extractMemberId(null), null)
  assert.equal(extractMemberId([]), null)
})

test('stepDisplayLabel maps the fixed wizard-step vocabulary to plain names', () => {
  assert.equal(stepDisplayLabel('01-member-info'), 'Member info')
  assert.equal(stepDisplayLabel('02-diagnosis'), 'Diagnosis')
  assert.equal(stepDisplayLabel('03-service-line-1'), 'Service line 1')
  assert.equal(stepDisplayLabel('03-service-line-12'), 'Service line 12')
  assert.equal(stepDisplayLabel('99-review'), 'Review')
  assert.equal(stepDisplayLabel('99-failure'), 'Failure')
})

test('stepDisplayLabel falls back to the raw label for anything unrecognised', () => {
  assert.equal(stepDisplayLabel('07-mystery'), '07-mystery')
})
