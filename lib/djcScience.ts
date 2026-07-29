/**
 * "What leads to a hire" — offline statistical analysis over the joined candidate + pipeline
 * data (scripted in proxi_djc_automation; odds ratios with 95% CIs via Haldane-corrected 2×2
 * tables, Fisher exact p-values). Static by design: these estimates move on month timescales
 * and every figure ships with its sample size. Recompute by re-running the analysis script.
 *
 * Computed 2026-07-24 · universe: 2084,949 DJC candidates linked to Salesforce,
 * 361 with ≥1 application, 72 placed.
 */

export interface OddsFactor {
  /** Share of candidates for whom this trait is known — the analysis is complete-case per trait. */
  coverage?: number
  /** Short line rendered under the row when the raw association needs qualifying. */
  caveat?: string
  /** Longer explanation, surfaced on hover. */
  caveatDetail?: string
  factor: string
  or: number
  lo: number
  hi: number
  p: number
  rateExposed: number // % with outcome among candidates WITH the trait
  rateUnexposed: number
  nExposed: number
  nUnexposed: number
}

export const SCIENCE_META = {
  computedOn: '2026-07-27',
  universe: 2084,
  applied: 381,
  placed: 78,
}

/** Stage 1: which candidates get worked by a recruiter. n=2,084, 381 worked. */
export const APPLIED_FACTORS: OddsFactor[] = [
  { factor: 'General Dentistry', or: 3.27, lo: 2.46, hi: 4.35, p: 0.0, rateExposed: 24, rateUnexposed: 9, nExposed: 1342, nUnexposed: 741, coverage: 100 },
  { factor: 'Open to locums', or: 2.32, lo: 1.69, hi: 3.2, p: 0.0, rateExposed: 32, rateUnexposed: 17, nExposed: 200, nUnexposed: 1882, coverage: 100,
    caveat: "Proxi's demand is locum work — this is the market fitting the candidate, not a trait of the person." },
  { factor: '10+ yrs experience', or: 2.13, lo: 1.44, hi: 3.14, p: 0.0001, rateExposed: 15, rateUnexposed: 8, nExposed: 611, nUnexposed: 540, coverage: 55,
    caveatDetail: "Known for 55% of candidates. Restricted to those, seniority is a clear positive — an earlier run that treated 'unknown' as 'not experienced' produced the opposite sign." },
  { factor: 'On DJC 2+ years', or: 1.65, lo: 1.3, hi: 2.09, p: 0.0, rateExposed: 23, rateUnexposed: 15, nExposed: 1030, nUnexposed: 864, coverage: 91,
    caveatDetail: 'Long-registered candidates have had more chances to be worked, so some of this is simply exposure time rather than a quality signal.' },
  { factor: 'US-trained', or: 1.34, lo: 0.81, hi: 2.21, p: 0.2551, rateExposed: 12, rateUnexposed: 9, nExposed: 911, nUnexposed: 219, coverage: 54,
    caveatDetail: 'Origin is parsed from résumés and known for about half the pool; the confidence interval crosses 1, so there is no detectable effect either way.' },
  { factor: 'Licensed in 2+ states', or: 1.18, lo: 0.84, hi: 1.67, p: 0.3437, rateExposed: 21, rateUnexposed: 19, nExposed: 217, nUnexposed: 1743, coverage: 94 },
  { factor: 'Résumé on file', or: 0.98, lo: 0.55, hi: 1.74, p: 0.9492, rateExposed: 20, rateUnexposed: 20, nExposed: 872, nUnexposed: 79, coverage: 46 },
  { factor: 'Wants private practice', or: 0.56, lo: 0.4, hi: 0.79, p: 0.0008, rateExposed: 19, rateUnexposed: 30, nExposed: 1590, nUnexposed: 192, coverage: 86,
    caveat: 'Reads negative because permanent private-practice seekers want the kind of role Proxi places least of.' },
  { factor: 'Hygienist / Assistant', or: 0.13, lo: 0.06, hi: 0.25, p: 0.0, rateExposed: 3, rateUnexposed: 21, nExposed: 282, nUnexposed: 1801, coverage: 100 },
]

