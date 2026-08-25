/**
 * Turns a PHI-free run ledger into the handful of numbers and sentences a
 * non-technical reader actually wants: how many visits came in, how many
 * claims are ready for them, what got held back and why — in their words,
 * not the automation's.
 *
 * Nothing here reads member data. It only counts ledger events and maps
 * machine reason codes to English, so it is safe to render anywhere the
 * ledger itself is safe to render.
 */

import { explainFailureCode, type RunLedgerSnapshot } from './mohamedLedger'

/* ------------------------------------------------------------------ *
 * Reason codes → client language
 * ------------------------------------------------------------------ */

/**
 * Machine reason codes emitted by the billing rules (parity with
 * lib/mohamedValidation.ts and src/mohamed_billing/rules.py) mapped to
 * lowercase phrases that read naturally after a colon or a dash:
 *   "14 visits blocked: missing one of the two required coverages"
 * Unknown codes fall back to a de-underscored version of the code, so a
 * newly-added rule degrades to readable-ish rather than to nothing.
 */
const BLOCK_REASON_LABELS: Record<string, string> = {
  qualifying_coverage_missing: 'missing one of the two required coverages',
  service_not_billable: 'service type is not billable',
  units_invalid: 'visit has no billable hours',
  charge_amount_invalid: 'visit has no charge amount',
  service_date_invalid: 'the visit date could not be read',
  service_code_missing: 'the service type was left blank',
  procedure_code_missing: 'the billing code was left blank',
  member_id_invalid: 'the member ID does not look right',
  overlaps_present: 'this period overlaps one already billed',
  duplicate_visit: 'the same visit appears more than once',
  sandata_not_verified: 'the visit is not verified in Sandata yet',
  disposition_blocked: 'held back by a billing rule',
}

export function describeBlockReason(code: string): string {
  return BLOCK_REASON_LABELS[code] ?? code.replaceAll('_', ' ')
}

/** "dry_run" is meaningless to a client; what they need to know is that
 * nothing left the building. */
export function describeRunMode(mode: string): string {
  if (mode === 'dry_run') return 'Review run · nothing submitted'
  if (mode === 'live') return 'Live run · claims submitted'
  return mode.replaceAll('_', ' ')
}

/* ------------------------------------------------------------------ *
 * Dates, the way a person says them
 * ------------------------------------------------------------------ */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2026-08-22' → 'Aug 22'. String slicing, not Date parsing: these are
 * already UTC calendar days and must not shift under a local timezone. */
export function formatDay(day: string, withYear = false): string {
  const [year, month, date] = day.split('-')
  const monthName = MONTHS[Number(month) - 1]
  if (!monthName || !date) return day
  return `${monthName} ${Number(date)}${withYear ? `, ${year}` : ''}`
}

/** The billing period, as the headline of a run card. */
export function formatPeriod(start: string, end: string): string {
  if (!start || !end) return '—'
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  return `${formatDay(start, !sameYear)} – ${formatDay(end, true)}`
}

/** '2026-08-24T10:05:00.000Z' → '10:05 UTC'. */
export function formatClock(iso: string | null): string {
  if (!iso || iso.length < 16) return '—'
  return `${iso.slice(11, 16)} UTC`
}

function addDaysToDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** 'Today' / 'Yesterday' / 'Aug 22' — computed against an explicit `now`
 * so the server render and the client hydration agree (a bare Date.now()
 * inside a client component produces a hydration mismatch at midnight). */
export function describeDay(day: string, nowIso: string): string {
  const today = nowIso.slice(0, 10)
  if (day === today) return 'Today'
  if (day === addDaysToDay(today, -1)) return 'Yesterday'
  return formatDay(day, day.slice(0, 4) !== today.slice(0, 4))
}

export type RunDayGroup<T> = { day: string; label: string; runs: T[] }

/** Groups runs into day buckets, preserving the incoming (newest-first)
 * order both between and within groups. */
export function groupRunsByDay<T extends { startedAt: string }>(runs: T[], nowIso: string): RunDayGroup<T>[] {
  const groups: RunDayGroup<T>[] = []
  for (const run of runs) {
    const day = run.startedAt.slice(0, 10)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.runs.push(run)
    else groups.push({ day, label: describeDay(day, nowIso), runs: [run] })
  }
  return groups
}

/* ------------------------------------------------------------------ *
 * Outcome: the one sentence at the top of a run card
 * ------------------------------------------------------------------ */

export type RunOutcomeTone = 'ready' | 'attention' | 'failed' | 'idle'

export type BlockReason = { code: string; label: string; count: number }

export type RunOutcome = {
  tone: RunOutcomeTone
  /** The human outcome, e.g. "12 claims ready for your review". */
  headline: string
  /** One supporting sentence, or null when the headline says it all. */
  subline: string | null
  visitsIn: number | null
  claimsReady: number
  visitsBlocked: number
  claimsFailed: number
  /** Blocking reasons, most common first. */
  reasons: BlockReason[]
  coverageGapVisits: number
}

