/** Instagram content queue generation (INSTAGRAM_QUEUE_BRIEF.md). Pure LLM logic only —
 * no DB access here (see lib/marketingInstagramPipeline.ts for the orchestration: reading
 * recent-draft context, calling this, and inserting the result). Two LLM passes per run:
 *   1. planTopic — picks one angle to research this run, biased away from recently covered
 *      fingerprints and toward/away from what past approve/disapprove feedback favored.
 *   2. synthesizeDraft — turns grounded web-research text + real citations into the actual
 *      Instagram draft (including a multi-slide carousel plan, see slidePlan below). Every
 *      citable claim must trace back to researchWithWebSearch's own citations (never the
 *      model's unverified prose) — see the sourceMaterialLinks handling in
 *      lib/marketingInstagramPipeline.ts, which uses the citation list directly rather
 *      than trusting the model to restate URLs.
 */
import { z } from 'zod'
import { completeJSON, hasLLMProvider } from './llm'
import { researchWithWebSearch, type WebSearchCitation } from './webSearch'
import { INSTAGRAM_SENTIMENT_TAGS } from './types'

/** Seed themes (INSTAGRAM_QUEUE_BRIEF.md section "Generation pipeline", step 2). The
 * generator is expected to find new angles/data within these over time, or adjacent ones
 * it discovers — this list is a starting point, not a hard boundary. */
export const INSTAGRAM_SEED_THEMES = [
  'Content that is already popping off for practice-type/local-business Instagram accounts',
  'Google Business Profile wins discovery, but a website still wins verification/trust — a nuanced "websites are overrated" angle, not an overclaim',
  'AI tools (Claude/ChatGPT) making ad creation and marketing manageable for small practices',
  'Ranking marketing channels by real-world effectiveness — ads vs. referrals vs. community vs. reviews',
  'Why ads are good but not optimal — rising cost/competition, cited CPC/CPM data',
  'Myth-busting the local-marketing landscape — SEO industry skepticism, the review-to-revenue link, AI reshaping local search',
] as const

export interface RecentDraftContext {
  mainIdea: string
  sentimentTags: string[]
  createdAt: string
  reviewTag: 'approved' | 'disapproved' | null
  freeText: string | null
  notes: string | null
}

export interface TopicPlan {
  topic: string
  searchQuery: string
  angleSummary: string
}

const TopicPlanSchema = z.object({
  topic: z.string().min(1),
  searchQuery: z.string().min(1),
  angleSummary: z.string().min(1),
})

const PLANNING_SYSTEM_PROMPT =
  'You plan Instagram content for UZU Studio, a marketing/ops partner for local practice-type ' +
  'businesses (dental, healthcare-adjacent, and similar service practices). You are choosing ONE ' +
  'specific angle to research and post about today. Favor familiar, relatable human truths over ' +
  'novel or surprising data points — something the reader already half-believes and will feel seen ' +
  'by, not something meant to shock or impress. Nothing "crazy new" for its own sake. Respond with ' +
  'ONLY a JSON object: {"topic": string (short label), "searchQuery": string (a real, specific web ' +
  'search query that would surface current, citable data for this angle), "angleSummary": string ' +
  '(1-2 sentences on the specific take/hook for this post)}. No prose or markdown fences outside the JSON.'

function buildPlanningPrompt(recent: RecentDraftContext[]): string {
  const lines = [
    'Seed themes to draw from (find a fresh angle within one of these, or an adjacent angle you discover):',
    ...INSTAGRAM_SEED_THEMES.map((t, i) => `${i + 1}. ${t}`),
    '',
  ]
  if (recent.length > 0) {
    lines.push('Angles already covered recently (pick something meaningfully different from all of these):')
    for (const r of recent.slice(0, 20)) {
      const feedback = r.reviewTag ? ` [${r.reviewTag}${r.freeText ? `: ${r.freeText}` : ''}]` : ''
      lines.push(`- ${r.mainIdea}${feedback}`)
    }
    lines.push('')
    const approved = recent.filter((r) => r.reviewTag === 'approved')
    const disapproved = recent.filter((r) => r.reviewTag === 'disapproved')
    if (approved.length > 0) {
      lines.push(`Past approved posts skewed toward: ${approved.map((r) => r.sentimentTags.join('/')).join(', ')}. Lean into what's working.`)
    }
    if (disapproved.length > 0) {
      lines.push(`Past disapproved posts: ${disapproved.map((r) => r.mainIdea).join(' | ')}. Avoid repeating whatever made these weak.`)
    }
  } else {
    lines.push('No prior posts yet — pick any strong angle from the seed themes.')
  }
  return lines.join('\n')
}

