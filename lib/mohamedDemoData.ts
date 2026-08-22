import { evaluateBillingRows, splitBillingPeriod, type BillingSourceRow } from './mohamedValidation'
import type { MohamedAutomationRun } from './mohamedTypes'

const BOTH_COVERAGES = ['HCBS Elderly, Blind, & Disabled Waiver', 'Community First Choice Services']

const rows: BillingSourceRow[] = [
  {
    sourceRowId: 'fixture-001',
    memberRef: 'DEMO-A1',
    serviceDate: '2026-08-14',
    serviceCode: 'HOMEMAKING',
    procedureCode: 'S5130',
    modifiers: [],
    units: 4,
    chargeAmountCents: 10000,
    sandataStatus: 'verified',
    eligibilityCoverages: BOTH_COVERAGES,
  },
  {
    sourceRowId: 'fixture-002',
    memberRef: 'DEMO-A1',
    serviceDate: '2026-08-15',
    serviceCode: 'PERSONAL_CARE',
    procedureCode: 'T1019',
    modifiers: ['U1'],
    units: 2,
    chargeAmountCents: 5000,
    sandataStatus: 'pending',
    eligibilityCoverages: BOTH_COVERAGES,
  },
  {
    sourceRowId: 'fixture-003',
    memberRef: 'DEMO-C3',
    serviceDate: '2026-08-16',
    serviceCode: 'HOMEMAKING',
    procedureCode: 'S5130',
    modifiers: [],
    units: 3.5,
    chargeAmountCents: 8750,
    sandataStatus: 'verified',
    eligibilityCoverages: ['Community First Choice Services'],
  },
]

const items = evaluateBillingRows(rows)
const ready = items.filter(item => item.disposition === 'ready_for_review').length
const blocked = items.length - ready

export const mohamedDemoRuns: MohamedAutomationRun[] = [
  {
    id: 'demo-run-2026-08-21',
    startedAt: '2026-08-21T07:00:00.000Z',
    finishedAt: '2026-08-21T07:02:13.000Z',
    mode: 'dry_run',
    source: 'synthetic_fixture',
    status: blocked > 0 ? 'blocked' : 'review_ready',
    billingPeriods: splitBillingPeriod('2026-08-14', '2026-08-20'),
    stages: [
      { name: 'AxisCare extraction', status: 'passed', detail: `${rows.length} synthetic rows extracted` },
      { name: 'Billing rules', status: blocked > 0 ? 'blocked' : 'passed', detail: `${ready} ready, ${blocked} blocked (both coverages required)` },
      { name: 'Claim assembly', status: 'passed', detail: `${ready} claims — one per member, service type and period` },
      { name: 'Overlap guard', status: 'passed', detail: 'No overlapping dates for the same member and service' },
      { name: 'HCPF review navigation', status: 'not_run', detail: 'No portal values entered in fixture mode' },
      { name: 'Claim submission', status: 'not_run', detail: 'Submission is disabled' },
    ],
    items,
  },
]
