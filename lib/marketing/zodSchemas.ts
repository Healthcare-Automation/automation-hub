/** Ported unchanged from marketing_content/lib/zod-schemas.ts — structured-output
 * validation for story angles and content drafts. The hypothetical/"Example scenario"
 * refinement is the compliance guardrail from BUILD_BRIEF.md: never invent patient
 * cases without explicitly labeling them as hypothetical. */
import { z } from 'zod'

export const StoryAngleStructureSchema = z
  .object({
    audience: z.string().min(1),
    recognizableMoment: z.string().min(1),
    tensionOrMisconception: z.string().min(1),
    evidence: z.string().min(1),
    ourInterpretation: z.string().min(1),
    whyItMatters: z.string().min(1),
    takeaway: z.string().min(1),
    closingThoughtCta: z.string().min(1),
    isHypothetical: z.boolean(),
  })
  .refine((angle) => !angle.isHypothetical || angle.recognizableMoment.includes('Example scenario'), {
    message: 'Hypothetical angles must label the moment "Example scenario" explicitly.',
    path: ['recognizableMoment'],
  })

export const AngleTypeSchema = z.enum(['practical', 'strategic', 'human'])

export const StoryAngleSchema = z.object({
  angleType: AngleTypeSchema,
  structure: StoryAngleStructureSchema,
})

export const StoryOpportunityWithAnglesSchema = z.object({
  title: z.string().min(1),
  signalSummary: z.string().min(1),
  angles: z
    .array(StoryAngleSchema)
    .length(3)
    .refine(
      (angles) => new Set(angles.map((a) => a.angleType)).size === 3,
      'Must contain exactly one practical, one strategic, and one human angle.',
    ),
})

export const ContentDraftSchema = z.object({
  format: z.enum(['linkedin_post', 'video_script']),
  audience: z.string().min(1),
  objective: z.string().min(1),
  mainIdea: z.string().min(1),
  sourceMaterialLinks: z.array(z.string()),
  hookOptions: z.array(z.string()).min(1),
  draftText: z.string().min(1),
  alternativePov: z.string().min(1),
  claimsRequiringReview: z.array(z.string()),
  suggestedVisual: z.string().nullable(),
})
