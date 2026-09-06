import { marketingSql as sql } from './marketingDb'
import { clusterNewItems, embedNewItems, refreshOpportunities, rescoreAllClusters } from './marketingClustering'
import { markRunFailed, runIngestion, type FeedRunResult, type RunIngestionOptions } from './marketingResearch'

/** Orchestrates the full research pipeline (ingest → embed → cluster → score →
 * opportunities) as one call, shared by the cron route and the admin "Run research now"
 * button — the only difference between the two is `triggeredBy`. */

export interface PipelineResult {
  runId: string
  itemsIngested: number
  itemsEnriched: number
  feedsProcessed: number
  feedsSkippedForBudget: number
  feedResults: FeedRunResult[]
  itemsEmbedded: number
  clustersAttached: number
  clustersCreated: number
  clustersRescored: number
  opportunitiesCreated: number
}

export async function runFullPipeline(options: RunIngestionOptions): Promise<PipelineResult> {
  const ingestion = await runIngestion(options)

  try {
    const itemsEmbedded = await embedNewItems(options.orgId)
    const clustering = await clusterNewItems(options.orgId)
    const clustersRescored = await rescoreAllClusters(options.orgId)
    const opportunitiesCreated = await refreshOpportunities(options.orgId)

    // runIngestion already set completed_at once ingestion+enrichment finished — overwrite
    // it here so it reflects when the run record actually finished filling in (clustering/
    // scoring/opportunities can meaningfully outlast ingestion), not a premature timestamp.
    await sql`
      update marketing_research_runs
      set stage = 'done', completed_at = now(),
          clusters_updated = ${clustering.attached + clustering.created},
          opportunities_created = ${opportunitiesCreated}
      where id = ${ingestion.runId}
    `

    return {
      runId: ingestion.runId,
      itemsIngested: ingestion.itemsIngested,
      itemsEnriched: ingestion.itemsEnriched,
      feedsProcessed: ingestion.feedsProcessed,
      feedsSkippedForBudget: ingestion.feedsSkippedForBudget,
      feedResults: ingestion.feedResults,
      itemsEmbedded,
      clustersAttached: clustering.attached,
      clustersCreated: clustering.created,
      clustersRescored,
      opportunitiesCreated,
    }
  } catch (err) {
    // Ingestion itself already succeeded (and is recorded as such) — a clustering/scoring
    // failure downstream is a separate, real failure worth surfacing distinctly rather
    // than masking as a clean run.
    const reason = err instanceof Error ? err.message : String(err)
    await markRunFailed(ingestion.runId, `post-ingestion pipeline stage failed: ${reason}`)
    throw err
  }
}
