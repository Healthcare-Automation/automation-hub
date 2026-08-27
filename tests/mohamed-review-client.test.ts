import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractDateRange, extractMemberId, formatReviewDate, stepDisplayLabel, type ReviewField } from '../lib/mohamedReviewClient'

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

test('extractDateRange reads plain From/To Date labels (in-progress service line)', () => {
  const fields: ReviewField[] = [
    { label: 'From Date', value: '08/13/2026' },
    { label: 'To Date', value: '08/19/2026' },
    { label: 'Charge Amount', value: '269.60' },
  ]
  assert.deepEqual(extractDateRange(fields), { from: '08/13/2026', to: '08/19/2026' })
})

test('extractDateRange reads the committed grid row labels (Service Details row N)', () => {
  const fields: ReviewField[] = [
    { label: 'Service Details row 1: From Date', value: '08/01/2026' },
    { label: 'Service Details row 1: To Date', value: '08/07/2026' },
    { label: 'Service Details row 1: Charge Amount', value: '$141.54' },
  ]
  assert.deepEqual(extractDateRange(fields), { from: '08/01/2026', to: '08/07/2026' })
})

test('extractDateRange returns null when either date is missing or fields is null', () => {
  assert.equal(extractDateRange([{ label: 'From Date', value: '08/13/2026' }]), null)
  assert.equal(extractDateRange(null), null)
  assert.equal(extractDateRange([]), null)
})

test('formatReviewDate turns MM/DD/YYYY into a short month-day label', () => {
  assert.equal(formatReviewDate('08/13/2026'), 'Aug 13')
  assert.equal(formatReviewDate('01/05/2026'), 'Jan 5')
})

test('formatReviewDate falls back to the raw string for anything not in that shape', () => {
  assert.equal(formatReviewDate('not-a-date'), 'not-a-date')
})
