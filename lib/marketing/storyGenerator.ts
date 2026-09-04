/** Ported from marketing_content/lib/story-generator.ts. DB access layer swapped from
 * Drizzle to the raw-SQL getActivePreferences (lib/marketingPreferences.ts); the
 * template/angle logic itself is unchanged. */
import { getActivePreferences } from '../marketingPreferences'
import { checkDuplicate, type DuplicateCheckResult } from './duplicateDetection'
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

export async function generateAngles(input: GenerateAnglesInput): Promise<GenerateAnglesResult> {
  const preferences = await getActivePreferences(input.orgId)
  const avoidClinicalTone = preferences.some((p) => p.key === 'avoid_tag:too_clinical')

  const angles = (['practical', 'strategic', 'human'] as const).map((type) =>
    buildAngle(type, input.clusterTitle, input.clusterSummary, avoidClinicalTone),
  )

  const title = input.clusterTitle
  const signalSummary = input.clusterSummary

  const parsed = StoryOpportunityWithAnglesSchema.parse({ title, signalSummary, angles })

  const duplicateWarning =
    input.existingOpportunityTexts.length > 0
      ? await checkDuplicate(`${title} ${signalSummary}`, input.existingOpportunityTexts, 0.6)
      : null

  return { title: parsed.title, signalSummary: parsed.signalSummary, angles, duplicateWarning }
}
