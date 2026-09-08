/** Renders a carousel's slides via lib/marketing/slideRenderer.ts and orchestrates one
 * Instagram content queue generation run (INSTAGRAM_QUEUE_BRIEF.md): pull recent-draft
 * context, generate one grounded post + slide plan, insert it as a draft, render + store
 * every slide. Called by scripts/generate-instagram-content.ts (cron/manual entrypoint),
 * one draft per run — the Mon/Wed/Fri Modal schedule is what produces the ~3 posts/week
 * cadence, not a batch inside a single run.
 *
 * Carousel rendering (2026-09-08 redesign) runs immediately after the draft insert and is
 * best-effort per slide: any single slide's render failure is caught and logged, never
 * allowed to fail the run or block the other slides — the draft is already saved with a
 * real id by that point, so a partial carousel is far better than losing the draft. */
import { generateInstagramPost, type SlidePlanEntry } from './marketing/instagramGenerator'
import { renderSlideToPng } from './marketing/slideRenderer'
import { pickAccent, type SlideInput } from './marketing/slideTemplates'
import {
  getRecentInstagramDraftsContext,
  insertInstagramDraft,
  insertCarouselSlides,
  type CarouselSlideInsert,
} from './marketingQueries'

export interface InstagramGenerationResult {
  draftId: string | null
  skippedReason: string | null
  slidesRendered: number
}

function toSlideInput(entry: SlidePlanEntry): SlideInput {
  if (entry.kind === 'hook') {
    return { kind: 'hook', kicker: entry.kicker, headline: entry.headline, subhead: entry.subhead }
  }
  if (entry.kind === 'data') {
    return {
      kind: 'data',
      kicker: entry.kicker,
      statValue: entry.statValue,
      statContext: entry.statContext,
      supportingLine: entry.supportingLine,
    }
  }
  return { kind: 'cta', kicker: entry.kicker, headline: entry.headline, body: entry.body }
}

export async function runInstagramGeneration(orgId: string): Promise<InstagramGenerationResult> {
  const recent = await getRecentInstagramDraftsContext(orgId)
  const generated = await generateInstagramPost(recent)
  if (!generated) {
    return {
      draftId: null,
      skippedReason: 'Generation failed (no LLM provider, research, or synthesis step returned usable output) — see logs.',
      slidesRendered: 0,
    }
  }

  const draftId = await insertInstagramDraft({
    orgId,
    mainIdea: generated.fields.mainIdea,
    audience: generated.fields.audience,
    objective: generated.fields.objective,
    caption: generated.fields.caption,
    hookLine: generated.fields.hookLine,
    coreStat: generated.fields.coreStat,
    sourceUrls: generated.sourceUrls,
    hashtags: generated.fields.hashtags,
    sentimentTags: generated.fields.sentimentTags,
    impactScore: generated.fields.impactScore,
    impactScoreReasoning: generated.fields.impactScoreReasoning,
    imagePrompt: generated.fields.imagePrompt,
    notes: generated.fields.notes,
    claimsRequiringReview: generated.fields.claimsRequiringReview,
    fingerprint: generated.fingerprint,
  })

  const slides = generated.fields.slidePlan.slides
  // One accent color for the whole carousel (consistent across slides), seeded off the
  // draft id so it's stable if a slide needs re-rendering later.
  const accent = pickAccent(draftId)
  const toInsert: CarouselSlideInsert[] = []
  for (let i = 0; i < slides.length; i++) {
    const entry = slides[i]
    const input = toSlideInput(entry)
    try {
      const png = await renderSlideToPng(input, { accent, slideIndex: i, slideCount: slides.length })
      if (png) {
        toInsert.push({ slideIndex: i, kind: entry.kind, content: entry as unknown as Record<string, string | null>, imageData: png })
      } else {
        console.error(`Instagram carousel slide ${i} render returned null (draft ${draftId}).`)
      }
    } catch (err) {
      console.error(`Instagram carousel slide ${i} render failed (draft ${draftId}):`, err instanceof Error ? err.message : err)
    }
  }

  if (toInsert.length > 0) {
    try {
      await insertCarouselSlides(draftId, toInsert)
    } catch (err) {
      console.error('Instagram carousel slide storage failed (draft saved without slides):', err instanceof Error ? err.message : err)
      return { draftId, skippedReason: null, slidesRendered: 0 }
    }
  }

  return { draftId, skippedReason: null, slidesRendered: toInsert.length }
}
