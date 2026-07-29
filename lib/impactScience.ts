/**
 * Client-safe impact constants + types (no DB imports) — the statistical results
 * computed offline in proxi_djc_automation/scripts/impact_analysis.py, pinned with
 * their computation date. Live queries live in lib/impact.ts (server only).
 */

/** Manual-time model — identical to the one in the Kimedics weekly report
 *  (scrape_gmail_modal.py) so the two never disagree: hands-on minutes per action
 *  plus a context-switch tax on every inbound email. */
export const TIME_MODEL = { minPerOpen: 8, minPerOther: 1.5, minPerEmailSwitch: 2 }

export const IMPACT_META = {
  computedOn: '2026-07-24',
  kimedicsGoLive: '2026-04-09',
  djcGoLive: '2026-06-16',
}

/** Kimedics email → structured in our system (n=2,348 emails with sane timestamps). */
export const KIM_LATENCY = { medianMin: 8, p90Min: 18, n: 2348 }

/** Kimedics failure-class events per month (anything matching fail/error in the event log).
 *  Fix timeline: Jun 23 Salesforce auth migrated to client_credentials (killed the monthly
 *  credential-expiry outage); Jul 13 Gmail moved off IMAP to the Gmail API (killed the
 *  connection-cap outages). */
export const KIM_ERRORS_MONTHLY = [
  { month: 'Apr', count: 22 },
  { month: 'May', count: 49 },
  { month: 'Jun', count: 11 },
  { month: 'Jul', count: 0 },
]

/** Poisson rate ratio, July (0 events / 24 days) vs May (49 / 31 days), +0.5 correction. */
export const KIM_ERROR_RR = { rr: 0.013, lo: 0.001, hi: 0.21 }

/** DJC-era comparison of "dentist registers on DJC → exists in Salesforce".
 *  All-time manual era is dominated by candidates who joined DJC years before Proxi
 *  worked the platform; restricted to 2025+ registrations both eras land at ~1 day —
 *  the team's bulk imports were prompt. We report the honest version. */
export const DJC_LAG = {
  manualAllTime: { n: 1335, medianDays: 609 },
  bothEras2025Plus: { medianDays: 1 },
}

/** Historical flywheel (from the hire analysis): placements arrive years after signup. */
export const FLYWHEEL = { n: 58, medianYears: 3.4, within1yPct: 14 }

/** DJC contacts entering Salesforce per month (2026), split manual-era vs automation-created.
 *  July: 97% of all candidate inflow came from the automation — the manual import workflow
 *  is effectively retired. (SF totals + automation attribution computed 2026-07-25.) */
export const DJC_INFLOW_MONTHLY = [
  { month: 'Jan', total: 305, auto: 0 },
  { month: 'Feb', total: 285, auto: 0 },
  { month: 'Mar', total: 358, auto: 0 },
  { month: 'Apr', total: 316, auto: 0 },
  { month: 'May', total: 309, auto: 0 },
  { month: 'Jun', total: 294, auto: 142 },
  { month: 'Jul', total: 187, auto: 181 },
]

/** Kimedics-side Job__c records created in Salesforce per month, 2026 (automation live Apr 9).
 *  Volume is set by the market, not by us — the automation's gain is speed and completeness. */
/**
 * Jobs the automation actually handled, per month.
 *
 * Was previously every job entering Salesforce (Jan 43, Feb 42 ... Jul 39). The automation did not
 * go live until 31 Mar, so January and February could not have been its work at all, and even after
 * go-live most of that volume arrives through other routes. Charting it under an automation heading
 * claimed credit for the whole market's activity.
 *
 * These are distinct jobs the automation scraped, matched and pushed to Salesforce — the ones it
 * genuinely touched. There is no Jan/Feb bar because there was no automation.
 */
export const KIM_JOBS_MONTHLY = [
  { month: 'Mar', count: 111 },
  { month: 'Apr', count: 112 },
  { month: 'May', count: 129 },
  { month: 'Jun', count: 140 },
  { month: 'Jul', count: 133 },
]