/** Stage 2: who places, given recruiter attention. n=381, 78 placed. */
export const PLACED_FACTORS: OddsFactor[] = [
  { factor: 'General Dentistry', or: 4.57, lo: 1.61, hi: 12.99, p: 0.0044, rateExposed: 23, rateUnexposed: 6, nExposed: 317, nUnexposed: 64, coverage: 100 },
  { factor: 'Open to locums', or: 2.67, lo: 1.48, hi: 4.81, p: 0.001, rateExposed: 36, rateUnexposed: 17, nExposed: 64, nUnexposed: 317, coverage: 100,
    caveat: "Proxi's demand is locum work — this is the market fitting the candidate, not a trait of the person." },
  { factor: 'On DJC 2+ years', or: 2.06, lo: 1.16, hi: 3.68, p: 0.0141, rateExposed: 25, rateUnexposed: 14, nExposed: 236, nUnexposed: 132, coverage: 97,
    caveatDetail: 'Long-registered candidates have had more chances to be worked, so some of this is simply exposure time rather than a quality signal.' },
  { factor: 'Licensed in 2+ states', or: 1.56, lo: 0.78, hi: 3.14, p: 0.2088, rateExposed: 28, rateUnexposed: 20, nExposed: 46, nUnexposed: 323, coverage: 97 },
  { factor: 'US-trained', or: 1.45, lo: 0.31, hi: 6.9, p: 0.6395, rateExposed: 14, rateUnexposed: 10, nExposed: 108, nUnexposed: 20, coverage: 34,
    caveatDetail: 'Origin is parsed from résumés and known for about half the pool; the confidence interval crosses 1, so there is no detectable effect either way.' },
  { factor: '10+ yrs experience', or: 0.89, lo: 0.31, hi: 2.55, p: 0.8227, rateExposed: 13, rateUnexposed: 15, nExposed: 91, nUnexposed: 41, coverage: 35,
    caveatDetail: "Known for 55% of candidates. Restricted to those, seniority is a clear positive — an earlier run that treated 'unknown' as 'not experienced' produced the opposite sign." },
  { factor: 'Résumé on file', or: 0.77, lo: 0.25, hi: 2.33, p: 0.6403, rateExposed: 26, rateUnexposed: 31, nExposed: 174, nUnexposed: 16, coverage: 50 },
  { factor: 'Wants private practice', or: 0.3, lo: 0.16, hi: 0.56, p: 0.0001, rateExposed: 17, rateUnexposed: 40, nExposed: 306, nUnexposed: 57, coverage: 95,
    caveat: 'Reads negative because permanent private-practice seekers want the kind of role Proxi places least of.' },
]

/** Median days between stage dates across all mirrored applications. */
export const STAGE_VELOCITY = {
  submittalToInterview: 3.5,
  interviewToOffer: 1,
  offerToPlaced: 0,
  applicationToPlaced: { median: 2, p25: 0, p75: 7 },
}

/** Days from application to placement (among placed applications). */
export const TIME_TO_PLACE = [
  { bucket: '≤30d', count: 554 },
  { bucket: '31–60d', count: 27 },
  { bucket: '61–90d', count: 9 },
  { bucket: '91–120d', count: 4 },
  { bucket: '121–180d', count: 4 },
  { bucket: '180d+', count: 3 },
]

/** Historical P(placed) for applications that reached each stage — the base rates behind the
 *  in-flight probability scores. Monotonic and computed from the full mirror (2026-07-24). */
