import { marketingSql as sql } from './marketingDb'
import type { InstagramReviewTag } from './marketing/types'
import type { RecentDraftContext } from './marketing/instagramGenerator'

/** Raw postgres.js query functions for the Marketing tab's Instagram content queue.
 * Follows lib/outreachQueries.ts's convention: one function per page/action, hand-written
 * SQL, no ORM. See PORT_BRIEF.md for why (hub has no Drizzle).
 *
 * The old Briefing/Trend Radar/Story Workspace/Content Library/Sources/Voice-and-Learning
 * query functions that used to live here were removed 2026-09-08 when the Marketing tab was
 * rebuilt Instagram-only (MARKETING_TAB_REBUILD_BRIEF.md) — their consuming pages/routes were
 * deleted and nothing else called them. The underlying tables (marketing_trend_clusters,
 * marketing_story_opportunities, marketing_source_items, etc.) still exist in
 * sql/marketing_schema.sql; this was a UI/code cut, not a data migration. */

// ---------- Instagram content queue ----------

/** Context for the generator's planning/synthesis prompts (avoid repeating recent angles,
 * bias on past approve/disapprove feedback). Most recent N instagram drafts only — the
 * generator only needs recent history, not the full archive. */
export async function getRecentInstagramDraftsContext(orgId: string, limit = 25): Promise<RecentDraftContext[]> {
  const rows = await sql<
    {
      main_idea: string; sentiment_tags: string[]; created_at: Date; notes: string | null
      feedback_tags: string[] | null; feedback_free_text: string | null
    }[]
  >`
    select d.main_idea, d.sentiment_tags, d.created_at, d.notes, fb.tags as feedback_tags, fb.free_text as feedback_free_text
    from marketing_content_drafts d
    left join lateral (
      select tags, free_text from marketing_feedback_events
      where target_type = 'content_draft' and target_id = d.id and (tags ? 'approved' or tags ? 'disapproved')
      order by created_at desc limit 1
    ) fb on true
    where d.org_id = ${orgId} and d.format = 'instagram_post'
    order by d.created_at desc
    limit ${limit}
  `
  return rows.map((r) => ({
    mainIdea: r.main_idea,
    sentimentTags: r.sentiment_tags,
    createdAt: r.created_at.toISOString(),
    reviewTag: r.feedback_tags?.includes('approved') ? 'approved' : r.feedback_tags?.includes('disapproved') ? 'disapproved' : null,
    freeText: r.feedback_free_text,
    notes: r.notes,
  }))
}

export interface InsertInstagramDraftInput {
  orgId: string
  mainIdea: string
  audience: string
  objective: string
  caption: string
  hookLine: string
  coreStat: string
  sourceUrls: string[]
  hashtags: string[]
  sentimentTags: string[]
  impactScore: number
  impactScoreReasoning: string
  imagePrompt: string
  notes: string
  claimsRequiringReview: string[]
  fingerprint: string
}

