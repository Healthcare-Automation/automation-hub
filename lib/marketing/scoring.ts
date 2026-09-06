/** Pure logic, no DB — the exact weighted formula from BUILD_BRIEF.md: dental/healthcare
 * relevance 30%, momentum/recency 20%, evidence strength 20%, cross-source confirmation 15%,
 * story potential 10%, fit with learned interests 5%. Originally ported unchanged from
 * marketing_content/lib/scoring.ts; momentumScore was extended (MARKETING_V1_BRIEF.md
 * section 2) to blend real 24h/7d/30d item-count velocity in on top of pure recency decay,
 * via the optional `itemCounts` input — omitting it keeps the original recency-only formula
 * (scripts/seed-marketing.ts's demo/manual callers don't have real window counts to give). */

export interface TrendScoreItemCounts {
  last24h: number
  last7d: number
  last30d: number
}

export interface TrendScoreInput {
  dentalHealthcareRelevance: number
  daysSinceMostRecentItem: number
  /** Real momentum signal: item counts in rolling windows ending now, from
   * lib/marketingClustering.ts. Optional — see file header. */
  itemCounts?: TrendScoreItemCounts
  evidenceStrength: number
  distinctSourceCount: number
  storyPotential: number
  learnedInterestFit: number
}

export interface TrendScoreBreakdown {
  dentalHealthcareRelevance: number
  momentumRecency: number
  evidenceStrength: number
  crossSourceConfirmation: number
  storyPotential: number
  learnedInterestFit: number
}

export interface TrendScoreResult {
  total: number
  breakdown: TrendScoreBreakdown
  explanation: string
}

const WEIGHTS = {
  dentalHealthcareRelevance: 0.3,
  momentumRecency: 0.2,
  evidenceStrength: 0.2,
  crossSourceConfirmation: 0.15,
  storyPotential: 0.1,
  learnedInterestFit: 0.05,
}

function recencyDecay(daysSinceMostRecentItem: number): number {
  // Linear decay: same-day news scores 100, decays to 0 by day 30.
  return Math.max(0, 100 - (daysSinceMostRecentItem / 30) * 100)
}

/** Velocity: are items arriving faster than the cluster's own 30-day baseline rate?
 * A ratio > 1 for the short window means the topic is accelerating (a real trend), not
 * just recent (a single article isn't a trend). Blended 50/50 with pure recency so a
 * single very-fresh item still scores reasonably without a rich history. */
function momentumScore(daysSinceMostRecentItem: number, itemCounts?: TrendScoreItemCounts): number {
  const recency = recencyDecay(daysSinceMostRecentItem)
  if (!itemCounts) return recency

  const baselineDailyRate = Math.max(itemCounts.last30d / 30, 0.01)
  const rate24h = itemCounts.last24h / baselineDailyRate
  const rate7d = itemCounts.last7d / 7 / baselineDailyRate
  const velocity = Math.max(0, Math.min(100, ((rate24h + rate7d) / 2) * 50))

  return Math.round(recency * 0.5 + velocity * 0.5)
}

function crossSourceScore(distinctSourceCount: number): number {
  const table = [0, 20, 50, 75, 100]
  return table[Math.min(distinctSourceCount, 4)]
}

export function computeTrendScore(input: TrendScoreInput): TrendScoreResult {
  const breakdown: TrendScoreBreakdown = {
    dentalHealthcareRelevance: input.dentalHealthcareRelevance,
    momentumRecency: momentumScore(input.daysSinceMostRecentItem, input.itemCounts),
    evidenceStrength: input.evidenceStrength,
    crossSourceConfirmation: crossSourceScore(input.distinctSourceCount),
    storyPotential: input.storyPotential,
    learnedInterestFit: input.learnedInterestFit,
  }

  const total = Math.round(
    breakdown.dentalHealthcareRelevance * WEIGHTS.dentalHealthcareRelevance +
      breakdown.momentumRecency * WEIGHTS.momentumRecency +
      breakdown.evidenceStrength * WEIGHTS.evidenceStrength +
      breakdown.crossSourceConfirmation * WEIGHTS.crossSourceConfirmation +
      breakdown.storyPotential * WEIGHTS.storyPotential +
      breakdown.learnedInterestFit * WEIGHTS.learnedInterestFit,
  )

  const momentumDetail = input.itemCounts
    ? ` (${input.itemCounts.last24h} items/24h, ${input.itemCounts.last7d}/7d, ${input.itemCounts.last30d}/30d)`
    : ''

  const explanation =
    `Scored ${total}/100: dental/healthcare relevance ${Math.round(breakdown.dentalHealthcareRelevance)}/100 (30% weight), ` +
    `momentum/recency ${Math.round(breakdown.momentumRecency)}/100 (20%)${momentumDetail}, evidence strength ${Math.round(breakdown.evidenceStrength)}/100 (20%), ` +
    `cross-source confirmation ${Math.round(breakdown.crossSourceConfirmation)}/100 (15%), story potential ${Math.round(breakdown.storyPotential)}/100 (10%), ` +
    `fit with learned interests ${Math.round(breakdown.learnedInterestFit)}/100 (5%).`

  return { total, breakdown, explanation }
}
