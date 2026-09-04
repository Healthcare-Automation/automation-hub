/** Ported unchanged (pure logic, no DB) from marketing_content/lib/scoring.ts —
 * the exact weighted formula from BUILD_BRIEF.md: dental/healthcare relevance 30%,
 * momentum/recency 20%, evidence strength 20%, cross-source confirmation 15%,
 * story potential 10%, fit with learned interests 5%. */

export interface TrendScoreInput {
  dentalHealthcareRelevance: number
  daysSinceMostRecentItem: number
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

function momentumScore(daysSinceMostRecentItem: number): number {
  // Linear decay: same-day news scores 100, decays to 0 by day 30.
  return Math.max(0, 100 - (daysSinceMostRecentItem / 30) * 100)
}

function crossSourceScore(distinctSourceCount: number): number {
  const table = [0, 20, 50, 75, 100]
  return table[Math.min(distinctSourceCount, 4)]
}

export function computeTrendScore(input: TrendScoreInput): TrendScoreResult {
  const breakdown: TrendScoreBreakdown = {
    dentalHealthcareRelevance: input.dentalHealthcareRelevance,
    momentumRecency: momentumScore(input.daysSinceMostRecentItem),
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

  const explanation =
    `Scored ${total}/100: dental/healthcare relevance ${Math.round(breakdown.dentalHealthcareRelevance)}/100 (30% weight), ` +
    `momentum/recency ${Math.round(breakdown.momentumRecency)}/100 (20%), evidence strength ${Math.round(breakdown.evidenceStrength)}/100 (20%), ` +
    `cross-source confirmation ${Math.round(breakdown.crossSourceConfirmation)}/100 (15%), story potential ${Math.round(breakdown.storyPotential)}/100 (10%), ` +
    `fit with learned interests ${Math.round(breakdown.learnedInterestFit)}/100 (5%).`

  return { total, breakdown, explanation }
}
