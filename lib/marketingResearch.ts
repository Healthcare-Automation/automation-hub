import type postgres from 'postgres'
import { marketingSql as sql } from './marketingDb'
import { FEED_REGISTRY, type FeedRegistryEntry } from './marketing/adapters/feedRegistry'
import { createRssAdapter, FEED_USER_AGENT } from './marketing/adapters/rss'
import { extractText } from './marketing/htmlText'
import { scoreRelevance } from './marketing/relevance'
import type { RawItem } from './marketing/types'

/** Real ingestion pipeline (MARKETING_V1_BRIEF.md section 1): one marketing_sources row
 * per registry feed, dedupe on (org_id, source_url), per-feed error isolation (a failed
 * feed never aborts the run), and best-effort article-page enrichment for the top N
 * newest/most-relevant items. Orchestrated by app/api/cron/marketing-research/route.ts
 * and the admin "Run research now" button — both call runIngestion with the same options
 * shape, just a different `triggeredBy`. */

const ENRICH_TOP_N = 5
const ENRICH_EXCERPT_MAX = 2000
const ENRICH_FETCH_TIMEOUT_MS = 10_000
// Vercel Fluid Compute defaults to a 300s function timeout, but this pipeline runs on a
// 10-minute cron cadence and shares the box with other agents — stay well under budget so
// a slow feed can never make the whole cron tick hang. Chunking (stop starting new feeds
// once the budget is spent) means a single run may only process a subset; the next run
// picks up the remaining feeds since ingestFeed is idempotent (dedupe on source_url).
const DEFAULT_TIME_BUDGET_MS = 45_000

export interface FeedRunResult {
  feedId: string
  name: string
  itemsFound: number
  itemsInserted: number
  error: string | null
}

async function ensureSourceForFeed(orgId: string, entry: FeedRegistryEntry): Promise<{ id: string; enabled: boolean }> {
  const [existing] = await sql<{ id: string; enabled: boolean }[]>`
    select id, enabled from marketing_sources where org_id = ${orgId} and feed_registry_id = ${entry.id}
  `
  if (existing) return existing
  const [inserted] = await sql<{ id: string }[]>`
    insert into marketing_sources (org_id, adapter_id, name, is_demo_data, feed_registry_id, reliability_classification, enabled)
    values (${orgId}, 'rss', ${entry.name}, false, ${entry.id}, ${entry.reliabilityClassification}, true)
    returning id
  `
  return { id: inserted.id, enabled: true }
}

async function insertItem(orgId: string, sourceId: string, item: RawItem): Promise<string | null> {
  const relevance = await scoreRelevance(item.title, item.rawContent, {
    dentalRelevance: item.dentalRelevance,
    healthcareRelevance: item.healthcareRelevance,
  })
  const [row] = await sql<{ id: string }[]>`
    insert into marketing_source_items (
      org_id, source_id, source_url, title, raw_content, published_at, retrieved_at,
      author_or_org, source_type, supporting_excerpt, reliability_classification,
      dental_relevance, healthcare_relevance, geographic_relevance, topic_classification, is_demo_data
    ) values (
      ${orgId}, ${sourceId}, ${item.sourceUrl}, ${item.title}, ${item.rawContent},
      ${item.publishedAt}, now(), ${item.authorOrOrg}, ${item.sourceType},
      ${item.supportingExcerpt}, ${item.reliabilityClassification},
      ${relevance.dentalRelevance}, ${relevance.healthcareRelevance}, ${item.geographicRelevance},
      ${sql.json(item.topicClassification)}, ${item.isDemoData}
    )
    on conflict (org_id, source_url) do nothing
    returning id
  `
  return row?.id ?? null
}

/** Ingests one feed end-to-end. Never throws — a feed-level failure (network error, feed
 * taken offline, rate limit) is recorded as this feed's error and the run continues. */
export async function ingestFeed(orgId: string, entry: FeedRegistryEntry): Promise<FeedRunResult> {
  const source = await ensureSourceForFeed(orgId, entry)
  if (!source.enabled) {
    return { feedId: entry.id, name: entry.name, itemsFound: 0, itemsInserted: 0, error: 'disabled' }
  }
  try {
    const items = await createRssAdapter(entry).fetch()
    let inserted = 0
    for (const item of items) {
      const id = await insertItem(orgId, source.id, item)
      if (id) inserted++
    }
    await sql`update marketing_sources set last_fetched_at = now(), last_error = null where id = ${source.id}`
    return { feedId: entry.id, name: entry.name, itemsFound: items.length, itemsInserted: inserted, error: null }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await sql`update marketing_sources set last_fetched_at = now(), last_error = ${reason} where id = ${source.id}`
    return { feedId: entry.id, name: entry.name, itemsFound: 0, itemsInserted: 0, error: reason }
  }
}

