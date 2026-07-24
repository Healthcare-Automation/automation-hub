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
