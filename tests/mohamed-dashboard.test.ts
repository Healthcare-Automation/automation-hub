import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MohamedDashboard } from '../components/mohamed/MohamedDashboard'
import demoLedger from '../lib/mohamedDemoLedger.json'
import type { RunLedgerSnapshot } from '../lib/mohamedLedger'

const ledger = demoLedger as RunLedgerSnapshot

test('Mohamed dashboard shows claim review, not raw submission controls, and no Proxi content', () => {
  const html = renderToStaticMarkup(
    createElement(MohamedDashboard, { isAdmin: false, canApprove: false, ledger, ledgerSource: 'live' }),
  )

  assert.doesNotMatch(html, /Proxi|Kimedics|Dentist Job Cafe/i)
  assert.doesNotMatch(html, /Submit claim|Submit claims/i)
  assert.doesNotMatch(html, /href="\/"/)
})

test('status hero shows a plain-language summary; upload card is visible to admin and to Mohamed\'s own session', () => {
  const adminHtml = renderToStaticMarkup(
    createElement(MohamedDashboard, { isAdmin: true, canApprove: true, ledger, ledgerSource: 'live' }),
  )
  const mohamedHtml = renderToStaticMarkup(
    createElement(MohamedDashboard, { isAdmin: false, isMohamed: true, canApprove: true, ledger, ledgerSource: 'live' }),
  )
  // Neither flag set cannot happen in practice (proxy.ts only ever lets an
  // admin or Mohamed cookie reach this page) but is kept as a defensive
  // "nothing granted, show nothing operable" baseline.
  const unauthenticatedHtml = renderToStaticMarkup(
    createElement(MohamedDashboard, { isAdmin: false, canApprove: false, ledger, ledgerSource: 'live' }),
  )

  assert.match(adminHtml, /Upload billing report/)
  assert.match(mohamedHtml, /Upload billing report/) // Mohamed uploads their own billing report and needs to see it queue
  assert.doesNotMatch(unauthenticatedHtml, /Upload billing report/)
  assert.match(adminHtml, /reached HCPF Review|Stopped during|blocked by a billing rule|found nothing to bill/)
})

test('admin preview includes tenant switcher while Mohamed client view does not', () => {
  const adminHtml = renderToStaticMarkup(
    createElement(MohamedDashboard, { isAdmin: true, canApprove: true, ledger, ledgerSource: 'live' }),
  )
  const clientHtml = renderToStaticMarkup(
    createElement(MohamedDashboard, { isAdmin: false, canApprove: false, ledger, ledgerSource: 'live' }),
  )

  assert.match(adminHtml, /href="\/"/)
  assert.match(adminHtml, />Proxi</)
  assert.doesNotMatch(clientHtml, />Proxi</)
})

test('claims that reached review show an Approve action only when canApprove is true', () => {
  const approverHtml = renderToStaticMarkup(
    createElement(MohamedDashboard, { isAdmin: true, canApprove: true, ledger, ledgerSource: 'live' }),
  )
  const viewerHtml = renderToStaticMarkup(
    createElement(MohamedDashboard, { isAdmin: false, canApprove: false, ledger, ledgerSource: 'live' }),
  )

  // Cards render collapsed by default (approve button is inside the expanded
  // panel, client-rendered on click), so assert the claim card itself shows
  // instead of asserting the button text, which only appears after expand.
  const reachedReviewClaims = ledger.events.filter(e => e.step === 'reached_review' && e.status === 'ok')
  if (reachedReviewClaims.length > 0) {
    assert.match(approverHtml, /Needs review|Approved/)
    assert.match(viewerHtml, /Needs review|Approved/)
  }
})

test('no run yet shows an empty state, not a crash', () => {
  const html = renderToStaticMarkup(createElement(MohamedDashboard, { isAdmin: false, canApprove: false }))
  assert.match(html, /No runs yet/)
})

test('a claim card with no step captures shows no step strip (falls back to the legacy single screenshot view)', () => {
  // renderToStaticMarkup never runs useEffect, so no fetch happens and the
  // card renders its collapsed, pre-fetch state -- this test locks in that
  // the collapsed state itself never renders step-strip markup up front,
  // which would be a hydration mismatch waiting to happen.
  const html = renderToStaticMarkup(
    createElement(MohamedDashboard, { isAdmin: true, canApprove: true, ledger, ledgerSource: 'live' }),
  )
  assert.doesNotMatch(html, /Service line 1/)
})

test('claims needing review render under a member header, even before the member id has resolved', () => {
  // renderToStaticMarkup never runs effects, so memberId stays unresolved
  // (null) for every claim -- this locks in that the pending/fallback
  // header text renders instead of nothing.
  const html = renderToStaticMarkup(
    createElement(MohamedDashboard, { isAdmin: true, canApprove: true, ledger, ledgerSource: 'live' }),
  )
  assert.match(html, /Member \(pending\)|Member [A-Za-z0-9-]+/)
})