/**
 * Probability an in-flight application ends in a placement, fitted rather than assumed.
 *
 * Method: logistic regression on 2,736 RESOLVED applications (623 placed, 22.8%). Resolved means
 * placed, or created more than 180 days ago — 90% of placements land within 21 days of the
 * application, so an older unplaced application is dead rather than pending. Including still-open
 * applications as failures would have biased every rate downward.
 *
 * The `stage` column could NOT be used: "Placed" and "Extended" are themselves stages, so stage
 * predicts placement perfectly and circularly. The features are which milestone DATES are filled
 * in, which is what is actually known about an application in flight.
 *
 * Cross-validated AUC 0.928 (95% CI 0.915-0.938), Brier 0.085. A gradient-boosted model ranked
 * slightly better (0.949) but claimed 23% where the truth was 6%; these numbers are shown as
 * percentages to recruiters, so calibration was the deciding criterion.
 *
 * Calibration, out-of-fold: says 9.7% -> 9.5% happened; says 26.5% -> 25.8%; says 75.9% -> 77.3%.
 */
export const PLACEMENT_MODEL = {
  auc: 0.928,
  ciLow: 0.915,
  ciHigh: 0.938,
  n: 2736,
  placed: 623,
  baseRate: 22.8,
  brier: 0.085,
  calibration: [
    { pred: 0.4, actual: 0.5, n: 549 },
    { pred: 1.5, actual: 0.7, n: 546 },
    { pred: 9.7, actual: 9.5, n: 547 },
    { pred: 26.5, actual: 25.8, n: 547 },
    { pred: 75.9, actual: 77.3, n: 547 },
  ],
} as const

/**
 * Fitted rates by furthest milestone reached. `n` is the resolved applications behind each figure.
 *
 * These replace hand-set values that were materially wrong at two stages: Interview was showing
 * 46% against a fitted 14%, and the pre-submittal stages showed 19% against a fitted 1%.
 */
export const STAGE_PLACEMENT_RATES: Record<string, { rate: number; n: number; placed: number; gd: number; other: number }> = {
  Application: { rate: 0.01, n: 966, placed: 7, gd: 0.01, other: 0.01 },
  'Internal Review': { rate: 0.01, n: 966, placed: 7, gd: 0.01, other: 0.01 },
  'Name Clear': { rate: 0.01, n: 966, placed: 7, gd: 0.01, other: 0.01 },
  Submittal: { rate: 0.21, n: 1193, placed: 254, gd: 0.26, other: 0.18 },
  Interview: { rate: 0.14, n: 190, placed: 22, gd: 0.17, other: 0.12 },
  Offer: { rate: 0.88, n: 387, placed: 340, gd: 0.91, other: 0.86 },
  'Extension Request': { rate: 0.88, n: 387, placed: 340, gd: 0.91, other: 0.86 },
}

/**
 * Placement probability for one in-flight application.
 *
 * The General Dentistry split is now read straight off the fitted model per stage rather than
 * applied as a single global odds ratio — the gap between GD and the rest is not constant across
 * stages (5 points at submittal, 5 at offer, 5 at interview on a much smaller base).
 */
export function placementProbability(stage: string | null, isGeneralDentistry: boolean | null): {
  p: number
  base: number
  baseN: number
  tilt: 'up' | 'down' | 'none'
} | null {
  const base = STAGE_PLACEMENT_RATES[stage ?? '']
  if (!base) return null
  if (isGeneralDentistry === null) return { p: base.rate, base: base.rate, baseN: base.n, tilt: 'none' }
  return {
    p: isGeneralDentistry ? base.gd : base.other,
    base: base.rate,
    baseN: base.n,
    tilt: isGeneralDentistry ? 'up' : 'down',
  }
}

/**
 * Specialty outcomes on ONE denominator: everyone we sourced.
 *
 * Previously this held `workedPct` (share of all) alongside `placedOfWorkedPct` (share of the
 * worked subset). Two denominators on one axis meant the second number could read higher than the
 * first, which looks impossible unless you read the caption. Placed is a strict subset of worked,
 * which is a strict subset of sourced — measuring all three against `n` makes the bars nest and
 * the comparison honest. Counts are kept so the UI can show real people, not just percentages.
 */
