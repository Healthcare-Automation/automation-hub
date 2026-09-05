import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MohamedDashboard } from '../components/mohamed/MohamedDashboard'
import demoLedger from '../lib/mohamedDemoLedger.json'
import type { RunLedgerSnapshot } from '../lib/mohamedLedger'

const ledger = demoLedger as RunLedgerSnapshot

test('Mohamed dashboard shows no Proxi content and no raw submission controls', () => {
  const html = renderToStaticMarkup(createElement(MohamedDashboard, { isAdmin: false, ledger, ledgerSource: 'live' }))
  assert.doesNotMatch(html, /Proxi|Kimedics|Dentist Job Cafe/i)
  assert.doesNotMatch(html, /Submit claim|Submit claims/i)
  assert.doesNotMatch(html, /href="\/"/)
})

test('one status panel at the top; upload visible to admin and to Mohamed\'s own session', () => {
  const adminHtml = renderToStaticMarkup(createElement(MohamedDashboard, { isAdmin: true, ledger, ledgerSource: 'live' }))
  const mohamedHtml = renderToStaticMarkup(createElement(MohamedDashboard, { isAdmin: false, isMohamed: true, ledger, ledgerSource: 'live' }))
  const unauthenticatedHtml = renderToStaticMarkup(createElement(MohamedDashboard, { isAdmin: false, ledger, ledgerSource: 'live' }))

  assert.match(adminHtml, /Upload billing report/)
  assert.match(mohamedHtml, /Upload billing report/)
  assert.doesNotMatch(unauthenticatedHtml, /Upload billing report/)
  assert.equal((adminHtml.match(/data-section="status"/g) ?? []).length, 1)
  assert.match(adminHtml, /Latest run/)
})

test('approve/reject, client questions and technical detail are gone (Andy, 2026-09-05)', () => {
  const html = renderToStaticMarkup(createElement(MohamedDashboard, { isAdmin: true, ledger, ledgerSource: 'live' }))
  assert.doesNotMatch(html, /Approve|Reject|Needs review/)
  assert.doesNotMatch(html, /Technical detail/)
  assert.doesNotMatch(html, /questions/i)
  // Coverage-gap / eligibility cards live only inside a run's drill-down.
  assert.doesNotMatch(html, /Eligibility checks for this run/)
})

test('admin preview includes tenant switcher while Mohamed client view does not', () => {
  const adminHtml = renderToStaticMarkup(createElement(MohamedDashboard, { isAdmin: true, ledger, ledgerSource: 'live' }))
  const clientHtml = renderToStaticMarkup(createElement(MohamedDashboard, { isAdmin: false, ledger, ledgerSource: 'live' }))
  assert.match(adminHtml, /href="\/"/)
  assert.match(adminHtml, />Proxi</)
  assert.doesNotMatch(clientHtml, />Proxi</)
})

test('no run yet shows an empty state, not a crash', () => {
  const html = renderToStaticMarkup(createElement(MohamedDashboard, { isAdmin: false }))
  assert.match(html, /No runs yet/)
})
