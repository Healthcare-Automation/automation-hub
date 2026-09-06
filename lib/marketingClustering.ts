import type postgres from 'postgres'
import { marketingSql as sql } from './marketingDb'
import { getActivePreferences } from './marketingPreferences'
import { cosineSimilarity } from './marketing/duplicateDetection'
import { embed, hasEmbeddingsProvider } from './marketing/embeddings'
import { computeTrendScore, type TrendScoreItemCounts } from './marketing/scoring'
import { generateAngles } from './marketing/storyGenerator'

/** Real clustering + scoring (MARKETING_V1_BRIEF.md section 2): embed new items, attach
 * to an existing cluster above a cosine-similarity threshold or create a new one, compute
 * real momentum from 24h/7d/30d item counts, evidence strength from source reliability,
 * and cross-source confirmation from distinct source types — then refresh
 * marketing_story_opportunities for the top-scoring clusters. Demo clusters/items
 * (is_demo_data = true) are excluded from every step here so seeded data never mixes
 * into real clusters or crowds out real opportunities. */

// Cosine similarity against the real OpenAI embedding space is meaningfully tighter than
// against the local hash-embedding fallback (256-bucket bag-of-words) — the fallback
// produces higher baseline similarity between any two topically-adjacent texts, so it
// needs a lower bar to ever create more than one cluster. See embeddings.ts.
const REAL_EMBEDDING_THRESHOLD = 0.78
const LOCAL_HASH_THRESHOLD = 0.5
const MAX_LIVE_OPPORTUNITIES = 5
const EMBED_BATCH_LIMIT = 50

export function clusterThreshold(): number {
  return hasEmbeddingsProvider() ? REAL_EMBEDDING_THRESHOLD : LOCAL_HASH_THRESHOLD
}

export interface ClusterCandidate {
  id: string
  embedding: number[]
}

/** Pure attach-vs-create decision: the best-matching existing cluster if its cosine
 * similarity clears the threshold, else null (caller creates a new cluster). Extracted
 * from clusterNewItems so it's unit-testable without a DB — see tests/marketing-clustering.test.ts. */
export function pickBestCluster(
  itemEmbedding: number[],
  clusters: ClusterCandidate[],
  threshold: number,
): { id: string; similarity: number } | null {
  let best: { id: string; similarity: number } | null = null
  for (const cluster of clusters) {
    const similarity = cosineSimilarity(itemEmbedding, cluster.embedding)
    if (similarity >= threshold && (!best || similarity > best.similarity)) {
      best = { id: cluster.id, similarity }
    }
  }
  return best
}

const RELIABILITY_SCORE: Record<string, number> = {
  verified_fact: 100,
  reported_opinion: 70,
  anecdote: 40,
  unverified: 20,
}

export async function embedNewItems(orgId: string, limit = EMBED_BATCH_LIMIT): Promise<number> {
  const items = await sql<{ id: string; title: string; full_excerpt: string | null; supporting_excerpt: string }[]>`
    select id, title, full_excerpt, supporting_excerpt from marketing_source_items
    where org_id = ${orgId} and is_demo_data = false and embedding is null
    order by retrieved_at desc
    limit ${limit}
  `
  let embedded = 0
  for (const item of items) {
    const text = `${item.title}\n${item.full_excerpt ?? item.supporting_excerpt}`
    const vector = await embed(text)
    await sql`update marketing_source_items set embedding = ${sql.json(vector as unknown as postgres.JSONValue)} where id = ${item.id}`
    embedded++
  }
  return embedded
}

interface UnclusteredItem {
  id: string
  title: string
  raw_content: string
  embedding: number[]
  published_at: Date | null
  retrieved_at: Date
}

interface ClusterCentroid {
  id: string
  embedding: number[]
  last_item_at: Date | null
}

