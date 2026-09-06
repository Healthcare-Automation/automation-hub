/** Ported from marketing_content/lib/adapters/types.ts and db/schema/stories.ts —
 * shared shapes used across the marketing_* query/logic modules. */

export type SourceType =
  | 'manual' | 'trend_feed' | 'news' | 'social' | 'regulatory' | 'review' | 'newsletter'
  // Added for the real RSS/Atom feed registry (lib/marketing/adapters/feedRegistry.ts) —
  // 'regulatory' above is kept as an alias of 'government' for the demo/manual adapters.
  | 'publication' | 'government' | 'association' | 'video'

export type ReliabilityClassification =
  | 'verified_fact' | 'reported_opinion' | 'anecdote' | 'unverified'

export interface RawItem {
  sourceUrl: string
  title: string
  rawContent: string
  publishedAt: Date | null
  authorOrOrg: string | null
  sourceType: SourceType
  supportingExcerpt: string
  reliabilityClassification: ReliabilityClassification
  dentalRelevance: number
  healthcareRelevance: number
  geographicRelevance: string
  topicClassification: string[]
  isDemoData: boolean
}

export interface SourceAdapter {
  id: string
  fetch(input?: string): Promise<RawItem[]>
}

export class NotImplementedAdapterError extends Error {
  constructor(adapterId: string) {
    super(
      `Adapter "${adapterId}" is a documented stub for a future iteration and is not implemented. ` +
        'It intentionally does not return fabricated data.',
    )
    this.name = 'NotImplementedAdapterError'
  }
}

export type AngleType = 'practical' | 'strategic' | 'human'

export interface StoryAngleStructure {
  audience: string
  recognizableMoment: string
  tensionOrMisconception: string
  evidence: string
  ourInterpretation: string
  whyItMatters: string
  takeaway: string
  closingThoughtCta: string
  isHypothetical: boolean
}

export interface GeneratedAngle {
  angleType: AngleType
  structure: StoryAngleStructure
  appliedPreferenceNotes: string[]
}

export type ContentFormat =
  | 'linkedin_post' | 'video_script' | 'carousel' | 'newsletter'
  | 'discussion_prompt' | 'founder_commentary'

export type FeedbackTargetType = 'story_opportunity' | 'story_angle' | 'content_draft'

export type PreferenceStatus = 'active' | 'temporary' | 'reset'
