/** Pure ranking rule for the Briefing (MARKETING_V1_BRIEF.md section 2: "Demo rows must
 * stay flagged and must never outrank live data"). Extracted out of the SQL ORDER BY in
 * lib/marketingQueries.ts's getBriefingCards so the rule is independently unit-testable
 * (tests/marketing-ranking.test.ts) rather than trusted-by-inspection SQL text — the
 * query fetches all candidates unsorted-by-limit and this function does the final sort
 * before the top-5 slice. */

export interface RankableOpportunity {
  isDemoData: boolean
  totalScore: number | null
}

export function compareOpportunityRank(a: RankableOpportunity, b: RankableOpportunity): number {
  if (a.isDemoData !== b.isDemoData) return a.isDemoData ? 1 : -1
  if (a.totalScore == null && b.totalScore == null) return 0
  if (a.totalScore == null) return 1
  if (b.totalScore == null) return -1
  return b.totalScore - a.totalScore
}
