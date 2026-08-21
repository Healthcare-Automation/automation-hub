import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MohamedDashboard } from '../components/mohamed/MohamedDashboard'
import type { MohamedAutomationRun } from '../lib/mohamedTypes'

const run: MohamedAutomationRun = {
  id: 'demo-run-001',
  startedAt: '2026-08-21T07:00:00.000Z',
  finishedAt: '2026-08-21T07:02:00.000Z',
  mode: 'dry_run',
  source: 'synthetic_fixture',
  status: 'review_ready',
  billingPeriods: [{ startDate: '2026-08-14', endDate: '2026-08-20' }],
  stages: [
    { name: 'AxisCare extraction', status: 'passed', detail: '2 rows extracted' },
    { name: 'HCPF review navigation', status: 'not_run', detail: 'No portal values entered' },
  ],
  items: [
    {
      sourceRowId: 'fixture-1',
      memberRef: 'DEMO-A1',
      serviceDate: '2026-08-14',
      serviceCode: 'HOMEMAKING',
      procedureCode: 'S5130',
      modifiers: [],
      units: 4,
      chargeAmountCents: 10000,
      sandataStatus: 'verified',
      eligibilityCoverages: ['HCBS Elderly, Blind, & Disabled Waiver'],
      reviewKey: 'DEMO-A1|2026-08-14|HOMEMAKING|S5130|',
      disposition: 'ready_for_review',
      reasons: [],
      submissionAllowed: false,
    },
    {
      sourceRowId: 'fixture-2',
      memberRef: 'DEMO-B2',
      serviceDate: '2026-08-14',
      serviceCode: 'PERSONAL_CARE',
      procedureCode: 'T1019',
      modifiers: ['U1'],
      units: 2,
      chargeAmountCents: 5000,
      sandataStatus: 'pending',
      eligibilityCoverages: ['Community First Choice Services'],
      reviewKey: 'DEMO-B2|2026-08-14|PERSONAL_CARE|T1019|U1',
      disposition: 'blocked',
      reasons: ['sandata_not_verified'],
      submissionAllowed: false,
    },
  ],
}

test('Mohamed dashboard shows dry-run evidence without submission controls or Proxi content', () => {
  const html = renderToStaticMarkup(createElement(MohamedDashboard, { runs: [run], isAdmin: false }))

  assert.match(html, /Validation mode/)
  assert.match(html, /No claims are submitted/)
  assert.match(html, /DEMO-A1/)
  assert.match(html, /Ready for review/)
  assert.match(html, /Blocked/)
  assert.doesNotMatch(html, /Proxi|Kimedics|Dentist Job Cafe/i)
  assert.doesNotMatch(html, /Submit claim|Submit claims/i)
  assert.doesNotMatch(html, /href="\/"/)
})

test('admin preview includes tenant switcher while Mohamed client view does not', () => {
  const adminHtml = renderToStaticMarkup(createElement(MohamedDashboard, { runs: [run], isAdmin: true }))
  const clientHtml = renderToStaticMarkup(createElement(MohamedDashboard, { runs: [run], isAdmin: false }))

  assert.match(adminHtml, /href="\/"/)
  assert.match(adminHtml, />Proxi</)
  assert.doesNotMatch(clientHtml, />Proxi</)
})