/** Never throws — returns null on any failure so the caller can skip this run cleanly
 * rather than inserting a low-quality or fabricated draft. */
export async function planTopic(recent: RecentDraftContext[]): Promise<TopicPlan | null> {
  if (!hasLLMProvider()) return null
  try {
    return await completeJSON({ system: PLANNING_SYSTEM_PROMPT, prompt: buildPlanningPrompt(recent) }, TopicPlanSchema)
  } catch (err) {
    console.error('Instagram topic planning failed:', err instanceof Error ? err.message : err)
    return null
  }
}

// ---------- Carousel slide plan ----------
// Mirrors lib/marketing/slideTemplates.ts's SlideKind/*SlideInput shapes (that module owns
// the rendered visual form; this schema owns what the LLM is allowed to produce). Kept as a
// separate, slightly looser shape here (plain strings, no shared import) so this module has
// zero dependency on the rendering layer — slideRenderer.ts is the only place that couples
// the two, via a small mapping in marketingInstagramPipeline.ts.

const HookSlidePlanSchema = z.object({
  kind: z.literal('hook'),
  kicker: z.string().min(1),
  headline: z.string().min(1),
  subhead: z.string().nullable(),
})

const DataSlidePlanSchema = z.object({
  kind: z.literal('data'),
  kicker: z.string().min(1),
  statValue: z.string().min(1),
  statContext: z.string().min(1),
  supportingLine: z.string().nullable(),
})

const CtaSlidePlanSchema = z.object({
  kind: z.literal('cta'),
  kicker: z.string().min(1),
  headline: z.string().min(1),
  body: z.string().min(1),
})

const SlidePlanSchema = z.object({
  slides: z
    .array(z.discriminatedUnion('kind', [HookSlidePlanSchema, DataSlidePlanSchema, CtaSlidePlanSchema]))
    .min(3)
    .max(4),
})

export type HookSlidePlan = z.infer<typeof HookSlidePlanSchema>
export type DataSlidePlan = z.infer<typeof DataSlidePlanSchema>
export type CtaSlidePlan = z.infer<typeof CtaSlidePlanSchema>
export type SlidePlanEntry = z.infer<typeof SlidePlanSchema>['slides'][number]
export type SlidePlan = z.infer<typeof SlidePlanSchema>

export interface InstagramDraftFields {
  mainIdea: string
  audience: string
  objective: string
  caption: string
  hookLine: string
  coreStat: string
  hashtags: string[]
  sentimentTags: string[]
  impactScore: number
  impactScoreReasoning: string
  imagePrompt: string
  slidePlan: SlidePlan
  notes: string
  claimsRequiringReview: string[]
}

const InstagramDraftSchema = z.object({
  mainIdea: z.string().min(1),
  audience: z.string().min(1),
  objective: z.string().min(1),
  caption: z.string().min(1),
  hookLine: z.string().min(1),
  coreStat: z.string().min(1),
  hashtags: z.array(z.string()).min(10).max(35),
  sentimentTags: z.array(z.enum(INSTAGRAM_SENTIMENT_TAGS)).min(1),
  impactScore: z.number().int().min(0).max(100),
  impactScoreReasoning: z.string().min(1),
  imagePrompt: z.string().min(1),
  slidePlan: SlidePlanSchema,
  notes: z.string(),
  claimsRequiringReview: z.array(z.string()),
})

