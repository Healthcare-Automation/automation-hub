import { marketingSql as sql } from './marketingDb'
import { manualUrlAdapter } from './marketing/adapters/manualUrl'
import { FEED_REGISTRY } from './marketing/adapters/feedRegistry'
import { generateContent } from './marketing/contentGenerator'
import { compareOpportunityRank } from './marketing/ranking'
import type {
  AngleType, ContentFormat, GeneratedAngle, ReliabilityClassification,
  SourceType, StoryAngleStructure,
} from './marketing/types'

/** Raw postgres.js query functions for the Marketing tab (Practice Story Engine port).
 * Follows lib/outreachQueries.ts's convention: one function per page/action, hand-written
 * SQL, no ORM. See PORT_BRIEF.md for why (hub has no Drizzle). */

// ---------- Briefing ----------

export interface SourceTypeCount {
  sourceType: SourceType
  count: number
}

export interface BriefingCard {
  id: string
  title: string
  signalSummary: string
  isDemoData: boolean
  status: string
  clusterId: string | null
  generatedBy: 'template' | 'llm'
  totalScore: number | null
  explanation: string | null
  confidenceLabel: 'High' | 'Medium' | 'Low' | null
  freshnessLabel: string
  audience: string | null
  sourceTypeCounts: SourceTypeCount[]
  /** 7 daily item counts, oldest (6 days ago) to newest (today). */
  sparkline: number[]
}

