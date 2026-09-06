/** Ported from marketing_content/lib/story-generator.ts. DB access layer swapped from
 * Drizzle to the raw-SQL getActivePreferences (lib/marketingPreferences.ts). The template
 * angle logic (buildAngle) is unchanged and stays the fallback; generateAngles now also
 * tries an LLM path first when OPENAI_API_KEY is set (MARKETING_V1_BRIEF.md section 3),
 * reusing StoryOpportunityWithAnglesSchema to validate the LLM's structured JSON output —
 * the same schema that already enforces "hypothetical moments must say Example scenario". */
import { getActivePreferences } from '../marketingPreferences'
import { checkDuplicate, type DuplicateCheckResult } from './duplicateDetection'
import { completeJSON, hasLLMProvider } from './llm'
import { StoryOpportunityWithAnglesSchema } from './zodSchemas'
import type { AngleType, GeneratedAngle, StoryAngleStructure } from './types'

export interface GenerateAnglesInput {
  clusterTitle: string
  clusterSummary: string
  evidenceExcerpts: string[]
  orgId: string
  existingOpportunityTexts: { id: string; text: string }[]
}

export interface GenerateAnglesResult {
  title: string
  signalSummary: string
  angles: GeneratedAngle[]
  duplicateWarning: DuplicateCheckResult | null
  generatedBy: 'template' | 'llm'
}

function buildAngle(
  angleType: AngleType,
  clusterTitle: string,
  clusterSummary: string,
  avoidClinicalTone: boolean,
): GeneratedAngle {
  const notes: string[] = []
  const interpretationClinical =
    'Analysis of the underlying data indicates this pattern is attributable to workflow friction rather than patient forgetfulness.'
  const interpretationWarm = "Put simply: patients aren't forgetting, they're getting stuck on a clunky confirmation step."

  const ourInterpretation = avoidClinicalTone ? interpretationWarm : interpretationClinical
  if (avoidClinicalTone) {
    notes.push('Shifted to plain-language tone: 3+ feedback events tagged too_clinical on this org.')
  }

  const byType: Record<AngleType, StoryAngleStructure> = {
    practical: {
      audience: 'General dentists and practice managers running day-to-day scheduling',
      recognizableMoment: `A front-desk team member re-sends the same reminder text for the third time this week about "${clusterTitle}".`,
      tensionOrMisconception: 'The assumption is that more reminders fix no-shows; the data says otherwise.',
      evidence: clusterSummary,
      ourInterpretation,
      whyItMatters: 'Chair-time lost to no-shows is a direct, recoverable revenue line.',
      takeaway: 'Replace one-way reminders with a two-way confirmation step this month.',
      closingThoughtCta: "What's your practice's current confirmation flow look like?",
      isHypothetical: false,
    },
    strategic: {
      audience: 'Multi-location practice owners and DSO operations leads',
      recognizableMoment: `Ops leadership reviews no-show rates across locations and sees the same gap tied to "${clusterTitle}".`,
      tensionOrMisconception: 'Fixing this per-location, ad hoc, misses a systemic operations fix.',
      evidence: clusterSummary,
      ourInterpretation: avoidClinicalTone
        ? 'This is an operations-level fix, not a one-off front-desk tweak.'
        : 'This pattern generalizes across locations, suggesting a systemic operational intervention rather than a site-specific fix.',
      whyItMatters: 'A standardized fix compounds savings across every location, not just one.',
      takeaway: 'Pilot the two-way confirmation flow at one location, then standardize.',
      closingThoughtCta: 'Which location would be the right pilot site?',
      isHypothetical: false,
    },
    human: {
      audience: 'Patients and the front-desk staff who interact with them daily',
      recognizableMoment:
        'Example scenario: a patient meant to reschedule but the reminder text gave no easy way to reply, so the slot just went empty.',
      tensionOrMisconception: "It reads as forgetfulness, but it's really a missing feedback loop.",
      evidence: clusterSummary,
      ourInterpretation: avoidClinicalTone
        ? "Give people an easy way to say 'actually, can we move this' and most of this disappears."
        : 'Providing a low-friction response channel materially reduces this failure mode.',
      whyItMatters: "A smoother confirmation experience respects patients' time as much as the practice's.",
      takeaway: "Add a single reply option ('Reply YES to confirm, NO to reschedule') to your next reminder.",
      closingThoughtCta: 'Would your patients use a one-tap reschedule option?',
      isHypothetical: true,
    },
  }

  return { angleType, structure: byType[angleType], appliedPreferenceNotes: notes }
}