const SYNTHESIS_SYSTEM_PROMPT = [
  'You write Instagram content for UZU Studio (a marketing/ops partner for local practice-type ',
  'businesses). Every factual claim, stat, or quote you use MUST come from the "Research" text ',
  'and citations given to you below — never invent or embellish a number, study, or quote. If the ',
  'research is thin or has no real citation, write educational/qualitative content instead of a ',
  'stat-driven post, and say so plainly in the notes field (do not present speculation as fact).\n',

  'Tone (Andy, 2026-09-08): write to resonate emotionally, not to impress. Favor content that draws ',
  'on a genuinely relatable, human truth the reader already half-knows — the goal is recognition ',
  '("yes, exactly, that\'s so true"), not novelty ("wow, I didn\'t know that"). Prefer familiar, ',
  'resonant observations about people and relationships (why patients trust who they trust, what ',
  'actually makes someone feel cared for, why word-of-mouth works) over impressive-sounding or ',
  'contrarian data points for their own sake — nothing "crazy new" or attention-grabbing just to be ',
  'surprising.\n',

  'Caption style: hook-first (the reader decides in the first line) and written the way a thoughtful ',
  'person would actually talk, not the way a brand would talk — warm, plain, a little vulnerable, no ',
  'jargon. One clear teaching point, the cited stat/quote worked in naturally as supporting evidence ',
  'for the human point (never the headline itself), and a soft CTA that positions UZU credibly — ',
  'never a hard sell. Hashtags: 15-30, a mix of broad and niche, no spam/irrelevant tags.\n',

  'NEVER write phrases like "studies show", "research shows", "data reveals", or "experts say" unless ',
  'a specific citation from the Research section backs that exact claim — invoking authority you ',
  'don\'t have is its own form of fabrication, even if you also disclose it in notes. If you have no ',
  'real citation, write in your own observational/experiential voice instead (no invoked authority).\n',

  'impactScore is YOUR OWN honest 0-100 estimate of viral/engagement potential, not a precise ',
  'measurement — impactScoreReasoning must explain the estimate briefly.\n',

  'coreStat is the SINGLE most concrete, resonant, shareable data point or short verbatim quote from ',
  'the research — it must contain an actual number, percentage, dollar figure, or a punchy verbatim ',
  'quote (NOT a rephrased question, NOT a generic teaser like "wondering which X works best?"). ',
  'Example of a GOOD coreStat: "Referred patients accept treatment plans at 40% higher rates." ',
  'Example of a BAD coreStat (reject this style): "Wondering which marketing channels work best in 2023?"\n',

  'NEVER include a specific calendar year (2023, 2024, 2025, etc.) anywhere in coreStat, hookLine, ',
  'slidePlan, or imagePrompt — evergreen phrasing only ("today", "right now", or no time reference at ',
  'all), since these graphics must not read as dated the week or month after they are generated. If ',
  'the research itself is about a dated event, keep the year out of the rendered stat and mention it ',
  'only in the caption body if truly necessary.\n',

  'slidePlan describes a 3-4 slide Instagram carousel that tells ONE coherent story, warm and human ',
  '(not a sales deck): slide 1 is "hook" (a short, relatable, emotionally resonant line — the thing ',
  'the reader already half-believes, stated plainly, plus an optional one-line subhead); slide(s) 2 ',
  '(and optionally 3) are "data" (each folds ONE concrete stat/quote into a plain human SENTENCE, not ',
  'a giant standalone number — the stat should feel like supporting evidence for a human point, with ',
  'an optional short supportingLine underneath); the final slide is "cta" (a warm, non-pushy headline ',
  'plus 1-2 sentences of body positioning UZU credibly). Each slide also needs a short "kicker" label ',
  '(a soft, lowercase, non-corporate phrase like "something we noticed" or "a gentle nudge" — never ',
  'ALL CAPS, never a cold category label like "MARKETING DATA").\n',

  'Respond with ONLY a JSON object: {"mainIdea": string (short, used to detect duplicate angles across ',
  'runs), "audience": string, "objective": string, "caption": string (the full IG caption, hook-first), ',
  '"hookLine": string (the caption\'s first line, standalone), "coreStat": string (the concrete ',
  'number/quote per the rules above, no calendar year), "hashtags": [string, ...], "sentimentTags": ',
  `[string, ...] (from: ${INSTAGRAM_SENTIMENT_TAGS.join(', ')}), "impactScore": number, `,
  '"impactScoreReasoning": string, "imagePrompt": string (legacy field, kept for backward compat — a ',
  'one-line visual mood description, not used by the current carousel renderer), "slidePlan": ',
  '{"slides": [{"kind": "hook", "kicker": string, "headline": string, "subhead": string | null}, ',
  '{"kind": "data", "kicker": string, "statValue": string (short, e.g. "40%" or "40% higher"), ',
  '"statContext": string (completes the sentence started by statValue), "supportingLine": string | ',
  'null}, ..., {"kind": "cta", "kicker": string, "headline": string, "body": string}]} (3-4 slides ',
  'total: exactly one hook, 1-2 data, exactly one cta, in that order), "notes": string (flag ',
  'speculative/thin-evidence claims here; empty string if none), "claimsRequiringReview": [string, ...] ',
  '(any claim that still needs a citation it doesn\'t have — empty array if none)}. No prose or ',
  'markdown fences outside the JSON object.',
].join('')