async function enrichItem(itemId: string, url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': FEED_USER_AGENT },
      signal: AbortSignal.timeout(ENRICH_FETCH_TIMEOUT_MS),
    })
    if (!response.ok) return false
    const html = await response.text()
    const text = extractText(html).slice(0, ENRICH_EXCERPT_MAX)
    if (!text) return false
    await sql`update marketing_source_items set full_excerpt = ${text} where id = ${itemId}`
    return true
  } catch {
    // Best-effort — leave full_excerpt null. A blocked/slow article page must not fail the run.
    return false
  }
}

export interface RunIngestionOptions {
  orgId: string
  triggeredBy: 'cron' | 'manual'
  timeBudgetMs?: number
}

export interface RunIngestionResult {
  runId: string
  feedResults: FeedRunResult[]
  itemsIngested: number
  itemsEnriched: number
  feedsProcessed: number
  feedsSkippedForBudget: number
}

export async function runIngestion(options: RunIngestionOptions): Promise<RunIngestionResult> {
  const { orgId, triggeredBy } = options
  const timeBudgetMs = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS
  const startedAt = Date.now()
  const startedAtIso = new Date(startedAt).toISOString()

  const [run] = await sql<{ id: string }[]>`
    insert into marketing_research_runs (org_id, adapter_id, status, triggered_by, is_demo_data, stage)
    values (${orgId}, 'rss-registry', 'running', ${triggeredBy}, false, 'ingest')
    returning id
  `
  const runId = run.id

  // Least-recently-fetched first, so a run that exhausts its time budget picks up where the
  // previous one left off instead of re-hitting the same first N registry entries every tick.
  const lastFetched = await sql<{ feed_registry_id: string; last_fetched_at: string | null }[]>`
    select feed_registry_id, last_fetched_at from marketing_sources
    where org_id = ${orgId} and feed_registry_id is not null
  `
  const fetchedAt = new Map(lastFetched.map((r) => [r.feed_registry_id, r.last_fetched_at ? Date.parse(r.last_fetched_at) : 0]))
  const enabledFeeds = FEED_REGISTRY.filter((entry) => entry.enabled)
    .sort((a, b) => (fetchedAt.get(a.id) ?? 0) - (fetchedAt.get(b.id) ?? 0))
  const feedResults: FeedRunResult[] = []
  let itemsIngested = 0
  let feedsSkippedForBudget = 0

  for (const entry of enabledFeeds) {
    if (Date.now() - startedAt > timeBudgetMs) {
      feedsSkippedForBudget = enabledFeeds.length - feedResults.length
      break
    }
    const result = await ingestFeed(orgId, entry)
    feedResults.push(result)
    itemsIngested += result.itemsInserted
  }

  await sql`
    update marketing_research_runs
    set feed_results = ${sql.json(feedResults as unknown as postgres.JSONValue)}, items_ingested = ${itemsIngested}, stage = 'enrich'
    where id = ${runId}
  `

  const toEnrich = await sql<{ id: string; source_url: string }[]>`
    select id, source_url from marketing_source_items
    where org_id = ${orgId}
      and retrieved_at >= ${startedAtIso}
      and full_excerpt is null
    order by (dental_relevance + healthcare_relevance) desc
    limit ${ENRICH_TOP_N}
  `
  let itemsEnriched = 0
  for (const item of toEnrich) {
    if (Date.now() - startedAt > timeBudgetMs) break
    const ok = await enrichItem(item.id, item.source_url)
    if (ok) itemsEnriched++
  }

  await sql`
    update marketing_research_runs
    set status = 'completed', completed_at = now(), stage = 'enrich_done'
    where id = ${runId}
  `

  return {
    runId,
    feedResults,
    itemsIngested,
    itemsEnriched,
    feedsProcessed: feedResults.length,
    feedsSkippedForBudget,
  }
}

export async function markRunFailed(runId: string, reason: string): Promise<void> {
  await sql`
    update marketing_research_runs
    set status = 'failed', completed_at = now(), notes = ${reason}
    where id = ${runId}
  `
}
