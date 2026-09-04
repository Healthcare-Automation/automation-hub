import { marketingSql as sql } from '../lib/marketingDb'
import { getDemoOrgAndUser } from '../lib/marketingDemoActor'
import { manualUrlAdapter } from '../lib/marketing/adapters/manualUrl'
import { demoGoogleTrendsAdapter } from '../lib/marketing/adapters/demoGoogleTrends'

/** Ported from marketing_content/scripts/research-run.ts. Manually invoked today
 * (`npx tsx scripts/research-run-marketing.ts [--url <url>]`); becomes a scheduled job
 * later (pg_cron + Edge Function, or a queue worker) — same SourceAdapter interface,
 * different trigger. Not built as real scheduling infra in this pass, per the brief. */
async function main() {
  const urlArgIndex = process.argv.indexOf('--url')
  const url = urlArgIndex >= 0 ? process.argv[urlArgIndex + 1] : undefined
  const { orgId } = await getDemoOrgAndUser()

  const adapter = url ? manualUrlAdapter : demoGoogleTrendsAdapter
  const isDemo = adapter.id === 'demo-google-trends'

  const [source] = await sql<{ id: string }[]>`
    insert into marketing_sources (org_id, adapter_id, name, is_demo_data)
    values (${orgId}, ${adapter.id}, ${url ?? 'Demo Google Trends feed'}, ${isDemo})
    returning id
  `

  const [run] = await sql<{ id: string }[]>`
    insert into marketing_research_runs (org_id, adapter_id, status, is_demo_data)
    values (${orgId}, ${adapter.id}, 'running', ${isDemo})
    returning id
  `

  try {
    const items = await adapter.fetch(url)
    for (const item of items) {
      await sql`
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
      `
    }
    await sql`
      update marketing_research_runs set status = 'completed', completed_at = now(), items_ingested = ${items.length}
      where id = ${run.id}
    `
    console.log(`Ingested ${items.length} item(s) via ${adapter.id}.`)
  } catch (err) {
    await sql`
      update marketing_research_runs set status = 'failed', completed_at = now(), notes = ${String(err)}
      where id = ${run.id}
    `
    throw err
  }
  await sql.end({ timeout: 5 })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
