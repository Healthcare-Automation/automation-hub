import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DjcCandidateRow, DjcEvent, DjcRunDetail, DjcRunDetailBundle } from '../lib/djcTypes'

const runEventRow = {
  id: 41,
  run_id: 77,
  candidate_id: null,
  event_type: 'session_reauthed',
  stage: 'auth',
  level: 'info',
  message: 'sensitive provider detail',
  payload: { code: '123456' },
  created_at: '2026-08-21T12:00:00.000Z',
}

test('getDjcRunDetail fetches run-level events with null candidate ids', async t => {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?')
    if (text.includes('from djc_event_log') && text.includes('select id, run_id::int')) {
      const scopesRunDirectly = /where\s+\(?\s*run_id\s*=/.test(text)
      return Promise.resolve(scopesRunDirectly ? [runEventRow] : [])
    }
    return Promise.resolve([])
  }

  t.mock.module('../lib/djcDb.ts', { defaultExport: sql })
  const { getDjcRunDetail } = await import(`../lib/djcQueries.ts?run-level-events=${Date.now()}`)

  const bundle = await getDjcRunDetail(77)

  assert.equal(bundle.events.length, 1)
  assert.equal(bundle.events[0].candidateId, null)
  assert.equal(bundle.events[0].eventType, 'session_reauthed')
  assert.equal(bundle.events[0].message, null)
  assert.equal(bundle.events[0].payload, null)
})

test('run history renders run-level events with safe labels outside candidate activity', async () => {
  const breakdown = await import('../components/DjcRunBreakdown')
  assert.equal(typeof breakdown.RunDetailBody, 'function', 'RunDetailBody must be testable')

  const run = {
    id: 77,
    startedAt: '2026-08-21T12:00:00.000Z',
    finishedAt: '2026-08-21T12:01:00.000Z',
    durationSeconds: 60,
    status: 'ok',
    trigger: 'scheduled',
    writeMode: 'live',
    targets: null,
    targetsProcessed: 0,
    candidatesSeen: 1,
    candidatesSelected: 1,
    contactable: 0,
    uncontactable: 0,
    duplicates: 0,
    created: 0,
    createSkippedGuard: 0,
    errors: 0,
    warnCount: 0,
    errorCount: 0,
    unresolvedErrorCount: 0,
    quotaBlocked: 0,
    viewsSpent: 0,
    createdFromViews: 0,
  } satisfies DjcRunDetail
  const candidate = {
    candidateId: 'candidate-1',
    name: 'Test Candidate',
    profileUrl: null,
    target: null,
    phone: null,
    email: null,
    contactSource: null,
    mailingCity: null,
    mailingState: null,
    mailingPostalCode: null,
    stateLicenses: null,
    preferredStates: null,
    positionTypes: null,
    cvUploaded: false,
    cvFilename: null,
    cvBytesLen: null,
    dedupStatus: null,
    dedupReason: null,
    sfContactId: null,
    matchCount: null,
    addedAt: null,
    lastReviewedOn: null,
  } satisfies DjcCandidateRow
  const runEventTypes = [
    ['session_reauthed', 'Automatic sign-in recovery succeeded'],
    ['session_reauth_failed', 'Automatic sign-in recovery failed'],
    ['otp_received', 'Verification code received'],
    ['otp_delivery_timeout', 'Verification code timed out'],
    ['otp_provider_error', 'Verification-code channel unavailable'],
  ] as const
  const events: DjcEvent[] = [
    ...runEventTypes.map(([eventType], index) => ({
      id: 41 + index,
      runId: 77,
      candidateId: null,
      eventType,
      stage: 'auth',
      level: 'info' as const,
      message: `provider account secret detail ${index}`,
      payload: { code: `12345${index}` },
      createdAt: '2026-08-21T12:00:00.000Z',
    })),
    {
      id: 50,
      runId: 77,
      candidateId: 'candidate-1',
      eventType: 'run_failed',
      stage: 'auth',
      level: 'error',
      message: 'candidate-only secret detail',
      payload: { code: '654321' },
      createdAt: '2026-08-21T12:00:01.000Z',
    },
  ]
  const bundle = { events, candidates: [candidate] } satisfies DjcRunDetailBundle

  const html = renderToStaticMarkup(createElement(breakdown.RunDetailBody, { run, bundle }))

  assert.match(html, /Run activity/)
  for (const [, safeLabel] of runEventTypes) assert.match(html, new RegExp(safeLabel))
  assert.doesNotMatch(html, /Run failed/)
  assert.doesNotMatch(html, /provider account secret detail|candidate-only secret detail|12345\d|654321/)
})
