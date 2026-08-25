import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ClaimsByMember } from '../components/mohamed/ClaimsByMember'
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
    ...overrides,
  }
}

// This is the same grouping/rendering RunHistory's RunCard now embeds
// per-run (moved off MohamedDashboard's old top-level "Claims needing
// review" section, Andy 2026-08-25) -- covered directly here since
// RunHistory only reaches this state after a client-side fetch that
// renderToStaticMarkup never runs.

test('claims that reached review show a review-state badge whether or not canApprove is true', () => {
  const claims = [claim('a1'.padEnd(16, '0'))]
  const approverHtml = renderToStaticMarkup(
    createElement(ClaimsByMember, { runId: 'r'.repeat(32), claims, approvals: new Map(), canApprove: true }),
  )
  const viewerHtml = renderToStaticMarkup(
    createElement(ClaimsByMember, { runId: 'r'.repeat(32), claims, approvals: new Map(), canApprove: false }),
  )

  // Cards render collapsed by default (approve button is inside the expanded
  // panel, client-rendered on click), so assert the claim card itself shows
  // instead of asserting the button text, which only appears after expand.
  assert.match(approverHtml, /Needs review|Approved/)
  assert.match(viewerHtml, /Needs review|Approved/)
})

test('claims needing review render under a member header, even before the member id has resolved', () => {
  // renderToStaticMarkup never runs effects, so memberId stays unresolved
  // (null) for every claim -- this locks in that the pending/fallback
  // header text renders instead of nothing.
  const claims = [claim('a1'.padEnd(16, '0'))]
  const html = renderToStaticMarkup(
    createElement(ClaimsByMember, { runId: 'r'.repeat(32), claims, approvals: new Map(), canApprove: true }),
  )
  assert.match(html, /Member \(pending\)|Member [A-Za-z0-9-]+/)
})