function buildSynthesisPrompt(plan: TopicPlan, researchText: string, citations: WebSearchCitation[], recent: RecentDraftContext[]): string {
  const lines = [
    `Topic: ${plan.topic}`,
    `Angle: ${plan.angleSummary}`,
    '',
    'Research (grounded web search results — the only source of facts you may use):',
    researchText,
    '',
    citations.length > 0
      ? `Citations available: ${citations.map((c) => `${c.title} — ${c.url}`).join(' | ')}`
      : 'No citations were returned for this search — treat all claims as unverified and write accordingly (flag in notes).',
  ]
  const disapproved = recent.filter((r) => r.reviewTag === 'disapproved')
  if (disapproved.length > 0) {
    lines.push('', `Avoid whatever made these past posts weak: ${disapproved.map((r) => r.freeText || r.mainIdea).join(' | ')}`)
  }
  return lines.join('\n')
}

/** Never throws — returns null on any failure (no LLM key, request failure, schema
 * mismatch) so the caller skips this run rather than inserting bad data. */
export async function synthesizeDraft(
  plan: TopicPlan,
  researchText: string,
  citations: WebSearchCitation[],
  recent: RecentDraftContext[],
): Promise<InstagramDraftFields | null> {
  if (!hasLLMProvider()) return null
  try {
    return await completeJSON(
      { system: SYNTHESIS_SYSTEM_PROMPT, prompt: buildSynthesisPrompt(plan, researchText, citations, recent) },
      InstagramDraftSchema,
    )
  } catch (err) {
    console.error('Instagram draft synthesis failed:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Deterministic short slug of the core claim+angle, used to bias future runs away from
 * near-duplicate topics (see planTopic's "already covered recently" list). Not a uniqueness
 * key — just a normalized keyword fingerprint a future dedupe pass could compare across runs. */
export function contentFingerprint(mainIdea: string): string {
  return mainIdea
    .toLowerCase()
    .slice(0, 80)
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

export interface GeneratedInstagramPost {
  fields: InstagramDraftFields
  sourceUrls: string[]
  fingerprint: string
}

// Belt-and-suspenders against the model inventing an authority it doesn't have — the system
// prompt forbids this, but when there are zero real citations, also refuse the draft outright
// rather than trust the instruction alone.
const UNEARNED_AUTHORITY_PATTERN = /\b(studies|research|data|reports?|surveys?|experts?)\s+(show|shows|reveal|reveals|indicate|indicates|say|says|suggest|suggests|confirm|confirms)\b/i

/** Full generation pass: plan a topic, research it, synthesize the draft. Returns null
 * (never throws) if any stage fails or produces nothing usable — the caller must not insert
 * a partial/fabricated row. */
export async function generateInstagramPost(recent: RecentDraftContext[]): Promise<GeneratedInstagramPost | null> {
  const plan = await planTopic(recent)
  if (!plan) return null

  const research = await researchWithWebSearch(plan.searchQuery)
  if (!research) return null

  const fields = await synthesizeDraft(plan, research.text, research.citations, recent)
  if (!fields) return null

  if (research.citations.length === 0 && UNEARNED_AUTHORITY_PATTERN.test(fields.caption)) {
    console.error('Instagram draft rejected: invoked authority ("studies show" etc.) with zero real citations.')
    return null
  }

  // Deterministic, not left to the model to remember: any draft with zero real citations is
  // explicitly tagged so the review queue always surfaces "no hard stat behind this" rather
  // than letting it silently read the same as a cited, data-driven post.
  const sentimentTags =
    research.citations.length === 0 && !fields.sentimentTags.includes('uncited_educational')
      ? [...fields.sentimentTags, 'uncited_educational' as const]
      : fields.sentimentTags

  return {
    fields: { ...fields, sentimentTags },
    sourceUrls: research.citations.map((c) => c.url),
    fingerprint: contentFingerprint(fields.mainIdea),
  }
}