export function freshnessLabelFromMs(ms: number): string {
  const days = (Date.now() - ms) / (24 * 60 * 60 * 1000)
  if (days < 1) return 'New today'
  if (days < 2) return 'Yesterday'
  if (days < 7) return `${Math.floor(days)}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

async function evidenceSummaryForCluster(clusterId: string): Promise<{
  sourceTypeCounts: SourceTypeCount[]
  sparkline: number[]
  freshnessLabel: string
}> {
  const evidence = await sql<{ source_type: SourceType; published_at: Date | null; retrieved_at: Date }[]>`
    select i.source_type, i.published_at, i.retrieved_at
    from marketing_trend_cluster_items ci
    join marketing_source_items i on i.id = ci.source_item_id
    where ci.cluster_id = ${clusterId}
  `
  const counts = new Map<SourceType, number>()
  const dayBuckets = new Array(7).fill(0)
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  let mostRecentMs = 0
  for (const item of evidence) {
    counts.set(item.source_type, (counts.get(item.source_type) ?? 0) + 1)
    const at = (item.published_at ?? item.retrieved_at).getTime()
    mostRecentMs = Math.max(mostRecentMs, at)
    const dayIndex = 6 - Math.floor((now - at) / dayMs)
    if (dayIndex >= 0 && dayIndex < 7) dayBuckets[dayIndex]++
  }
  return {
    sourceTypeCounts: Array.from(counts.entries()).map(([sourceType, count]) => ({ sourceType, count })),
    sparkline: dayBuckets,
    freshnessLabel: mostRecentMs ? freshnessLabelFromMs(mostRecentMs) : 'Unknown',
  }
}

/** Up to 5 opportunities, ranked by trend score — live (non-demo) data always outranks
 * demo data regardless of score (order by is_demo_data asc first), so seeded rows can
 * never crowd out real signals once any exist. `hideDemo` drops demo rows entirely. */
export async function getBriefingCards(orgId: string, options: { hideDemo?: boolean } = {}): Promise<BriefingCard[]> {
  const rows = options.hideDemo
    ? await sql<
        {
          id: string; title: string; signal_summary: string; is_demo_data: boolean; status: string
          cluster_id: string | null; generated_by: 'template' | 'llm'
          total_score: number | null; explanation: string | null; evidence_strength_score: number | null
        }[]
      >`
        select o.id, o.title, o.signal_summary, o.is_demo_data, o.status, o.cluster_id, o.generated_by,
          s.total_score, s.explanation, s.evidence_strength_score
        from marketing_story_opportunities o
        left join lateral (
          select total_score, explanation, evidence_strength_score from marketing_trend_scores
          where cluster_id = o.cluster_id order by computed_at desc limit 1
        ) s on true
        where o.org_id = ${orgId} and o.is_demo_data = false and o.status <> 'archived'
      `
    : await sql<
        {
          id: string; title: string; signal_summary: string; is_demo_data: boolean; status: string
          cluster_id: string | null; generated_by: 'template' | 'llm'
          total_score: number | null; explanation: string | null; evidence_strength_score: number | null
        }[]
      >`
        select o.id, o.title, o.signal_summary, o.is_demo_data, o.status, o.cluster_id, o.generated_by,
          s.total_score, s.explanation, s.evidence_strength_score
        from marketing_story_opportunities o
        left join lateral (
          select total_score, explanation, evidence_strength_score from marketing_trend_scores
          where cluster_id = o.cluster_id order by computed_at desc limit 1
        ) s on true
        where o.org_id = ${orgId} and o.status <> 'archived'
      `

  // Definitive ranking happens here in JS (compareOpportunityRank), not in the SQL above —
  // see lib/marketing/ranking.ts for why: it's the same rule this file's SQL used to
  // encode directly, pulled out so "live always outranks demo" is unit-testable.
  const ranked = rows
    .slice()
    .sort((a, b) => compareOpportunityRank({ isDemoData: a.is_demo_data, totalScore: a.total_score }, { isDemoData: b.is_demo_data, totalScore: b.total_score }))
    .slice(0, 5)

  const cards: BriefingCard[] = []
  for (const row of ranked) {
    const summary = row.cluster_id
      ? await evidenceSummaryForCluster(row.cluster_id)
      : { sourceTypeCounts: [], sparkline: [0, 0, 0, 0, 0, 0, 0], freshnessLabel: 'Unknown' }

    const [practicalAngle] = await sql<{ structure: StoryAngleStructure }[]>`
      select structure from marketing_story_angles
      where opportunity_id = ${row.id} and angle_type = 'practical' limit 1
    `

    cards.push({
      id: row.id,
      title: row.title,
      signalSummary: row.signal_summary,
      isDemoData: row.is_demo_data,
      status: row.status,
      clusterId: row.cluster_id,
      generatedBy: row.generated_by,
      totalScore: row.total_score,
      explanation: row.explanation,
      confidenceLabel:
        row.evidence_strength_score == null
          ? null
          : row.evidence_strength_score >= 75
            ? 'High'
            : row.evidence_strength_score >= 45
              ? 'Medium'
              : 'Low',
      freshnessLabel: summary.freshnessLabel,
      audience: practicalAngle?.structure.audience ?? null,
      sourceTypeCounts: summary.sourceTypeCounts,
      sparkline: summary.sparkline,
    })
  }
  return cards
}

export interface BriefingMetrics {
  signalsIngested24h: number
  activeClusters: number
  newOpportunities7d: number
  lastRunAt: string | null
  lastRunStatus: string | null
}

export async function getBriefingMetrics(orgId: string): Promise<BriefingMetrics> {
  const [{ count: signalsIngested24h }] = await sql<{ count: number }[]>`
    select count(*)::int as count from marketing_source_items
    where org_id = ${orgId} and is_demo_data = false and retrieved_at >= now() - interval '24 hours'
  `
  const [{ count: activeClusters }] = await sql<{ count: number }[]>`
    select count(*)::int as count from marketing_trend_clusters where org_id = ${orgId} and is_demo_data = false
  `
  const [{ count: newOpportunities7d }] = await sql<{ count: number }[]>`
    select count(*)::int as count from marketing_story_opportunities
    where org_id = ${orgId} and is_demo_data = false and created_at >= now() - interval '7 days'
  `
  const [lastRun] = await sql<{ started_at: Date; status: string }[]>`
    select started_at, status from marketing_research_runs where org_id = ${orgId} order by started_at desc limit 1
  `
  return {
    signalsIngested24h,
    activeClusters,
    newOpportunities7d,
    lastRunAt: lastRun ? lastRun.started_at.toISOString() : null,
    lastRunStatus: lastRun?.status ?? null,
  }
}

/** Whether this org has any real (non-demo) source items yet — used to default the
 * Briefing/Trend Radar "hide demo data" toggle to on once live data exists. */
export async function hasLiveMarketingData(orgId: string): Promise<boolean> {
  const [row] = await sql<{ exists: boolean }[]>`
    select exists(select 1 from marketing_source_items where org_id = ${orgId} and is_demo_data = false) as exists
  `
  return row?.exists ?? false
}

// ---------- Trend Radar ----------

export interface TrendClusterRow {
  id: string
  title: string
  summary: string
  is_demo_data: boolean
}

export interface TrendScoreRow {
  total_score: number
  dental_healthcare_relevance_score: number
  momentum_recency_score: number
  evidence_strength_score: number
  cross_source_confirmation_score: number
  story_potential_score: number
  learned_interest_fit_score: number
  explanation: string
}

export interface SourceItemRow {
  id: string
  source_url: string
  title: string
  reliability_classification: ReliabilityClassification
  is_demo_data: boolean
  supporting_excerpt: string
  source_type: SourceType
}

export interface TrendClusterWithEvidence {
  cluster: TrendClusterRow
  score: TrendScoreRow | null
  evidence: SourceItemRow[]
}

/** Full detail for the evidence side panel (Briefing card / Trend Radar row click) —
 * see app/api/marketing/evidence/[clusterId]/route.ts. */
export async function getClusterEvidenceDetail(clusterId: string): Promise<TrendClusterWithEvidence | null> {
  const [cluster] = await sql<TrendClusterRow[]>`
    select id, title, summary, is_demo_data from marketing_trend_clusters where id = ${clusterId}
  `
  if (!cluster) return null
  const [score] = await sql<TrendScoreRow[]>`
    select total_score, dental_healthcare_relevance_score, momentum_recency_score,
      evidence_strength_score, cross_source_confirmation_score, story_potential_score,
      learned_interest_fit_score, explanation
    from marketing_trend_scores where cluster_id = ${cluster.id}
    order by computed_at desc limit 1
  `
  const evidence = await sql<SourceItemRow[]>`
    select i.id, i.source_url, i.title, i.reliability_classification, i.is_demo_data,
      i.supporting_excerpt, i.source_type
    from marketing_trend_cluster_items ci
    join marketing_source_items i on i.id = ci.source_item_id
    where ci.cluster_id = ${cluster.id}
    order by i.retrieved_at desc
  `
  return { cluster, score: score ?? null, evidence }
}

export interface TrendRadarRow {
  id: string
  title: string
  summary: string
  isDemoData: boolean
  totalScore: number | null
  explanation: string | null
  firstSeen: string | null
  lastSeen: string | null
  itemCount: number
  sourceTypeCounts: SourceTypeCount[]
  sparkline: number[]
  dentalRelevanceAvg: number | null
}

/** Trend Radar: every cluster (live and demo), for the sortable/filterable table. */
export async function getTrendRadarRows(orgId: string): Promise<TrendRadarRow[]> {
  const clusters = await sql<
    { id: string; title: string; summary: string; is_demo_data: boolean; total_score: number | null; explanation: string | null }[]
  >`
    select c.id, c.title, c.summary, c.is_demo_data, s.total_score, s.explanation
    from marketing_trend_clusters c
    left join lateral (
      select total_score, explanation from marketing_trend_scores
      where cluster_id = c.id order by computed_at desc limit 1
    ) s on true
    where c.org_id = ${orgId}
    order by c.is_demo_data asc, (s.total_score is null), s.total_score desc
  `

  const rows: TrendRadarRow[] = []
  for (const cluster of clusters) {
    const evidence = await sql<
      { source_type: SourceType; published_at: Date | null; retrieved_at: Date; dental_relevance: number }[]
    >`
      select i.source_type, i.published_at, i.retrieved_at, i.dental_relevance
      from marketing_trend_cluster_items ci
      join marketing_source_items i on i.id = ci.source_item_id
      where ci.cluster_id = ${cluster.id}
    `

    const counts = new Map<SourceType, number>()
    const dayBuckets = new Array(7).fill(0)
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    let firstSeenMs: number | null = null
    let lastSeenMs: number | null = null
    let dentalSum = 0

    for (const item of evidence) {
      counts.set(item.source_type, (counts.get(item.source_type) ?? 0) + 1)
      const at = (item.published_at ?? item.retrieved_at).getTime()
      firstSeenMs = firstSeenMs === null ? at : Math.min(firstSeenMs, at)
      lastSeenMs = lastSeenMs === null ? at : Math.max(lastSeenMs, at)
      const dayIndex = 6 - Math.floor((now - at) / dayMs)
      if (dayIndex >= 0 && dayIndex < 7) dayBuckets[dayIndex]++
      dentalSum += item.dental_relevance
    }

    rows.push({
      id: cluster.id,
      title: cluster.title,
      summary: cluster.summary,
      isDemoData: cluster.is_demo_data,
      totalScore: cluster.total_score,
      explanation: cluster.explanation,
      firstSeen: firstSeenMs ? new Date(firstSeenMs).toISOString() : null,
      lastSeen: lastSeenMs ? new Date(lastSeenMs).toISOString() : null,
      itemCount: evidence.length,
      sourceTypeCounts: Array.from(counts.entries()).map(([sourceType, count]) => ({ sourceType, count })),
      sparkline: dayBuckets,
      dentalRelevanceAvg: evidence.length ? Math.round(dentalSum / evidence.length) : null,
    })
  }
  return rows
}

// ---------- Story Workspace ----------

export interface StoryOpportunityRow {
  id: string
  title: string
  signal_summary: string
  status: string
  is_demo_data: boolean
  selected_angle_id: string | null
  cluster_id: string | null
  generated_by: 'template' | 'llm'
}

export async function getStoryOpportunities(orgId: string): Promise<StoryOpportunityRow[]> {
  return sql<StoryOpportunityRow[]>`
    select id, title, signal_summary, status, is_demo_data, selected_angle_id, cluster_id, generated_by
    from marketing_story_opportunities where org_id = ${orgId} order by created_at desc
  `
}

export async function getStoryOpportunity(opportunityId: string): Promise<StoryOpportunityRow | null> {
  const [row] = await sql<StoryOpportunityRow[]>`
    select id, title, signal_summary, status, is_demo_data, selected_angle_id, cluster_id, generated_by
    from marketing_story_opportunities where id = ${opportunityId}
  `
  return row ?? null
}

export async function getStoryOpportunityByClusterId(clusterId: string): Promise<StoryOpportunityRow | null> {
  const [row] = await sql<StoryOpportunityRow[]>`
    select id, title, signal_summary, status, is_demo_data, selected_angle_id, cluster_id, generated_by
    from marketing_story_opportunities where cluster_id = ${clusterId} limit 1
  `
  return row ?? null
}

export interface StoryAngleRow {
  id: string
  angle_type: AngleType
  structure: StoryAngleStructure
  applied_preference_notes: string[]
}

export async function getStoryAngles(opportunityId: string): Promise<StoryAngleRow[]> {
  return sql<StoryAngleRow[]>`
    select id, angle_type, structure, applied_preference_notes
    from marketing_story_angles where opportunity_id = ${opportunityId}
  `
}

export async function selectAngle(opportunityId: string, angleId: string) {
  await sql`
    update marketing_story_opportunities
    set selected_angle_id = ${angleId}, status = 'selected'
    where id = ${opportunityId}
  `
}

/** Briefing card inline actions: "Watch" and "Not relevant". 'archived' opportunities are
 * excluded from getBriefingCards (below) but stay visible in Story Workspace/Trend Radar —
 * "not relevant" hides it from the Briefing, it doesn't delete the underlying signal. */
export async function updateOpportunityStatus(
  opportunityId: string,
  status: 'new' | 'watching' | 'selected' | 'archived',
) {
  await sql`update marketing_story_opportunities set status = ${status} where id = ${opportunityId}`
}

// ---------- Content Library / Studio ----------

export interface ContentDraftRow {
  id: string
  format: ContentFormat
  audience: string
  objective: string
  main_idea: string
  source_material_links: string[]
  hook_options: string[]
  draft_text: string
  alternative_pov: string
  claims_requiring_review: string[]
  suggested_visual: string | null
  generated_by: 'template' | 'llm'
  is_demo_data: boolean
}

export async function getContentDrafts(orgId: string): Promise<ContentDraftRow[]> {
  return sql<ContentDraftRow[]>`
    select id, format, audience, objective, main_idea, source_material_links, hook_options,
      draft_text, alternative_pov, claims_requiring_review, suggested_visual, generated_by, is_demo_data
    from marketing_content_drafts where org_id = ${orgId} order by created_at desc
  `
}

export async function getContentDraft(draftId: string): Promise<ContentDraftRow | null> {
  const [row] = await sql<ContentDraftRow[]>`
    select id, format, audience, objective, main_idea, source_material_links, hook_options,
      draft_text, alternative_pov, claims_requiring_review, suggested_visual, generated_by, is_demo_data
    from marketing_content_drafts where id = ${draftId}
  `
  return row ?? null
}

export async function createContentDraft(
  orgId: string,
  opportunityId: string,
  angleId: string,
  format: Extract<ContentFormat, 'linkedin_post' | 'video_script'>,
): Promise<string> {
  const [angleRow] = await sql<{ angle_type: AngleType; structure: StoryAngleStructure; applied_preference_notes: string[] }[]>`
    select angle_type, structure, applied_preference_notes from marketing_story_angles where id = ${angleId}
  `
  const [opportunity] = await sql<{ title: string; cluster_id: string | null; is_demo_data: boolean }[]>`
    select title, cluster_id, is_demo_data from marketing_story_opportunities where id = ${opportunityId}
  `
  if (!angleRow || !opportunity) throw new Error('Angle or opportunity not found')

  const evidenceLinks = opportunity.cluster_id
    ? (
        await sql<{ url: string }[]>`
          select i.source_url as url from marketing_trend_cluster_items ci
          join marketing_source_items i on i.id = ci.source_item_id
          where ci.cluster_id = ${opportunity.cluster_id}
        `
      ).map((r) => r.url)
    : []

  const angle: GeneratedAngle = {
    angleType: angleRow.angle_type,
    structure: angleRow.structure,
    appliedPreferenceNotes: angleRow.applied_preference_notes,
  }

  const generated = await generateContent({
    orgId,
    format,
    opportunityTitle: opportunity.title,
    angle,
    sourceMaterialLinks: evidenceLinks,
  })

  const [draft] = await sql<{ id: string }[]>`
    insert into marketing_content_drafts (
      org_id, opportunity_id, angle_id, format, audience, objective, main_idea,
      source_material_links, hook_options, draft_text, alternative_pov,
      claims_requiring_review, suggested_visual, generated_by, is_demo_data
    ) values (
      ${orgId}, ${opportunityId}, ${angleId}, ${generated.format}, ${generated.audience},
      ${generated.objective}, ${generated.mainIdea}, ${sql.json(generated.sourceMaterialLinks)},
      ${sql.json(generated.hookOptions)}, ${generated.draftText}, ${generated.alternativePov},
      ${sql.json(generated.claimsRequiringReview)}, ${generated.suggestedVisual},
      ${generated.generatedBy}, ${opportunity.is_demo_data}
    )
    returning id
  `
  return draft.id
}

// ---------- Voice and Learning ----------

export interface LearnedPreferenceViewRow {
  id: string
  preference_type: 'explicit_preference' | 'observed_preference' | 'performance_evidence'
  key: string
  occurrence_count: number
  status: 'active' | 'temporary' | 'reset'
  supporting_example_ids: string[]
  updated_at: string
}

export async function getLearnedPreferences(orgId: string): Promise<LearnedPreferenceViewRow[]> {
  return sql<LearnedPreferenceViewRow[]>`
    select id, preference_type, key, occurrence_count, status, supporting_example_ids, updated_at
    from marketing_learned_preferences where org_id = ${orgId} order by updated_at desc
  `
}

// ---------- Sources and Integrations ----------

export async function getRecentSourceItems(orgId: string, limit = 30): Promise<SourceItemRow[]> {
  return sql<SourceItemRow[]>`
    select id, source_url, title, reliability_classification, is_demo_data, supporting_excerpt, source_type
    from marketing_source_items where org_id = ${orgId} order by retrieved_at desc limit ${limit}
  `
}

export interface FeedSourceStatsRow {
  feedRegistryId: string
  name: string
  sourceType: SourceType | null
  reliabilityClassification: ReliabilityClassification | null
  enabled: boolean
  lastFetchedAt: string | null
  lastError: string | null
  items7d: number
  /** True once this feed has a marketing_sources row — false if it hasn't run yet. */
  hasRun: boolean
}

/** Registry table for the Sources page: every FEED_REGISTRY entry, joined against its
 * marketing_sources row (if any run has happened yet) and a 7-day item count. */
export async function getFeedSourceStats(orgId: string): Promise<FeedSourceStatsRow[]> {
  const sourceRows = await sql<
    { feed_registry_id: string; enabled: boolean; last_fetched_at: Date | null; last_error: string | null }[]
  >`
    select feed_registry_id, enabled, last_fetched_at, last_error
    from marketing_sources where org_id = ${orgId} and feed_registry_id is not null
  `
  const byFeedId = new Map(sourceRows.map((r) => [r.feed_registry_id, r]))

  const itemCounts = await sql<{ feed_registry_id: string; count: number }[]>`
    select s.feed_registry_id, count(i.id)::int as count
    from marketing_sources s
    join marketing_source_items i on i.source_id = s.id
    where s.org_id = ${orgId} and s.feed_registry_id is not null and i.retrieved_at >= now() - interval '7 days'
    group by s.feed_registry_id
  `
  const countsByFeedId = new Map(itemCounts.map((r) => [r.feed_registry_id, r.count]))

  return FEED_REGISTRY.map((entry) => {
    const source = byFeedId.get(entry.id)
    return {
      feedRegistryId: entry.id,
      name: entry.name,
      sourceType: entry.sourceType,
      reliabilityClassification: entry.reliabilityClassification,
      enabled: source?.enabled ?? entry.enabled,
      lastFetchedAt: source?.last_fetched_at ? source.last_fetched_at.toISOString() : null,
      lastError: source?.last_error ?? null,
      items7d: countsByFeedId.get(entry.id) ?? 0,
      hasRun: Boolean(source),
    }
  })
}

/** Sources page enabled toggle. Upserts a marketing_sources row even if this feed has
 * never run yet, so disabling a feed before its first run actually sticks — ingestFeed
 * checks source.enabled and skips disabled feeds without recording an error. */
export async function setFeedEnabled(orgId: string, feedRegistryId: string, enabled: boolean): Promise<void> {
  const entry = FEED_REGISTRY.find((e) => e.id === feedRegistryId)
  if (!entry) throw new Error(`Unknown feed registry id: ${feedRegistryId}`)
  await sql`
    insert into marketing_sources (org_id, adapter_id, name, is_demo_data, feed_registry_id, reliability_classification, enabled)
    values (${orgId}, 'rss', ${entry.name}, false, ${feedRegistryId}, ${entry.reliabilityClassification}, ${enabled})
    on conflict (org_id, feed_registry_id) where feed_registry_id is not null
    do update set enabled = excluded.enabled
  `
}

export interface ResearchRunRow {
  id: string
  startedAt: string
  completedAt: string | null
  status: string
  triggeredBy: string
  itemsIngested: number
  clustersUpdated: number
  opportunitiesCreated: number
  feedResults: { feedId: string; name: string; itemsFound: number; itemsInserted: number; error: string | null }[]
  notes: string | null
}

export async function getResearchRunHistory(orgId: string, limit = 10): Promise<ResearchRunRow[]> {
  const rows = await sql<
    {
      id: string; started_at: Date; completed_at: Date | null; status: string; triggered_by: string
      items_ingested: number; clusters_updated: number; opportunities_created: number
      feed_results: ResearchRunRow['feedResults']; notes: string | null
    }[]
  >`
    select id, started_at, completed_at, status, triggered_by, items_ingested, clusters_updated,
      opportunities_created, feed_results, notes
    from marketing_research_runs
    where org_id = ${orgId}
    order by started_at desc
    limit ${limit}
  `
  return rows.map((r) => ({
    id: r.id,
    startedAt: r.started_at.toISOString(),
    completedAt: r.completed_at ? r.completed_at.toISOString() : null,
    status: r.status,
    triggeredBy: r.triggered_by,
    itemsIngested: r.items_ingested,
    clustersUpdated: r.clusters_updated,
    opportunitiesCreated: r.opportunities_created,
    feedResults: r.feed_results ?? [],
    notes: r.notes,
  }))
}

export async function ingestManualUrl(orgId: string, url: string): Promise<{ inserted: boolean }> {
  const [source] = await sql<{ id: string }[]>`
    insert into marketing_sources (org_id, adapter_id, name, is_demo_data)
    values (${orgId}, 'manual-url', ${url}, false)
    returning id
  `
  const items = await manualUrlAdapter.fetch(url)
  let inserted = false
  for (const item of items) {
    const [row] = await sql<{ id: string }[]>`
      insert into marketing_source_items (
        org_id, source_id, source_url, title, raw_content, published_at, retrieved_at,
        author_or_org, source_type, supporting_excerpt, reliability_classification,
        dental_relevance, healthcare_relevance, geographic_relevance, topic_classification, is_demo_data
      ) values (
        ${orgId}, ${source.id}, ${item.sourceUrl}, ${item.title}, ${item.rawContent},
        ${item.publishedAt}, now(), ${item.authorOrOrg}, ${item.sourceType},
        ${item.supportingExcerpt}, ${item.reliabilityClassification}, ${item.dentalRelevance},
        ${item.healthcareRelevance}, ${item.geographicRelevance}, ${sql.json(item.topicClassification)},
        ${item.isDemoData}
      )
      on conflict (org_id, source_url) do nothing
      returning id
    `
    if (row) inserted = true
  }
  return { inserted }
}

// ---------- Settings ----------

export async function getMarketingOrgAndUser(orgId: string, userId: string) {
  const [org] = await sql<{ name: string }[]>`select name from marketing_organizations where id = ${orgId}`
  const [user] = await sql<{ name: string; email: string }[]>`select name, email from marketing_users where id = ${userId}`
  return { org: org ?? null, user: user ?? null }
}
