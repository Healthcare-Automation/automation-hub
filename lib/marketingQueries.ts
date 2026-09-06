import { marketingSql as sql } from './marketingDb'
import { manualUrlAdapter } from './marketing/adapters/manualUrl'
import { generateContent } from './marketing/contentGenerator'
import type {
  AngleType, ContentFormat, GeneratedAngle, ReliabilityClassification,
  SourceType, StoryAngleStructure,
} from './marketing/types'

/** Raw postgres.js query functions for the Marketing tab (Practice Story Engine port).
 * Follows lib/outreachQueries.ts's convention: one function per page/action, hand-written
 * SQL, no ORM. See PORT_BRIEF.md for why (hub has no Drizzle). */

// ---------- Briefing ----------

export interface BriefingRow {
  id: string
  title: string
  signal_summary: string
  is_demo_data: boolean
  total_score: number | null
  explanation: string | null
}

export async function getBriefing(orgId: string): Promise<BriefingRow[]> {
  return sql<BriefingRow[]>`
    select o.id, o.title, o.signal_summary, o.is_demo_data,
      s.total_score, s.explanation
    from marketing_story_opportunities o
    left join marketing_trend_scores s on s.cluster_id = o.cluster_id
    where o.org_id = ${orgId}
    order by (s.total_score is null), s.total_score desc
    limit 5
  `
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

export async function getTrendClusters(orgId: string): Promise<TrendClusterWithEvidence[]> {
  const clusters = await sql<TrendClusterRow[]>`
    select id, title, summary, is_demo_data from marketing_trend_clusters
    where org_id = ${orgId} order by created_at desc
  `
  const results: TrendClusterWithEvidence[] = []
  for (const cluster of clusters) {
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
    `
    results.push({ cluster, score: score ?? null, evidence })
  }
  return results
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
}

export async function getStoryOpportunities(orgId: string): Promise<StoryOpportunityRow[]> {
  return sql<StoryOpportunityRow[]>`
    select id, title, signal_summary, status, is_demo_data, selected_angle_id, cluster_id
    from marketing_story_opportunities where org_id = ${orgId} order by created_at desc
  `
}

export async function getStoryOpportunity(opportunityId: string): Promise<StoryOpportunityRow | null> {
  const [row] = await sql<StoryOpportunityRow[]>`
    select id, title, signal_summary, status, is_demo_data, selected_angle_id, cluster_id
    from marketing_story_opportunities where id = ${opportunityId}
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
