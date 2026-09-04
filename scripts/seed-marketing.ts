import { marketingSql as sql } from '../lib/marketingDb'
import { getDemoOrgAndUser } from '../lib/marketingDemoActor'
import { demoGoogleTrendsAdapter } from '../lib/marketing/adapters/demoGoogleTrends'
import { computeTrendScore } from '../lib/marketing/scoring'
import { generateAngles, type GeneratedAngle } from '../lib/marketing/storyGenerator'
import { generateContent } from '../lib/marketing/contentGenerator'
import type { RawItem } from '../lib/marketing/types'

/** Ported from marketing_content/scripts/seed.ts (raw SQL instead of Drizzle). Inserts
 * clearly-labeled demo data (is_demo_data: true throughout) so the Marketing tab isn't
 * empty on first load — same shape as the standalone app's seed: 6 demo trend-feed
 * source_items, 2 trend_clusters with scores, 2 story_opportunities with 3 angles each,
 * 1 content_draft. Safe to re-run (no upsert — matches the standalone app's documented
 * "no de-duplication on repeated seed" known gap). */

interface InsertedItem extends RawItem {
  id: string
}

async function main() {
  const { orgId } = await getDemoOrgAndUser()

  const [source] = await sql<{ id: string }[]>`
    insert into marketing_sources (org_id, adapter_id, name, is_demo_data)
    values (${orgId}, 'demo-google-trends', 'Demo Google Trends feed', true)
    returning id
  `

  const rawItems = await demoGoogleTrendsAdapter.fetch()
  const insertedItems: InsertedItem[] = []
  for (const item of rawItems) {
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
      returning id
    `
    insertedItems.push({ ...item, id: row.id })
  }

  const [runRow] = await sql<{ id: string }[]>`
    insert into marketing_research_runs (org_id, adapter_id, completed_at, status, items_ingested, is_demo_data, notes)
    values (${orgId}, 'demo-google-trends', now(), 'completed', ${insertedItems.length}, true, 'Seed script run.')
    returning id
  `

  const clusterDefs = [
    {
      title: 'Two-way appointment confirmations reduce no-shows',
      summary:
        'Search interest and industry chatter both point to two-way confirmation flows outperforming one-way reminders.',
      topicClassification: 'patient-communication',
      matchesTopic: 'no-shows',
    },
    {
      title: 'AI scheduling adoption is accelerating in dental practices',
      summary:
        'Multiple signals show growing practice-level adoption of AI-assisted scheduling and diagnostics tools.',
      topicClassification: 'practice-technology',
      matchesTopic: 'ai-scheduling',
    },
  ]

  const clusterResults: { id: string; def: (typeof clusterDefs)[number] }[] = []
  for (const def of clusterDefs) {
    const [cluster] = await sql<{ id: string }[]>`
      insert into marketing_trend_clusters (org_id, title, summary, topic_classification, is_demo_data)
      values (${orgId}, ${def.title}, ${def.summary}, ${def.topicClassification}, true)
      returning id
    `

    const matchingItems = insertedItems.filter((i) => i.topicClassification.includes(def.matchesTopic))
    for (const item of matchingItems) {
      await sql`insert into marketing_trend_cluster_items (cluster_id, source_item_id) values (${cluster.id}, ${item.id})`
    }

    const avgDental = matchingItems.length
      ? matchingItems.reduce((s, i) => s + i.dentalRelevance, 0) / matchingItems.length
      : 50
    const avgHealthcare = matchingItems.length
      ? matchingItems.reduce((s, i) => s + i.healthcareRelevance, 0) / matchingItems.length
      : 50
    const score = computeTrendScore({
      dentalHealthcareRelevance: (avgDental + avgHealthcare) / 2,
      daysSinceMostRecentItem: 0,
      evidenceStrength: 55, // unverified/simulated demo signal, not verified fact
      distinctSourceCount: Math.max(1, matchingItems.length),
      storyPotential: 75,
      learnedInterestFit: 30,
    })

    await sql`
      insert into marketing_trend_scores (
        org_id, cluster_id, total_score, dental_healthcare_relevance_score, momentum_recency_score,
        evidence_strength_score, cross_source_confirmation_score, story_potential_score,
        learned_interest_fit_score, explanation
      ) values (
        ${orgId}, ${cluster.id}, ${score.total}, ${Math.round(score.breakdown.dentalHealthcareRelevance)},
        ${Math.round(score.breakdown.momentumRecency)}, ${Math.round(score.breakdown.evidenceStrength)},
        ${Math.round(score.breakdown.crossSourceConfirmation)}, ${Math.round(score.breakdown.storyPotential)},
        ${Math.round(score.breakdown.learnedInterestFit)}, ${score.explanation}
      )
    `

    clusterResults.push({ id: cluster.id, def })
  }

  const existingOpportunityTexts: { id: string; text: string }[] = []
  const opportunityIds: string[] = []
  let firstPracticalAngleForContent: GeneratedAngle | null = null
  let firstOpportunityTitle = ''

  for (const { id: clusterId, def } of clusterResults) {
    const generated = await generateAngles({
      orgId,
      clusterTitle: def.title,
      clusterSummary: def.summary,
      evidenceExcerpts: [],
      existingOpportunityTexts,
    })

    const [opportunity] = await sql<{ id: string }[]>`
      insert into marketing_story_opportunities (org_id, cluster_id, title, signal_summary, is_demo_data)
      values (${orgId}, ${clusterId}, ${generated.title}, ${generated.signalSummary}, true)
      returning id
    `
    opportunityIds.push(opportunity.id)

    for (const angle of generated.angles) {
      await sql`
        insert into marketing_story_angles (org_id, opportunity_id, angle_type, structure, applied_preference_notes)
        values (${orgId}, ${opportunity.id}, ${angle.angleType}, ${sql.json(angle.structure)}, ${sql.json(angle.appliedPreferenceNotes)})
      `
      if (!firstPracticalAngleForContent && angle.angleType === 'practical') {
        firstPracticalAngleForContent = angle
        firstOpportunityTitle = generated.title
      }
    }

    existingOpportunityTexts.push({ id: opportunity.id, text: `${generated.title} ${generated.signalSummary}` })
  }

  if (firstPracticalAngleForContent) {
    const draft = await generateContent({
      orgId,
      format: 'linkedin_post',
      opportunityTitle: firstOpportunityTitle,
      angle: firstPracticalAngleForContent,
      sourceMaterialLinks: insertedItems.slice(0, 2).map((i) => i.sourceUrl),
    })
    const [firstAngleRow] = await sql<{ id: string }[]>`
      select id from marketing_story_angles where opportunity_id = ${opportunityIds[0]} limit 1
    `
    await sql`
      insert into marketing_content_drafts (
        org_id, opportunity_id, angle_id, format, audience, objective, main_idea,
        source_material_links, hook_options, draft_text, alternative_pov,
        claims_requiring_review, suggested_visual, generated_by, is_demo_data
      ) values (
        ${orgId}, ${opportunityIds[0]}, ${firstAngleRow.id}, ${draft.format}, ${draft.audience},
        ${draft.objective}, ${draft.mainIdea}, ${sql.json(draft.sourceMaterialLinks)},
        ${sql.json(draft.hookOptions)}, ${draft.draftText}, ${draft.alternativePov},
        ${sql.json(draft.claimsRequiringReview)}, ${draft.suggestedVisual}, ${draft.generatedBy}, true
      )
    `
  }

  console.log('Marketing seed complete:', {
    sourceItems: insertedItems.length,
    trendClusters: clusterResults.length,
    storyOpportunities: opportunityIds.length,
    researchRun: runRow.id,
  })
  await sql.end({ timeout: 5 })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
