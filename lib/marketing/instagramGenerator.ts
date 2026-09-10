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

/** Real Reddit engagement evidence (Sean's feedback, 2026-09-09) — passed in by the caller
 * (lib/marketingInstagramPipeline.ts, which owns DB access) rather than fetched here, to
 * keep this module's "no DB access" boundary intact. See lib/marketing/redditEngagement.ts
 * for how this data is sourced/cached. Optional/empty is a normal, expected state (cache not
 * yet populated, or APIFY_TOKEN unset) — planning must degrade gracefully, never fail. */
export interface EngagementEvidenceItem {
  subreddit: string
  postTitle: string
  upvotes: number
  commentsCount: number
}

/** Real Instagram posts from dental / practice-growth accounts that actually blew up (Andy,
 * 2026-09-10). Same "passed in, never fetched here" boundary as EngagementEvidenceItem. See
 * lib/marketing/instagramEngagement.ts. */
export interface InstagramEvidenceItem {
  account: string
  caption: string
  likes: number
  comments: number
}

export interface TopicPlan {
  topic: string
  searchQuery: string
  angleSummary: string
  /** Which cached engagement-evidence post (if any) this angle was inspired by — a real
   * Reddit thread's title, not a fabricated one. Null when no evidence was available or the
   * angle wasn't tied to a specific post. Surfaced in the draft's notes so the review queue
   * can see WHY an angle was picked, not just that it was. */
  inspiredByPost: string | null
}

const TopicPlanSchema = z.object({
  topic: z.string().min(1),
  searchQuery: z.string().min(1),
  angleSummary: z.string().min(1),
  inspiredByPost: z.string().nullable(),
})

// Rewritten 2026-09-10. The prior prompt said "favor familiar, relatable human truths ...
// nothing crazy new" — Andy's verdict on the output: "2-dimensional and obvious ... not
// meaty enough." The live Instagram sweep the same day shows what actually earns 1.4k-11.7k
// likes in this niche, and it is the opposite of gentle reminders: a pointed question with a
// specific number that makes an owner uncomfortable ("Are you taking on all the risk for a
// 2% margin?", "a job with overhead that collapses the moment you can't show up?", "$6M vs
// 1.5 a block away"), a leadership truth that reassigns blame to the owner (2.5k likes, 228
// comments), or a hard fact drop that provokes argument (insurance stats, 11.7k / 335). The
// pattern is: SPECIFIC + UNCOMFORTABLE + OWNER-DIRECTED. Replicating those angles is
// explicitly fine — Andy: "if we need to replicate a lot of their content that hit, that's
// absolutely fine too."
const PLANNING_SYSTEM_PROMPT =
  'You plan Instagram content for UZU Studio, a marketing/ops partner for local practice-type ' +
  'businesses (dental first, then healthcare-adjacent service practices). Choose ONE angle to research ' +
  'and post about today. The bar is MEATY, not a reminder of what matters. Posts that actually blow up ' +
  'in this niche do one of three things: (1) ask a pointed, uncomfortable question aimed straight at ' +
  'the owner, built around a specific number ("Is your practice actually profitable after you pay ' +
  'yourself, or are you carrying all the risk for a 2% margin?"); (2) state a leadership/ops truth that ' +
  'puts responsibility back on the owner, not the team ("If your team keeps asking what the right way ' +
  'is, that is a leadership problem, not a skill problem"); (3) drop a hard, specific fact that people ' +
  'will argue with in the comments. Generic encouragement, "X is the heartbeat of Y", and "remember ' +
  'that relationships matter" are FAILURES — do not produce them. ' +
  'When real Instagram evidence is provided below (actual posts from dental practice-growth accounts ' +
  'with real like/comment counts), STUDY the highest-engagement ones and replicate the mechanism: the ' +
  'same kind of question, the same directness, the same specificity — adapted, not copied verbatim. ' +
  'Replicating a winning angle is explicitly preferred over inventing a safe new one. Reddit evidence, ' +
  'when present, is secondary color. Set inspiredByPost to the exact caption (first 80 chars) or Reddit ' +
  'title you drew from, or null. Respond with ONLY a JSON object: {"topic": string (short label), ' +
  '"searchQuery": string (a real, specific web search query that would surface a current, citable ' +
  'number for this angle), "angleSummary": string (the exact pointed question or claim this post will ' +
  'make — write it as the post would say it, not a description of it), "inspiredByPost": string | ' +
  'null}. No prose or markdown fences outside the JSON.'