async function attachItemToCluster(
  cluster: ClusterCentroid,
  item: UnclusteredItem,
  itemPublishedAt: Date,
): Promise<number[]> {
  await sql`
    insert into marketing_trend_cluster_items (cluster_id, source_item_id)
    values (${cluster.id}, ${item.id})
    on conflict do nothing
  `
  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from marketing_trend_cluster_items where cluster_id = ${cluster.id}
  `
  const oldCount = Math.max(1, count - 1)
  const newCentroid = cluster.embedding.map((v, i) => (v * oldCount + item.embedding[i]) / (oldCount + 1))
  const lastItemAt = cluster.last_item_at && cluster.last_item_at > itemPublishedAt ? cluster.last_item_at : itemPublishedAt

  await sql`
    update marketing_trend_clusters
    set embedding = ${sql.json(newCentroid as unknown as postgres.JSONValue)},
        last_item_at = ${lastItemAt},
        updated_at = now()
    where id = ${cluster.id}
  `
  return newCentroid
}

export async function clusterNewItems(orgId: string): Promise<{ attached: number; created: number }> {
  const unclustered = await sql<UnclusteredItem[]>`
    select i.id, i.title, i.raw_content, i.embedding, i.published_at, i.retrieved_at
    from marketing_source_items i
    where i.org_id = ${orgId} and i.is_demo_data = false and i.embedding is not null
      and not exists (select 1 from marketing_trend_cluster_items ci where ci.source_item_id = i.id)
    order by i.retrieved_at asc
  `
  if (unclustered.length === 0) return { attached: 0, created: 0 }

  const existingClusters = await sql<ClusterCentroid[]>`
    select id, embedding, last_item_at from marketing_trend_clusters
    where org_id = ${orgId} and is_demo_data = false and embedding is not null
  `

  const threshold = clusterThreshold()
  let attached = 0
  let created = 0

  for (const item of unclustered) {
    const itemPublishedAt = item.published_at ?? item.retrieved_at
    const best = pickBestCluster(item.embedding, existingClusters, threshold)
    const bestCluster = best ? existingClusters.find((c) => c.id === best.id)! : null

    if (bestCluster) {
      const newCentroid = await attachItemToCluster(bestCluster, item, itemPublishedAt)
      bestCluster.embedding = newCentroid
      bestCluster.last_item_at = itemPublishedAt
      attached++
    } else {
      const [newCluster] = await sql<{ id: string }[]>`
        insert into marketing_trend_clusters (org_id, title, summary, topic_classification, is_demo_data, embedding, last_item_at)
        values (
          ${orgId}, ${item.title}, ${item.raw_content.slice(0, 500) || item.title}, 'general', false,
          ${sql.json(item.embedding as unknown as postgres.JSONValue)}, ${itemPublishedAt}
        )
        returning id
      `
      await sql`insert into marketing_trend_cluster_items (cluster_id, source_item_id) values (${newCluster.id}, ${item.id})`
      existingClusters.push({ id: newCluster.id, embedding: item.embedding, last_item_at: itemPublishedAt })
      created++
    }
  }

  return { attached, created }
}

interface EvidenceItemRow {
  id: string
  source_type: string
  reliability_classification: string
  dental_relevance: number
  healthcare_relevance: number
  published_at: Date | null
  retrieved_at: Date
}

/** Buckets evidence items into rolling 24h/7d/30d windows ending now, using published_at
 * (falling back to retrieved_at for items a feed never gave a publish date for). Exported
 * for unit testing (tests/marketing-clustering.test.ts) — computeAndPersistClusterScore
 * feeds this straight into computeTrendScore's itemCounts input. */
export function windowCounts(evidence: { published_at: Date | null; retrieved_at: Date }[]): TrendScoreItemCounts {
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  let last24h = 0
  let last7d = 0
  let last30d = 0
  for (const item of evidence) {
    const at = (item.published_at ?? item.retrieved_at).getTime()
    const ageMs = now - at
    if (ageMs <= dayMs) last24h++
    if (ageMs <= 7 * dayMs) last7d++
    if (ageMs <= 30 * dayMs) last30d++
  }
  return { last24h, last7d, last30d }
}

export async function computeAndPersistClusterScore(orgId: string, clusterId: string) {
  const evidence = await sql<EvidenceItemRow[]>`
    select i.id, i.source_type, i.reliability_classification, i.dental_relevance, i.healthcare_relevance,
      i.published_at, i.retrieved_at
    from marketing_trend_cluster_items ci
    join marketing_source_items i on i.id = ci.source_item_id
    where ci.cluster_id = ${clusterId}
  `
  if (evidence.length === 0) return null

  const avgDental = evidence.reduce((sum, i) => sum + i.dental_relevance, 0) / evidence.length
  const avgHealthcare = evidence.reduce((sum, i) => sum + i.healthcare_relevance, 0) / evidence.length
  const dentalHealthcareRelevance = (avgDental + avgHealthcare) / 2

  const mostRecentMs = evidence.reduce((max, i) => Math.max(max, (i.published_at ?? i.retrieved_at).getTime()), 0)
  const daysSinceMostRecentItem = Math.max(0, (Date.now() - mostRecentMs) / (24 * 60 * 60 * 1000))

  const evidenceStrength =
    evidence.reduce((sum, i) => sum + (RELIABILITY_SCORE[i.reliability_classification] ?? 40), 0) / evidence.length
  const distinctSourceCount = new Set(evidence.map((i) => i.source_type)).size

  // Story potential: more corroborating evidence + more distinct source types means more
  // raw, non-fabricated material to draw the three angles from.
  const storyPotential = Math.min(100, evidence.length * 12 + distinctSourceCount * 10)

  const preferences = await getActivePreferences(orgId)
  const learnedInterestFit = preferences.some((p) => p.key === 'avoid_tag:too_generic') ? 40 : 60

  const itemCounts = windowCounts(evidence)

  const score = computeTrendScore({
    dentalHealthcareRelevance,
    daysSinceMostRecentItem,
    itemCounts,
    evidenceStrength,
    distinctSourceCount,
    storyPotential,
    learnedInterestFit,
  })

  await sql`
    insert into marketing_trend_scores (
      org_id, cluster_id, total_score, dental_healthcare_relevance_score, momentum_recency_score,
      evidence_strength_score, cross_source_confirmation_score, story_potential_score,
      learned_interest_fit_score, explanation
    ) values (
      ${orgId}, ${clusterId}, ${score.total}, ${Math.round(score.breakdown.dentalHealthcareRelevance)},
      ${Math.round(score.breakdown.momentumRecency)}, ${Math.round(score.breakdown.evidenceStrength)},
      ${Math.round(score.breakdown.crossSourceConfirmation)}, ${Math.round(score.breakdown.storyPotential)},
      ${Math.round(score.breakdown.learnedInterestFit)}, ${score.explanation}
    )
  `
  return score
}

export async function rescoreAllClusters(orgId: string): Promise<number> {
  const clusters = await sql<{ id: string }[]>`
    select id from marketing_trend_clusters where org_id = ${orgId} and is_demo_data = false
  `
  let count = 0
  for (const cluster of clusters) {
    const score = await computeAndPersistClusterScore(orgId, cluster.id)
    if (score) count++
  }
  return count
}

/** Ensures the top-scoring non-demo clusters have a story_opportunities row (max 5 —
 * "live" on the Briefing; every cluster, live or not, still shows in Trend Radar). Never
 * removes an opportunity that falls out of the top N later — Briefing's own query already
 * orders by score and limits 5, so a demoted cluster's opportunity just stops surfacing
 * there rather than being destroyed. */
export async function refreshOpportunities(orgId: string, maxLive = MAX_LIVE_OPPORTUNITIES): Promise<number> {
  const scored = await sql<{ id: string; title: string; summary: string; total_score: number }[]>`
    select distinct on (c.id) c.id, c.title, c.summary, s.total_score
    from marketing_trend_clusters c
    join marketing_trend_scores s on s.cluster_id = c.id
    where c.org_id = ${orgId} and c.is_demo_data = false
    order by c.id, s.computed_at desc
  `
  const top = scored.sort((a, b) => b.total_score - a.total_score).slice(0, maxLive)
  if (top.length === 0) return 0

  const existingTexts = await sql<{ id: string; title: string; signal_summary: string }[]>`
    select id, title, signal_summary from marketing_story_opportunities where org_id = ${orgId}
  `

  let created = 0
  for (const cluster of top) {
    const [existing] = await sql<{ id: string }[]>`
      select id from marketing_story_opportunities where cluster_id = ${cluster.id} limit 1
    `
    if (existing) continue

    const evidence = await sql<{ supporting_excerpt: string }[]>`
      select i.supporting_excerpt from marketing_trend_cluster_items ci
      join marketing_source_items i on i.id = ci.source_item_id
      where ci.cluster_id = ${cluster.id}
      limit 10
    `

    const generated = await generateAngles({
      orgId,
      clusterTitle: cluster.title,
      clusterSummary: cluster.summary,
      evidenceExcerpts: evidence.map((e) => e.supporting_excerpt),
      existingOpportunityTexts: existingTexts.map((t) => ({ id: t.id, text: `${t.title} ${t.signal_summary}` })),
    })

    const [opportunity] = await sql<{ id: string }[]>`
      insert into marketing_story_opportunities (org_id, cluster_id, title, signal_summary, is_demo_data, generated_by)
      values (${orgId}, ${cluster.id}, ${generated.title}, ${generated.signalSummary}, false, ${generated.generatedBy})
      returning id
    `
    for (const angle of generated.angles) {
      await sql`
        insert into marketing_story_angles (org_id, opportunity_id, angle_type, structure, applied_preference_notes)
        values (
          ${orgId}, ${opportunity.id}, ${angle.angleType},
          ${sql.json(angle.structure as unknown as postgres.JSONValue)}, ${sql.json(angle.appliedPreferenceNotes)}
        )
      `
    }
    existingTexts.push({ id: opportunity.id, title: generated.title, signal_summary: generated.signalSummary })
    created++
  }
  return created
}
