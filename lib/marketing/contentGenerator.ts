/** Ported from marketing_content/lib/content-generator.ts. DB access layer swapped from
 * Drizzle to the raw-SQL getActivePreferences; the template/prompt logic itself is
 * unchanged. Routes through lib/marketing/llm.ts when LLM_API_KEY is configured,
 * otherwise falls back to a deterministic local template — the only place Content
 * Studio output depends on whether a real provider is configured (see /marketing/settings). */
import { getActivePreferences } from '../marketingPreferences'
import { ContentDraftSchema } from './zodSchemas'
import type { ContentFormat, GeneratedAngle } from './types'
import { complete, hasLLMProvider } from './llm'

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
  'Distinguish evidence from interpretation. Keep the tone editorial, not promotional unless asked.'

async function generateDraftText(
  input: GenerateContentInput,
  avoidPromotional: boolean,
): Promise<{ text: string; generatedBy: 'template' | 'llm' }> {
  if (hasLLMProvider()) {
    const result = await complete({ system: SYSTEM_PROMPT, prompt: buildDraftPrompt(input, avoidPromotional) })
    return { text: result.text, generatedBy: 'llm' }
  }
  const text = input.format === 'linkedin_post' ? buildLinkedInPost(input.angle, avoidPromotional) : buildVideoScript(input.angle)
  return { text, generatedBy: 'template' }
}

export async function generateContent(input: GenerateContentInput) {
  const preferences = await getActivePreferences(input.orgId)
  const avoidPromotional = preferences.some((p) => p.key === 'avoid_tag:too_promotional')

  const { text: draftText, generatedBy } = await generateDraftText(input, avoidPromotional)

  const hookOptions = [input.angle.structure.recognizableMoment, `${input.angle.structure.takeaway} Here's why.`]

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
    alternativePov:
      'Some practices will argue reminders alone are sufficient — worth acknowledging that this only holds for low no-show baselines.',
    claimsRequiringReview: claimsNeedingCitation(input.angle.structure),
    suggestedVisual:
      input.format === 'video_script' ? 'Split-screen: cluttered reminder text vs. one-tap confirmation UI.' : null,
  }

  return { ...ContentDraftSchema.parse(fields), generatedBy }
}
