import { evaluateBillingRows, splitBillingPeriod, type BillingSourceRow } from './mohamedValidation'
import type { MohamedAutomationRun } from './mohamedTypes'

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
    eligibilityCoverages: ['HCBS Elderly, Blind, & Disabled Waiver'],
  },
  {
    sourceRowId: 'fixture-002',
    memberRef: 'DEMO-B2',
    serviceDate: '2026-08-15',
    serviceCode: 'PERSONAL_CARE',
    procedureCode: 'T1019',
    modifiers: ['U1'],
    units: 2,
    chargeAmountCents: 5000,
    sandataStatus: 'pending',
    eligibilityCoverages: ['Community First Choice Services'],
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
    eligibilityCoverages: ['Unrelated Coverage'],
  },
]

const items = evaluateBillingRows(rows)

export const mohamedDemoRuns: MohamedAutomationRun[] = [
  {
    id: 'demo-run-2026-08-21',
    startedAt: '2026-08-21T07:00:00.000Z',
    finishedAt: '2026-08-21T07:02:13.000Z',
    mode: 'dry_run',
    source: 'synthetic_fixture',
    status: items.some(item => item.disposition === 'blocked') ? 'blocked' : 'review_ready',
    billingPeriods: splitBillingPeriod('2026-08-14', '2026-08-20'),
    stages: [
      { name: 'AxisCare extraction', status: 'passed', detail: '3 synthetic rows extracted' },
      { name: 'Billing rules', status: 'passed', detail: 'Every row evaluated with reason codes' },
      { name: 'Sandata readiness', status: 'blocked', detail: '1 row is still pending verification' },
      { name: 'HCPF review navigation', status: 'not_run', detail: 'No portal values entered in fixture mode' },
      { name: 'Claim submission', status: 'not_run', detail: 'Submission is disabled' },
    ],
    items,
  },
]
