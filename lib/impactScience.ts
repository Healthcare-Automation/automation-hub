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
export const KIM_JOBS_MONTHLY = [
  { month: 'Jan', count: 43 },
  { month: 'Feb', count: 42 },
  { month: 'Mar', count: 54 },
  { month: 'Apr', count: 83 },
  { month: 'May', count: 63 },
  { month: 'Jun', count: 55 },
  { month: 'Jul', count: 39 },
]

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