function buildPlanningPrompt(recent: RecentDraftContext[], evidence: EngagementEvidenceItem[], igEvidence: InstagramEvidenceItem[] = []): string {
  const lines = [
    'Seed themes to draw from (find a fresh angle within one of these, or an adjacent angle you discover):',
    ...INSTAGRAM_SEED_THEMES.map((t, i) => `${i + 1}. ${t}`),
    '',
  ]
  if (igEvidence.length > 0) {
    lines.push(
      'REAL INSTAGRAM EVIDENCE — actual posts from dental / practice-growth accounts with real like and comment counts, highest engagement first. This is what this exact audience already rewards. Study the top ones and replicate the mechanism:',
    )
    for (const e of igEvidence.slice(0, 15)) {
      const cap = e.caption.replace(/\s+/g, ' ').replace(/#\w+/g, '').trim().slice(0, 200)
      if (cap.length < 20) continue // hashtag-only captions carry no angle
      lines.push(`- [${e.likes} likes, ${e.comments} comments, @${e.account}] "${cap}"`)
    }
    lines.push('')
  }
  if (evidence.length > 0) {
    lines.push(
      'Reddit evidence (secondary) — real threads with real upvote/comment counts from r/smallbusiness, r/Dentistry, r/marketing, r/Entrepreneur:',
    )
    for (const e of evidence.slice(0, 10)) {
      lines.push(`- [${e.upvotes} upvotes, ${e.commentsCount} comments, r/${e.subreddit}] "${e.postTitle}"`)
    }
    lines.push('')
  }
  if (recent.length > 0) {
    lines.push('Angles already covered recently (pick something meaningfully different from all of these — different TOPIC and, where possible, a different one of the three mechanisms above):')
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
export async function planTopic(
  recent: RecentDraftContext[],
  evidence: EngagementEvidenceItem[] = [],
  igEvidence: InstagramEvidenceItem[] = [],
): Promise<TopicPlan | null> {
  if (!hasLLMProvider()) return null
  try {
    return await completeJSON({ system: PLANNING_SYSTEM_PROMPT, prompt: buildPlanningPrompt(recent, evidence, igEvidence) }, TopicPlanSchema)
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

  // Tone rewritten 2026-09-10. The earlier version ("warm, a little vulnerable ... recognition
  // not novelty ... nothing crazy new ... soft CTA ... gentle nudge") produced captions Andy
  // called "2-dimensional and obvious ... not meaty." Live Instagram data from dental practice-
  // growth accounts (1.4k-11.7k likes) rewards the opposite: direct, specific, uncomfortable,
  // owner-directed. The planner now hands over a pointed angle; this prompt must not sand it
  // back down into encouragement.
  'Tone: direct and specific, written by an operator who has seen inside a lot of practices — not ',
  'a brand, not a cheerleader. Lead with the pointed question or claim from the plan, as-is. Use ',
  'the concrete number early and let it do the work. It is fine — preferred — for the reader to ',
  'feel a little called out. Do NOT soften with "you might be missing out", "just imagine", ',
  '"let\'s explore", "feeling stuck?", hearts, sparkles, or reassurance. No "X is the heartbeat of ',
  'Y". No "remember that relationships matter". One sharp idea, stated plainly, backed by the ',
  'cited number, then a short, confident close that names what UZU actually does about it.\n',

  'Caption style: hook-first — the first line is the pointed question or claim itself, not a warm-up. ',
  'Plain sentences, short paragraphs, no jargon, no emoji. The cited stat is the spine of the post, ',
  'not decoration. Close with one direct line about what UZU does, not a soft invitation. Hashtags: ',
  '15-30, a mix of broad and niche, no spam/irrelevant tags.\n',

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

  'slidePlan describes a 3-4 slide Instagram carousel that makes ONE sharp argument: slide 1 is ',
  '"hook" (the pointed question or claim itself, stated flat — the thing that makes an owner stop ',
  'scrolling; optional one-line subhead that raises the stakes); slide(s) 2 (and optionally 3) are ',
  '"data" (each folds ONE concrete stat/quote into a direct sentence that proves the hook — the ',
  'number is the point, with an optional short supportingLine that says what it means for them); ',
  'the final slide is "cta" (a confident headline plus 1-2 plain sentences on what UZU does about ',
  'exactly this — not a warm invitation). Each slide also needs a short "kicker" label: lowercase, ',
  'specific, a little pointed ("the 2% problem", "what the numbers say", "the part nobody says out ',
  'loud") — never ALL CAPS, never soft filler like "a gentle nudge", never a cold category label ',
  'like "MARKETING DATA").\n',

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
    ...(plan.inspiredByPost
      ? [`This angle is grounded in real engagement evidence — a real, already-resonant post: "${plan.inspiredByPost}". Mention in notes that this angle is backed by real audience reaction, not a guess.`]
      : []),
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
  inspiredByPost: string | null
  /** The real evidence row (with actual upvote/comment counts) matching inspiredByPost, if
   * the model's title matched one of the rows we actually gave it. Null when inspiredByPost
   * is null, or (defensively) if the model returned a title that doesn't match anything we
   * passed in — never fabricate numbers to fill this in. */
  inspiredByEvidence: EngagementEvidenceItem | null
}

// Belt-and-suspenders against the model inventing an authority it doesn't have — the system
// prompt forbids this, but when there are zero real citations, also refuse the draft outright
// rather than trust the instruction alone.
const UNEARNED_AUTHORITY_PATTERN = /\b(studies|research|data|reports?|surveys?|experts?)\s+(show|shows|reveal|reveals|indicate|indicates|say|says|suggest|suggests|confirm|confirms)\b/i

/** Full generation pass: plan a topic, research it, synthesize the draft. Returns null
 * (never throws) if any stage fails or produces nothing usable — the caller must not insert
 * a partial/fabricated row. `evidence` is optional real engagement data (Sean's feedback,
 * 2026-09-09) — an empty array is a normal state (cache not populated / APIFY_TOKEN unset),
 * not an error; planning simply falls back to the seed themes alone. */
export async function generateInstagramPost(
  recent: RecentDraftContext[],
  evidence: EngagementEvidenceItem[] = [],
  igEvidence: InstagramEvidenceItem[] = [],
): Promise<GeneratedInstagramPost | null> {
  const plan = await planTopic(recent, evidence, igEvidence)
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
    inspiredByPost: plan.inspiredByPost,
    inspiredByEvidence: plan.inspiredByPost ? evidence.find((e) => e.postTitle === plan.inspiredByPost) ?? null : null,
  }
}
