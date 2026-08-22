export type BillingPeriod = { startDate: string; endDate: string }
export type SandataStatus = 'verified' | 'pending' | 'rejected' | 'unknown'
export type BillingDisposition = 'ready_for_review' | 'blocked' | 'manual_review'

export type BillingSourceRow = {
  sourceRowId: string
  memberRef: string
  serviceDate: string
  serviceCode: string
  procedureCode: string
  modifiers: string[]
  units: number
  chargeAmountCents: number
  sandataStatus: SandataStatus
  eligibilityCoverages: string[]
}

export type BillingReviewItem = BillingSourceRow & {
  reviewKey: string
  disposition: BillingDisposition
  reasons: string[]
  submissionAllowed: false
}

// Client decision 2026-08-21: a member must carry BOTH coverages to be billable.
export const REQUIRED_COVERAGES = [
  'HCBS Elderly, Blind, & Disabled Waiver',
  'Community First Choice Services',
] as const

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid ISO date: ${value}`)
  }
  return date
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function monthEnd(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
}

export function splitBillingPeriod(startDate: string, endDate: string): BillingPeriod[] {
  let cursor = parseDate(startDate)
  const end = parseDate(endDate)
  if (end < cursor) throw new Error('Billing period end date must not precede start date')

  const periods: BillingPeriod[] = []
  while (cursor <= end) {
    const sevenDayEnd = addDays(cursor, 6)
    const calendarMonthEnd = monthEnd(cursor)
    const periodEnd = new Date(Math.min(end.getTime(), sevenDayEnd.getTime(), calendarMonthEnd.getTime()))
    periods.push({ startDate: formatDate(cursor), endDate: formatDate(periodEnd) })
    cursor = addDays(periodEnd, 1)
  }
  return periods
}

function reviewKey(row: BillingSourceRow): string {
  return [
    row.memberRef,
    row.serviceDate,
    row.serviceCode,
    row.procedureCode,
    [...row.modifiers].sort().join(','),
  ].join('|')
}

export function evaluateBillingRows(rows: BillingSourceRow[]): BillingReviewItem[] {
  return rows.map(row => {
    const reasons: string[] = []

    // Parity with src/mohamed_billing/rules.py::evaluate_rows (R13/R14).
    let validDate = /^\d{4}-\d{2}-\d{2}$/.test(row.serviceDate)
    if (validDate) {
      try { parseDate(row.serviceDate) } catch { validDate = false }
    }
    if (!validDate) reasons.push('service_date_invalid')
    if (!row.serviceCode.trim()) reasons.push('service_code_missing')
    if (!row.procedureCode.trim()) reasons.push('procedure_code_missing')
    if (!/^[A-Za-z]/.test(row.memberRef)) reasons.push('member_id_invalid')
    if (!Number.isFinite(row.units) || row.units <= 0) reasons.push('units_invalid')
    if (!Number.isInteger(row.chargeAmountCents) || row.chargeAmountCents <= 0) {
      reasons.push('charge_amount_invalid')
    }
    // Sandata is deliberately NOT a gate (client decision 2026-08-21): the HCPF
    // portal declines an unverified visit itself at submit time. Display only.
    if (!REQUIRED_COVERAGES.every(coverage => row.eligibilityCoverages.includes(coverage))) {
      reasons.push('qualifying_coverage_missing')
    }

    return {
      ...row,
      reviewKey: reviewKey(row),
      disposition: reasons.length ? 'blocked' : 'ready_for_review',
      reasons,
      submissionAllowed: false,
    }
  })
}
