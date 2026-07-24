/**
 * "What leads to a hire" — offline statistical analysis over the joined candidate + pipeline
 * data (scripted in proxi_djc_automation; odds ratios with 95% CIs via Haldane-corrected 2×2
 * tables, Fisher exact p-values). Static by design: these estimates move on month timescales
 * and every figure ships with its sample size. Recompute by re-running the analysis script.
 *
 * Computed 2026-07-24 · universe: 1,949 DJC candidates linked to Salesforce,
 * 361 with ≥1 application, 72 placed.
 */

export interface OddsFactor {
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
  computedOn: '2026-07-24',
  universe: 1949,
  applied: 361,
  placed: 72,
}

/** Stage 1: which candidates get recruiter attention (≥1 application). n=1,949, 361 events. */
export const APPLIED_FACTORS: OddsFactor[] = [
  { factor: 'General Dentistry', or: 3.31, lo: 2.47, hi: 4.43, p: 0.0001, rateExposed: 24, rateUnexposed: 9, nExposed: 1247, nUnexposed: 702 },
  { factor: '10+ yrs experience', or: 2.04, lo: 1.38, hi: 3.01, p: 0.0002, rateExposed: 14, rateUnexposed: 8, nExposed: 607, nUnexposed: 537 },
  { factor: 'US-trained', or: 1.3, lo: 0.79, hi: 2.14, p: 0.34, rateExposed: 12, rateUnexposed: 9, nExposed: 911, nUnexposed: 219 },
  { factor: 'Residency-trained', or: 0.96, lo: 0.68, hi: 1.35, p: 0.859, rateExposed: 11, rateUnexposed: 11, nExposed: 606, nUnexposed: 718 },
  { factor: 'Speaks Spanish', or: 0.78, lo: 0.48, hi: 1.26, p: 0.302, rateExposed: 9, rateUnexposed: 11, nExposed: 238, nUnexposed: 1086 },
  { factor: 'Phone on file', or: 0.72, lo: 0.56, hi: 0.92, p: 0.008, rateExposed: 15, rateUnexposed: 20, nExposed: 719, nUnexposed: 1230 },
  { factor: 'Hygienist / Assistant', or: 0.14, lo: 0.07, hi: 0.27, p: 0.0001, rateExposed: 3, rateUnexposed: 21, nExposed: 266, nUnexposed: 1683 },
]

/** Stage 2: who converts to a placement, GIVEN recruiter attention. n=361, 72 events. */
export const PLACED_FACTORS: OddsFactor[] = [
  { factor: 'General Dentistry', or: 3.76, lo: 1.39, hi: 10.2, p: 0.003, rateExposed: 23, rateUnexposed: 7, nExposed: 300, nUnexposed: 61 },
  { factor: 'US-trained', or: 1.24, lo: 0.3, hi: 5.16, p: 1.0, rateExposed: 14, rateUnexposed: 10, nExposed: 107, nUnexposed: 20 },
  { factor: 'Phone on file', or: 1.17, lo: 0.68, hi: 2.02, p: 0.669, rateExposed: 22, rateUnexposed: 19, nExposed: 111, nUnexposed: 250 },
  { factor: 'Residency-trained', or: 0.81, lo: 0.32, hi: 2.08, p: 0.809, rateExposed: 12, rateUnexposed: 15, nExposed: 64, nUnexposed: 79 },
  { factor: '10+ yrs experience', or: 0.81, lo: 0.29, hi: 2.29, p: 0.783, rateExposed: 12, rateUnexposed: 15, nExposed: 88, nUnexposed: 41 },
  { factor: 'Speaks Spanish', or: 0.72, lo: 0.18, hi: 2.96, p: 0.738, rateExposed: 10, rateUnexposed: 15, nExposed: 21, nUnexposed: 122 },
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
export const STAGE_PLACEMENT_RATES: Record<string, { rate: number; n: number; placed: number }> = {
  Application: { rate: 0.19, n: 3062, placed: 612 },
  'Internal Review': { rate: 0.19, n: 3062, placed: 612 },
  'Name Clear': { rate: 0.19, n: 3062, placed: 612 },
  Submittal: { rate: 0.31, n: 1895, placed: 605 },
  Interview: { rate: 0.46, n: 422, placed: 194 },
  Offer: { rate: 0.87, n: 377, placed: 331 },
}

/** Calibrated specialty tilt: GD converts at 3.76× odds (✓ p=0.003); applications are ~83% GD,
 *  so the tilt is OR^(x − 0.83) on the odds scale — keeps the blended rate calibrated. */
export const GD_TILT = { or: 3.76, share: 0.83 }

export function placementProbability(stage: string | null, isGeneralDentistry: boolean | null): {
  p: number
  base: number
  baseN: number
  tilt: 'up' | 'down' | 'none'
} | null {
  const base = STAGE_PLACEMENT_RATES[stage ?? '']
  if (!base) return null
  if (isGeneralDentistry === null) return { p: base.rate, base: base.rate, baseN: base.n, tilt: 'none' }
  const exp = (isGeneralDentistry ? 1 : 0) - GD_TILT.share
  const odds = (base.rate / (1 - base.rate)) * Math.pow(GD_TILT.or, exp)
  return {
    p: odds / (1 + odds),
    base: base.rate,
    baseN: base.n,
    tilt: isGeneralDentistry ? 'up' : 'down',
  }
}

/** Specialty attention vs conversion (candidates with SF links, n≥40 per specialty). */
export const SPECIALTY_OUTCOMES = [
  { specialty: 'General Dentistry', n: 1247, workedPct: 24, placedOfWorkedPct: 22 },
  { specialty: 'Oral & Maxillofacial', n: 43, workedPct: 20, placedOfWorkedPct: 22 },
  { specialty: 'Pediatrics', n: 213, workedPct: 10, placedOfWorkedPct: 4 },
  { specialty: 'Orthodontics', n: 103, workedPct: 8, placedOfWorkedPct: 11 },
  { specialty: 'Dental Assistant', n: 174, workedPct: 4, placedOfWorkedPct: 0 },
  { specialty: 'Dental Hygienist', n: 92, workedPct: 1, placedOfWorkedPct: 0 },
]

/** The database flywheel: signups typically convert YEARS later. n=58 placed with known signup. */
export const SIGNUP_TO_PLACEMENT = { n: 58, medianDays: 1245, within90d: 8, within1y: 19 }
