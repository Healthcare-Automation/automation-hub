import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ClaimsByMember } from '../components/mohamed/ClaimsByMember'
import demo from '../lib/mohamedDemoLedger.json' with { type: 'json' }
import type { ClaimTrace, RunLedgerSnapshot } from '../lib/mohamedLedger'

const base = demo as RunLedgerSnapshot

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
    lines: [{ procedureCode: 's5130', modifiers: null, unitsX100: 400, chargeCents: 10_000 }],
    hcpfClaimId: null,
    hcpfStatus: null,
    paidCents: null,
    validation: null,
    ...overrides,
  }
}

function withSubmit(claimRef: string): RunLedgerSnapshot {
  return {
    ...base,
    mode: 'submit',
    events: [
      ...base.events,
      { run_id: base.run_id, seq: 9000, at: '2026-09-05T00:00:00Z', stage: 'submission', step: 'submit', status: 'ok', claim_ref: claimRef, action: null, field: null, code: null, detail: {}, duration_ms: null },
    ],
  }
}

const REF = 'a1'.padEnd(16, '0')

test('a test-run claim says it was not submitted, and shows no approve/reject', () => {
  const html = renderToStaticMarkup(createElement(ClaimsByMember, { runId: 'r'.repeat(32), ledger: base, claims: [claim(REF)] }))
  assert.match(html, /Test · not submitted/)
  assert.doesNotMatch(html, /Approve|Reject|Needs review/)
})

test('a submitted claim shows HCPF\'s own status and paid vs claimed', () => {
  const claims = [claim(REF, { hcpfClaimId: '2226247008100', hcpfStatus: 'paid', paidCents: 9_000, validation: { status: 'match', hcpfStatus: 'paid' } })]
  const html = renderToStaticMarkup(createElement(ClaimsByMember, { runId: 'r'.repeat(32), ledger: withSubmit(REF), claims }))
  assert.match(html, />Paid</)
  assert.match(html, /\$90\.00 paid of \$100\.00/)
  assert.match(html, /HCPF Claim ID 2226247008100/)
})

test('a submitted claim with no receipt yet reads as awaiting HCPF, never as paid', () => {
  const html = renderToStaticMarkup(createElement(ClaimsByMember, { runId: 'r'.repeat(32), ledger: withSubmit(REF), claims: [claim(REF)] }))
  assert.match(html, /Submitted · awaiting HCPF/)
  assert.doesNotMatch(html, />Paid</)
})

test('claims render under a member header, even before the member id has resolved', () => {
  const html = renderToStaticMarkup(createElement(ClaimsByMember, { runId: 'r'.repeat(32), ledger: base, claims: [claim(REF)] }))
  assert.match(html, /Member \(pending\) — 1 claim/)
})

test('the collapsed card shows CLAIM totals, not the last line (multi-line claim)', () => {
  const claims = [
    claim(REF, {
      unitsX100: 7_500,
      chargeCents: 53_325,
      lines: [
        { procedureCode: 't1019', modifiers: 'u2_hx', unitsX100: 2_500, chargeCents: 17_775 },
        { procedureCode: 't1019', modifiers: 'u2_hx', unitsX100: 5_000, chargeCents: 35_550 },
      ],
    }),
  ]
  const html = renderToStaticMarkup(createElement(ClaimsByMember, { runId: 'r'.repeat(32), ledger: base, claims }))
  assert.match(html, /2 lines · 75\.00 units · \$533\.25/)
})
