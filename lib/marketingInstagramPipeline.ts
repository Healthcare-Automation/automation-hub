import { generateInstagramPost } from './marketing/instagramGenerator'
import { generateStatCardImage } from './marketing/imageGenerator'
import { getRecentInstagramDraftsContext, insertInstagramDraft, setInstagramDraftImage } from './marketingQueries'

/** Orchestrates one Instagram content queue generation run (INSTAGRAM_QUEUE_BRIEF.md):
 * pull recent-draft context, generate one grounded post, insert it as a draft. Called by
 * scripts/generate-instagram-content.ts (cron/manual entrypoint), one draft per run —
 * the Mon/Wed/Fri Modal schedule is what produces the ~3 posts/week cadence, not a batch
 * inside a single run.
 *
 * Image generation (INSTAGRAM_IMAGE_BRIEF.md) runs immediately after the draft insert and
 * is best-effort: any failure is caught and logged here, never allowed to fail the run —
 * the draft is already saved with a real id by that point, so losing the image is far
 * better than losing the draft. */

export interface InstagramGenerationResult {
  draftId: string | null
  skippedReason: string | null
}

export async function runInstagramGeneration(orgId: string): Promise<InstagramGenerationResult> {
  const recent = await getRecentInstagramDraftsContext(orgId)
  const generated = await generateInstagramPost(recent)
  if (!generated) {
    return { draftId: null, skippedReason: 'Generation failed (no LLM provider, research, or synthesis step returned usable output) — see logs.' }
  }

  const draftId = await insertInstagramDraft({
    orgId,
    mainIdea: generated.fields.mainIdea,
    audience: generated.fields.audience,
    objective: generated.fields.objective,
    caption: generated.fields.caption,
    hookLine: generated.fields.hookLine,
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

  try {
    const image = await generateStatCardImage({
      stylePrompt: generated.fields.imagePrompt,
      statOrQuote: generated.fields.hookLine,
      citationSource: generated.sourceUrls[0] ?? null,
    })
    if (image) {
      await setInstagramDraftImage(draftId, image.bytes)
    }
  } catch (err) {
    console.error('Instagram image generation/storage failed (draft saved without image):', err instanceof Error ? err.message : err)
  }

  return { draftId, skippedReason: null }
}
