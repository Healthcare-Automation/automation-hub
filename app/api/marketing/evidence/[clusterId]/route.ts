import { NextResponse } from 'next/server'
import {
  getClusterEvidenceDetail,
  getStoryAngles,
  getStoryOpportunityByClusterId,
} from '@/lib/marketingQueries'

/** Backs the evidence side panel shared by Briefing (opportunity card click) and Trend
 * Radar (row click) — score breakdown, the raw evidence list with source links/excerpts/
 * reliability tags, and the three angles if this cluster has a story opportunity yet. */
export async function GET(_request: Request, { params }: { params: Promise<{ clusterId: string }> }) {
  const { clusterId } = await params
  const detail = await getClusterEvidenceDetail(clusterId)
  if (!detail) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const opportunity = await getStoryOpportunityByClusterId(clusterId)
  const angles = opportunity ? await getStoryAngles(opportunity.id) : []

  return NextResponse.json({
    cluster: detail.cluster,
    score: detail.score,
    evidence: detail.evidence,
    opportunity,
    angles,
  })
}