const ANGLE_SYSTEM_PROMPT =
  'You generate three story angles (practical, strategic, human) for a dental/healthcare practice ' +
  'marketing intelligence tool, from a real trend cluster and its evidence excerpts. Rules, ' +
  'non-negotiable: never invent patient cases, quotes, or statistics beyond the evidence given; any ' +
  'hypothetical moment must set the recognizableMoment field to start with the literal text ' +
  '"Example scenario" and isHypothetical must be true, otherwise isHypothetical must be false; ' +
  'ground the evidence field in the supplied excerpts, do not fabricate data or cite a study that ' +
  "was not given; reject generic angles (\"5 ways X\", \"AI is transforming Y\", or advice generic " +
  'to any industry) — every angle must be specific to this cluster. Respond with ONLY a JSON object: ' +
  '{"title": string, "signalSummary": string, "angles": [{"angleType": "practical"|"strategic"|"human", ' +
  '"structure": {"audience": string, "recognizableMoment": string, "tensionOrMisconception": string, ' +
  '"evidence": string, "ourInterpretation": string, "whyItMatters": string, "takeaway": string, ' +
  '"closingThoughtCta": string, "isHypothetical": boolean}}]} — exactly one angle per type, no prose ' +
  'or markdown fences outside the JSON object.'

interface LLMAngleResult {
  title: string
  signalSummary: string
  angles: GeneratedAngle[]
}

/** Returns null (never throws) on any failure — missing key, request error, or a JSON
 * shape that fails schema validation — so the caller falls back to the template angles. */
async function generateAnglesWithLLM(
  input: GenerateAnglesInput,
  avoidClinicalTone: boolean,
): Promise<LLMAngleResult | null> {
  if (!hasLLMProvider()) return null
  try {
    const prompt = [
      `Cluster title: ${input.clusterTitle}`,
      `Cluster summary: ${input.clusterSummary}`,
      avoidClinicalTone
        ? 'Tone constraint: avoid clinical/academic phrasing — 3+ feedback events on this org tagged too_clinical.'
        : '',
      'Evidence excerpts (the ONLY facts you may reference — do not go beyond them):',
      ...input.evidenceExcerpts.slice(0, 8).map((excerpt, i) => `[${i + 1}] ${excerpt}`),
    ]
      .filter(Boolean)
      .join('\n')

    const parsed = await completeJSON({ system: ANGLE_SYSTEM_PROMPT, prompt }, StoryOpportunityWithAnglesSchema)
    const angles: GeneratedAngle[] = parsed.angles.map((angle) => ({
      angleType: angle.angleType,
      structure: angle.structure,
      appliedPreferenceNotes: avoidClinicalTone
        ? ['Shifted to plain-language tone: 3+ feedback events tagged too_clinical on this org.']
        : [],
    }))
    return { title: parsed.title, signalSummary: parsed.signalSummary, angles }
  } catch {
    return null
  }
}

export async function generateAngles(input: GenerateAnglesInput): Promise<GenerateAnglesResult> {
  const preferences = await getActivePreferences(input.orgId)
  const avoidClinicalTone = preferences.some((p) => p.key === 'avoid_tag:too_clinical')

  const llmResult = await generateAnglesWithLLM(input, avoidClinicalTone)
  const generatedBy: 'template' | 'llm' = llmResult ? 'llm' : 'template'

  const title = llmResult?.title ?? input.clusterTitle
  const signalSummary = llmResult?.signalSummary ?? input.clusterSummary
  const angles =
    llmResult?.angles ??
    (['practical', 'strategic', 'human'] as const).map((type) =>
      buildAngle(type, input.clusterTitle, input.clusterSummary, avoidClinicalTone),
    )

  const parsed = StoryOpportunityWithAnglesSchema.parse({
    title,
    signalSummary,
    angles: angles.map(({ angleType, structure }) => ({ angleType, structure })),
  })

  const duplicateWarning =
    input.existingOpportunityTexts.length > 0
      ? await checkDuplicate(`${title} ${signalSummary}`, input.existingOpportunityTexts, 0.6)
      : null

  return { title: parsed.title, signalSummary: parsed.signalSummary, angles, duplicateWarning, generatedBy }
}
