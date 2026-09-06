/** Ported from marketing_content/lib/content-generator.ts. DB access layer swapped from
 * Drizzle to the raw-SQL getActivePreferences; the deterministic template stays the
 * fallback (buildLinkedInPost/buildVideoScript, unchanged). When OPENAI_API_KEY is set,
 * generateContent now asks the LLM for the full structured draft (hooks, alternative POV,
 * claims requiring review, suggested visual) via JSON mode, validated with
 * LLMContentDraftSchema below, per MARKETING_V1_BRIEF.md section 3 — not just the plain
 * draft text. See /marketing/settings for which mode produced a given draft. */
import { z } from 'zod'
import { getActivePreferences } from '../marketingPreferences'
import { ContentDraftSchema } from './zodSchemas'
import type { ContentFormat, GeneratedAngle } from './types'
import { completeJSON, hasLLMProvider } from './llm'

export interface GenerateContentInput {
  orgId: string
  format: Extract<ContentFormat, 'linkedin_post' | 'video_script'>
  opportunityTitle: string
  angle: GeneratedAngle
  sourceMaterialLinks: string[]
}

function claimsNeedingCitation(structure: GeneratedAngle['structure']): string[] {
  const claims: string[] = []
  if (/\bdata shows|\bstudy|\bsurvey|\breport\b/i.test(structure.evidence) && structure.evidence.length < 40) {
    claims.push(`Evidence statement is asserted without a linkable citation: "${structure.evidence}"`)
  }
  if (structure.isHypothetical && !structure.recognizableMoment.includes('Example scenario')) {
    claims.push('Hypothetical moment is not labeled as an example scenario.')
  }
  return claims
}

function buildLinkedInPost(angle: GeneratedAngle, avoidPromotional: boolean): string {
  const cta = avoidPromotional
    ? angle.structure.closingThoughtCta
    : `${angle.structure.closingThoughtCta} Book a free consult to see how we can help.`
  return [
    angle.structure.recognizableMoment,
    '',
    angle.structure.tensionOrMisconception,
    '',
    `Here's what we're seeing: ${angle.structure.evidence}`,
    '',
    angle.structure.ourInterpretation,
    '',
    `Why it matters: ${angle.structure.whyItMatters}`,
    '',
    `Takeaway: ${angle.structure.takeaway}`,
    '',
    cta,
  ].join('\n')
}

function buildVideoScript(angle: GeneratedAngle): string {
  return [
    `[HOOK] ${angle.structure.recognizableMoment}`,
    `[TENSION] ${angle.structure.tensionOrMisconception}`,
    `[EVIDENCE] ${angle.structure.evidence}`,
    `[INTERPRETATION] ${angle.structure.ourInterpretation}`,
    `[WHY IT MATTERS] ${angle.structure.whyItMatters}`,
    `[TAKEAWAY / CTA] ${angle.structure.takeaway} ${angle.structure.closingThoughtCta}`,
  ].join('\n')
}

function buildDraftPrompt(input: GenerateContentInput, avoidPromotional: boolean): string {
  const formatInstruction =
    input.format === 'linkedin_post'
      ? 'Write a LinkedIn post (150-250 words, no hashtags, no emoji).'
      : 'Write a short-form video script with bracketed section labels like [HOOK], [TENSION], [EVIDENCE], [TAKEAWAY].'
  return [
    formatInstruction,
    avoidPromotional ? 'Do not include a sales pitch or promotional call-to-action.' : '',
    `Audience: ${input.angle.structure.audience}`,
    `Recognizable moment: ${input.angle.structure.recognizableMoment}`,
    `Tension or misconception: ${input.angle.structure.tensionOrMisconception}`,
    `Evidence (do not embellish beyond this): ${input.angle.structure.evidence}`,
    `Our interpretation: ${input.angle.structure.ourInterpretation}`,
    `Why it matters: ${input.angle.structure.whyItMatters}`,
    `Takeaway: ${input.angle.structure.takeaway}`,
    `Closing thought / CTA: ${input.angle.structure.closingThoughtCta}`,
    input.angle.structure.isHypothetical
      ? 'This moment is hypothetical — keep it explicitly labeled "Example scenario" and never present it as a real patient case.'
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

const SYSTEM_PROMPT =
  'You write marketing content for healthcare practices (dental-focused). Never invent patient ' +
  'cases, quotes, or statistics beyond what is given. Never give individualized medical advice. ' +
  'Distinguish evidence from interpretation. Keep the tone editorial, not promotional unless asked. ' +
  'Respond with ONLY a JSON object: {"hookOptions": [string, ...] (at least 2), ' +
  '"draftText": string, "alternativePov": string (a credible counter-argument or edge case), ' +
  '"claimsRequiringReview": [string, ...] (any claim in the draft that needs a citation it doesn\'t ' +
  'have — empty array if none), "suggestedVisual": string|null}. No prose or markdown fences ' +
  'outside the JSON object.'

const LLMContentDraftSchema = z.object({
  hookOptions: z.array(z.string()).min(1),
  draftText: z.string().min(1),
  alternativePov: z.string().min(1),
  claimsRequiringReview: z.array(z.string()),
  suggestedVisual: z.string().nullable(),
})

/** Returns null (never throws) on any failure so the caller falls back to the template. */
async function generateDraftWithLLM(
  input: GenerateContentInput,
  avoidPromotional: boolean,
): Promise<z.infer<typeof LLMContentDraftSchema> | null> {
  if (!hasLLMProvider()) return null
  try {
    return await completeJSON({ system: SYSTEM_PROMPT, prompt: buildDraftPrompt(input, avoidPromotional) }, LLMContentDraftSchema)
  } catch {
    return null
  }
}

export async function generateContent(input: GenerateContentInput) {
  const preferences = await getActivePreferences(input.orgId)
  const avoidPromotional = preferences.some((p) => p.key === 'avoid_tag:too_promotional')

  const llmDraft = await generateDraftWithLLM(input, avoidPromotional)
  const generatedBy: 'template' | 'llm' = llmDraft ? 'llm' : 'template'

  const draftText =
    llmDraft?.draftText ??
    (input.format === 'linkedin_post' ? buildLinkedInPost(input.angle, avoidPromotional) : buildVideoScript(input.angle))
  const hookOptions =
    llmDraft?.hookOptions ?? [input.angle.structure.recognizableMoment, `${input.angle.structure.takeaway} Here's why.`]
  const alternativePov =
    llmDraft?.alternativePov ??
    'Some practices will argue reminders alone are sufficient — worth acknowledging that this only holds for low no-show baselines.'
  const claimsRequiringReview = llmDraft?.claimsRequiringReview ?? claimsNeedingCitation(input.angle.structure)
  const suggestedVisual =
    llmDraft?.suggestedVisual ??
    (input.format === 'video_script' ? 'Split-screen: cluttered reminder text vs. one-tap confirmation UI.' : null)

  const fields = {
    format: input.format,
    audience: input.angle.structure.audience,
    objective:
      input.angle.angleType === 'human'
        ? 'Build trust through a relatable, human framing of the issue.'
        : 'Establish credibility and prompt reflection on an operational pattern.',
    mainIdea: input.angle.structure.ourInterpretation,
    sourceMaterialLinks: input.sourceMaterialLinks,
    hookOptions,
    draftText,
    alternativePov,
    claimsRequiringReview,
    suggestedVisual,
  }

  return { ...ContentDraftSchema.parse(fields), generatedBy }
}