/** The subset of a ledger event this module needs. Kept structural so both
 * the full snapshot and a narrow SQL projection can be fed in. */
export type OutcomeSignal = {
  step: string
  status: string
  claim_ref: string | null
  code: string | null
  detail: Record<string, unknown> | null
}

/** Ledger steps that carry outcome numbers. The DB projection selects these
 * (plus anything that failed) instead of a run's whole event stream. */
export const OUTCOME_SIGNAL_STEPS = [
  'rows_received',
  'rows_evaluated',
  'claim_drafted',
  'reached_review',
  'coverage_gap_alert',
] as const

/** Keys in a `rows_evaluated` detail that are totals, not reason codes. */
const NON_REASON_KEYS = new Set(['ready', 'blocked', 'rows', 'total', 'claims', 'evaluated'])

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many
}

export function computeRunOutcome(status: RunLedgerSnapshot['status'], events: OutcomeSignal[]): RunOutcome {
  let visitsIn: number | null = null
  let visitsBlocked = 0
  let coverageGapVisits = 0
  let failureCode: string | null = null
  const reasonCounts = new Map<string, number>()
  const drafted = new Set<string>()
  const reachedReview = new Set<string>()

  for (const event of events) {
    const detail = event.detail ?? {}
    switch (event.step) {
      case 'rows_received':
        visitsIn = (visitsIn ?? 0) + count(detail.rows)
        break
      case 'rows_evaluated':
        visitsBlocked += count(detail.blocked)
        for (const [key, value] of Object.entries(detail)) {
          if (NON_REASON_KEYS.has(key)) continue
          const n = count(value)
          if (n > 0) reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + n)
        }
        break
      case 'coverage_gap_alert':
        coverageGapVisits += count(detail.visits_never_billed)
        break
      case 'claim_drafted':
        if (event.claim_ref) drafted.add(event.claim_ref)
        break
      case 'reached_review':
        if (event.status === 'ok' && event.claim_ref) reachedReview.add(event.claim_ref)
        break
    }
    if (event.status === 'failed' && !failureCode) failureCode = event.code
  }

  for (const ref of reachedReview) drafted.add(ref)
  const claimsReady = reachedReview.size
  const claimsFailed = Math.max(0, drafted.size - claimsReady)
  const reasons: BlockReason[] = [...reasonCounts.entries()]
    .map(([code, n]) => ({ code, label: describeBlockReason(code), count: n }))
    .sort((a, b) => b.count - a.count)
  const topReason = reasons[0] ?? null

  const base = { visitsIn, claimsReady, visitsBlocked, claimsFailed, reasons, coverageGapVisits }

  if (status === 'failed') {
    const explanation = explainFailureCode(failureCode)
    return {
      ...base,
      tone: 'failed',
      headline: 'Run stopped before it finished',
      subline: explanation
        ? explanation.whatHappened
        : 'The run hit an error and stopped. Nothing was submitted.',
    }
  }

  if (claimsReady > 0) {
    let subline: string | null = null
    if (visitsBlocked > 0) {
      subline = `${visitsBlocked} ${plural(visitsBlocked, 'visit')} held back${topReason ? `: ${topReason.label}` : ''}`
    } else if (claimsFailed > 0) {
      subline = `${claimsFailed} ${plural(claimsFailed, 'claim')} did not reach the review screen`
    } else if (visitsIn !== null && visitsIn > 0) {
      subline = `All ${visitsIn} ${plural(visitsIn, 'visit')} from this period made it through`
    }
    return {
      ...base,
      tone: 'ready',
      headline: `${claimsReady} ${plural(claimsReady, 'claim')} ready for your review`,
      subline,
    }
  }

  if (visitsBlocked > 0) {
    const extra = reasons.slice(1)
    return {
      ...base,
      tone: 'attention',
      headline: `No claims built — ${visitsBlocked} ${plural(visitsBlocked, 'visit')} blocked${
        topReason ? `: ${topReason.label}` : ''
      }`,
      subline: extra.length
        ? `Also held back: ${extra.map(r => r.label).join(', ')}.`
        : 'Nothing was submitted. Fix the flagged visits in AxisCare and upload again.',
    }
  }

  if (claimsFailed > 0) {
    return {
      ...base,
      tone: 'attention',
      headline: `${claimsFailed} ${plural(claimsFailed, 'claim')} did not reach the review screen`,
      subline: 'Nothing was submitted. Open the run for the exact step that stopped each claim.',
    }
  }

  return {
    ...base,
    tone: 'idle',
    headline: visitsIn === 0 ? 'Nothing to bill in this period' : 'Run finished — nothing needed your review',
    subline: null,
  }
}

export function runOutcomeFromLedger(ledger: RunLedgerSnapshot): RunOutcome {
  return computeRunOutcome(ledger.status, ledger.events)
}