export const SPECIALTY_OUTCOMES = [
  { specialty: "General Dentistry", n: 1317, worked: 299, placed: 69 },
  { specialty: "Pediatrics", n: 212, worked: 21, placed: 1 },
  { specialty: "Dental Assistant", n: 180, worked: 8, placed: 0 },
  { specialty: "Orthodontics", n: 110, worked: 10, placed: 1 },
  { specialty: "Dental Hygienist", n: 103, worked: 1, placed: 0 },
  { specialty: "Endodontist", n: 46, worked: 9, placed: 0 },
  { specialty: "Oral & Maxillofacial", n: 43, worked: 10, placed: 2 },
  { specialty: "Prosthodontics", n: 20, worked: 4, placed: 0 },
]

/** The database flywheel: signups typically convert YEARS later. n=58 placed with known signup. */
export const SIGNUP_TO_PLACEMENT = { n: 58, medianDays: 1245, within90d: 8, within1y: 19 }

/**
 * Validation of the fitted candidate score (see RATING_POINTS in lib/djcInsights.ts).
 *
 * Method: 2,103 DJC candidates who reached Salesforce, outcome = "a recruiter ever worked them"
 * (383, 18.2%). Features restricted to candidate-intrinsic profile fields; anything that merely
 * encoded our own scraping process was excluded after a leakage audit (phone, email, mailing
 * address, resume size and job-match count all correlate -0.57 to -0.99 with duplicate status).
 * Five-fold stratified cross-validation; the quoted AUC is out-of-fold, never in-sample.
 */
export const RATING_MODEL = {
  auc: 0.76,
  ciLow: 0.73,
  ciHigh: 0.78,
  n: 2103,
  positives: 383,
  baseRate: 18.2,
  prAuc: 0.38,
  brier: 0.130,
  /** Out-of-fold band -> the share actually worked. Monotone, which is the point. */
  bands: [
    { band: '0-19', n: 43, rate: 4.7, lift: 0.26 },
    { band: '20-39', n: 333, rate: 4.2, lift: 0.23 },
    { band: '40-59', n: 666, rate: 7.4, lift: 0.40 },
    { band: '60-79', n: 566, rate: 19.8, lift: 1.09 },
    { band: '80-100', n: 495, rate: 41.6, lift: 2.29 },
  ],
  /** Predicted vs observed, by quintile of predicted probability. */
  calibration: [
    { pred: 4.0, actual: 4.5, n: 422 },
    { pred: 8.5, actual: 6.9, n: 423 },
    { pred: 14.2, actual: 12.5, n: 417 },
    { pred: 25.5, actual: 25.7, n: 420 },
    { pred: 41.9, actual: 41.6, n: 421 },
  ],
  /** Fitted integer points, strongest first. */
  weights: [
    { label: 'Specialty: General Dentistry, OMS, Endo or Prostho', pts: 13 },
    { label: 'Resume uploaded to DJC', pts: 12 },
    { label: 'Experience not stated on the profile', pts: 8 },
    { label: 'Graduated 15+ years ago', pts: 6 },
    { label: 'Registered on DJC over a year ago', pts: 6 },
    { label: 'Open to locums work', pts: 5 },
    { label: '10+ years of experience', pts: 4 },
    { label: 'Licensed in 2 or more states', pts: 1 },
    { label: 'Active on DJC in the last 30 days', pts: -3 },
    { label: 'Trained outside the US', pts: -5 },
    { label: 'Dental school listed on the profile', pts: -11 },
    { label: 'Specialty: Dental Assistant or Hygienist', pts: -20 },
  ],
  /** What the model cannot do — stated because the alternative is implying it can. */
  limits: {
    forwardWorked: 54,
    forwardPlaced: 6,
    scrapeStart: '2026-06-05',
    priorApplications: 1258,
    afterApplications: 89,
  },
} as const