/** What it did to those jobs. Creating a job is rare — the work is keeping existing ones correct. */
export const KIM_JOB_WORK = {
  processed: 511,
  linkedToSf: 506,
  created: 18,
  worksitesCreated: 137,
  fieldPatches: 1704,
  selfHealed: 89,
}

/** The placement question, answered with controls (computed 2026-07-25).
 *  Post go-live (Jun 16 – Jul 25): 22 placements in 39 days. Same calendar window 2025: 23
 *  (2024: 11) — flat year-over-year. Vs the 8 weeks before go-live (spring surge incl. the Q2
 *  record push): Poisson rate ratio 0.64, 95% CI 0.39–1.05 — a non-significant slowdown. */
export const PLACEMENT_VERDICT = {
  post: 22,
  postDays: 39,
  pre: 50,
  preDays: 56,
  rr: 0.64,
  lo: 0.39,
  hi: 1.05,
  sameWindow: { y2024: 11, y2025: 23, y2026: 22 },
}

/** Conservative manual-minutes model for the DJC side (disclosed on the page):
 *  screening + dedup cross-check per candidate, data entry per created contact,
 *  and reading a resume to pull grad year / experience. */
/**
 * DJC time saved, per task, measured against what the automation actually did.
 *
 * Replaces a three-rate model applied to loose totals. Rates are for a recruiter doing the job by
 * hand, and each is deliberately at the low end.
 *
 * DELIBERATELY CONSERVATIVE on duplicate checks: the automation ran 2,827 of them, but a person
 * would only check the candidates they had opened (1,257), not every listing. Charging the full
 * 2,827 would inflate the total by about 5 hours a week for work a human would never have done.
 *
 * Counts are all-time, scheduled runs only — backfills and manual test runs are excluded.
 */
export const DJC_TIME_TASKS = [
  { label: 'scan a listing and decide', count: 3431, minutes: 0.25 },
  { label: 'open and read a profile', count: 1257, minutes: 1.5 },
  { label: 'read a resume for contact details', count: 431, minutes: 3 },
  { label: 'search Salesforce for a duplicate', count: 1257, minutes: 1.5, note: 'the automation ran 2,827 — charged only for the profiles a person would have checked' },
  { label: 'create a contact and attach the CV', count: 337, minutes: 6 },
] as const

/** Weeks the automation has been live on its schedule (5 Jun to 28 Jul 2026). */
export const DJC_WEEKS_LIVE = 7.6

/**
 * Hours returned per month, from the same per-task rates applied to that month's actual volumes.
 *
 * YTD rather than all-time because that is how the business reads every other number on the board,
 * and a cumulative-since-launch figure only ever goes up — it cannot show whether the automation is
 * doing more or less work than it was.
 */
export const DJC_HOURS_MONTHLY = [
  { month: '2026-06', hours: 66 },
  { month: '2026-07', hours: 67 },
] as const

/** Proxi's own pre-automation estimate, kept as the reference point. */
export const DJC_BASELINE_HOURS_PER_WEEK = 10

export const DJC_TIME_MODEL = { minPerScreen: 1, minPerCreate: 6, minPerResume: 3 }

export interface ImpactData {
  kim: {
    emails: number
    opened: number
    updated: number
    closed: number
    jobsTracked: number
    jobsInSf: number
    worksitesCreated: number
    sfPatches: number
    autoRetries: number
    hoursSaved: number
    monthly: { month: string; hours: number; emails: number }[]
    patchesMonthly: { month: string; count: number }[]
  }
  djc: {
    observed: number
    dupesPrevented: number
    created: number
    phonesRecovered: number
    resumesMined: number
    runsOk30d: number
    runs30d: number
    autoApps: number
    autoPlaced: number
    weeklyPlacements: { week: string; count: number }[]
  }
}


export interface KimedicsSnapshot {
  jobsTracked: number
  jobsInSf: number
  hoursSaved: number
  emails: number
  failuresThisMonth: number
}