export async function insertInstagramDraft(input: InsertInstagramDraftInput): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into marketing_content_drafts (
      org_id, opportunity_id, angle_id, format, platform, audience, objective, main_idea,
      source_material_links, hook_options, draft_text, caption, hashtags, sentiment_tags,
      impact_score, impact_score_reasoning, image_prompt, notes, content_fingerprint,
      claims_requiring_review, generated_by, status, is_demo_data
    ) values (
      ${input.orgId}, null, null, 'instagram_post', 'instagram', ${input.audience}, ${input.objective}, ${input.mainIdea},
      ${sql.json(input.sourceUrls)}, ${sql.json([input.hookLine, input.coreStat])}, ${input.caption}, ${input.caption},
      ${sql.json(input.hashtags)}, ${sql.json(input.sentimentTags)},
      ${input.impactScore}, ${input.impactScoreReasoning}, ${input.imagePrompt}, ${input.notes || null},
      ${input.fingerprint}, ${sql.json(input.claimsRequiringReview)}, 'llm', 'draft', false
    )
    returning id
  `
  return row.id
}

export interface InstagramDraftRow {
  id: string
  mainIdea: string
  audience: string
  objective: string
  caption: string
  hookLine: string
  sourceUrls: string[]
  hashtags: string[]
  sentimentTags: string[]
  impactScore: number | null
  impactScoreReasoning: string | null
  imageUrl: string | null
  imagePrompt: string | null
  slideCount: number
  notes: string | null
  usedAt: string | null
  claimsRequiringReview: string[]
  createdAt: string
  generatedBy: 'template' | 'llm'
  isDemoData: boolean
  reviewStatus: 'approved' | 'disapproved' | 'unreviewed'
}

/** Full instagram-platform draft list for the review queue — small dataset (3 posts/week),
 * so sort/filter happens client-side (components/marketing/InstagramQueueBoard.tsx),
 * matching TrendRadarTable's convention. slideCount > 0 means this draft has a rendered
 * carousel (marketing_content_draft_images) — see getCarouselSlideImage for fetching an
 * individual slide's bytes. */
export async function getInstagramDrafts(orgId: string): Promise<InstagramDraftRow[]> {
  const rows = await sql<
    {
      id: string; main_idea: string; audience: string; objective: string; caption: string | null
      hook_options: string[]; source_material_links: string[]; hashtags: string[]; sentiment_tags: string[]
      impact_score: number | null; impact_score_reasoning: string | null; image_url: string | null
      image_prompt: string | null; notes: string | null; used_at: Date | null
      claims_requiring_review: string[]; created_at: Date; generated_by: 'template' | 'llm'; is_demo_data: boolean
      feedback_tags: string[] | null; slide_count: number
    }[]
  >`
    select d.id, d.main_idea, d.audience, d.objective, d.caption, d.hook_options, d.source_material_links,
      d.hashtags, d.sentiment_tags, d.impact_score, d.impact_score_reasoning, d.image_url, d.image_prompt,
      d.notes, d.used_at, d.claims_requiring_review, d.created_at, d.generated_by, d.is_demo_data,
      fb.tags as feedback_tags,
      coalesce(si.slide_count, 0)::int as slide_count
    from marketing_content_drafts d
    left join lateral (
      select tags from marketing_feedback_events
      where target_type = 'content_draft' and target_id = d.id and (tags ? 'approved' or tags ? 'disapproved')
      order by created_at desc limit 1
    ) fb on true
    left join lateral (
      select count(*) as slide_count from marketing_content_draft_images where draft_id = d.id
    ) si on true
    where d.org_id = ${orgId} and d.format = 'instagram_post'
    order by d.created_at desc
  `
  return rows.map((r) => ({
    id: r.id,
    mainIdea: r.main_idea,
    audience: r.audience,
    objective: r.objective,
    caption: r.caption ?? '',
    hookLine: r.hook_options?.[0] ?? '',
    sourceUrls: r.source_material_links ?? [],
    hashtags: r.hashtags ?? [],
    sentimentTags: r.sentiment_tags ?? [],
    impactScore: r.impact_score,
    impactScoreReasoning: r.impact_score_reasoning,
    imageUrl: r.image_url,
    imagePrompt: r.image_prompt,
    slideCount: r.slide_count,
    notes: r.notes,
    usedAt: r.used_at ? r.used_at.toISOString() : null,
    claimsRequiringReview: r.claims_requiring_review ?? [],
    createdAt: r.created_at.toISOString(),
    generatedBy: r.generated_by,
    isDemoData: r.is_demo_data,
    reviewStatus: r.feedback_tags?.includes('approved') ? 'approved' : r.feedback_tags?.includes('disapproved') ? 'disapproved' : 'unreviewed',
  }))
}

export interface InstagramDraftMissingCarousel {
  id: string
  mainIdea: string
}

/** Drafts that have no rendered carousel slides at all (createdAt order, oldest first) —
 * backs scripts/backfill-instagram-carousels.ts. Unlike the old imagePrompt-based image
 * backfill, there is no persisted slidePlan to re-render from once a draft exists, so
 * "backfilling" a missing carousel here just means the draft needs to be regenerated
 * fresh via runInstagramGeneration (this only reports which ids qualify). */
export async function getInstagramDraftsMissingCarousel(orgId: string): Promise<InstagramDraftMissingCarousel[]> {
  const rows = await sql<{ id: string; main_idea: string }[]>`
    select d.id, d.main_idea
    from marketing_content_drafts d
    left join lateral (
      select count(*) as n from marketing_content_draft_images where draft_id = d.id
    ) si on true
    where d.org_id = ${orgId} and d.format = 'instagram_post' and coalesce(si.n, 0) = 0
    order by d.created_at asc
  `
  return rows.map((r) => ({ id: r.id, mainIdea: r.main_idea }))
}

/** Stores the generated stat-card image bytes and points image_url at this app's own
 * serving route (app/api/marketing/instagram-image/[id]/route.ts) rather than the bytes
 * themselves — keeps getInstagramDrafts' list query light (INSTAGRAM_IMAGE_BRIEF.md). */
export async function setInstagramDraftImage(draftId: string, bytes: Buffer): Promise<void> {
  await sql`
    update marketing_content_drafts
    set image_data = ${bytes}, image_url = ${'/api/marketing/instagram-image/' + draftId}
    where id = ${draftId} and format = 'instagram_post'
  `
}

export async function getInstagramDraftImage(draftId: string): Promise<Buffer | null> {
  const [row] = await sql<{ image_data: Buffer | null }[]>`
    select image_data from marketing_content_drafts where id = ${draftId} and format = 'instagram_post'
  `
  return row?.image_data ?? null
}

export async function updateInstagramDraftNotes(draftId: string, notes: string): Promise<void> {
  await sql`update marketing_content_drafts set notes = ${notes} where id = ${draftId} and format = 'instagram_post'`
}

export async function setInstagramDraftUsed(draftId: string, used: boolean): Promise<void> {
  await sql`
    update marketing_content_drafts set used_at = ${used ? sql`now()` : null}
    where id = ${draftId} and format = 'instagram_post'
  `
}

export async function recordInstagramReview(orgId: string, draftId: string, tag: InstagramReviewTag): Promise<void> {
  await sql`
    insert into marketing_feedback_events (org_id, target_type, target_id, tags)
    values (${orgId}, 'content_draft', ${draftId}, ${sql.json([tag])})
  `
}

// ---------- Instagram carousel slides ----------
// See sql/marketing_schema.sql's marketing_content_draft_images table. A draft with
// carousel slides has slideCount > 0 in getInstagramDrafts' list; drafts created before
// the carousel redesign (or where rendering failed) fall back to the legacy single
// image_url/image_data on the parent row (still read as slideCount === 0).

export interface CarouselSlideInsert {
  slideIndex: number
  kind: 'hook' | 'data' | 'cta'
  content: Record<string, string | null>
  imageData: Buffer
}

export async function insertCarouselSlides(draftId: string, slides: CarouselSlideInsert[]): Promise<void> {
  for (const s of slides) {
    await sql`
      insert into marketing_content_draft_images (draft_id, slide_index, kind, content, image_data)
      values (${draftId}, ${s.slideIndex}, ${s.kind}, ${sql.json(s.content as unknown as string[])}, ${s.imageData})
      on conflict (draft_id, slide_index) do update set kind = excluded.kind, content = excluded.content, image_data = excluded.image_data
    `
  }
}

export async function getCarouselSlideCounts(draftIds: string[]): Promise<Map<string, number>> {
  if (draftIds.length === 0) return new Map()
  const rows = await sql<{ draft_id: string; count: number }[]>`
    select draft_id, count(*)::int as count
    from marketing_content_draft_images
    where draft_id = any(${draftIds})
    group by draft_id
  `
  return new Map(rows.map((r) => [r.draft_id, r.count]))
}

export async function getCarouselSlideImage(draftId: string, slideIndex: number): Promise<Buffer | null> {
  const [row] = await sql<{ image_data: Buffer }[]>`
    select image_data from marketing_content_draft_images
    where draft_id = ${draftId} and slide_index = ${slideIndex}
  `
  return row?.image_data ?? null
}

export async function getCarouselSlideCount(draftId: string): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from marketing_content_draft_images where draft_id = ${draftId}
  `
  return row?.count ?? 0
}

// ---------- Settings ----------

export async function getMarketingOrgAndUser(orgId: string, userId: string) {
  const [[org], [user]] = await Promise.all([
    sql<{ name: string }[]>`select name from marketing_organizations where id = ${orgId}`,
    sql<{ name: string; email: string }[]>`select name, email from marketing_users where id = ${userId}`,
  ])
  return { org: org ?? null, user: user ?? null }
}
