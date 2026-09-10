/** Per-post "how much are people already talking about this" metric (Andy, 2026-09-10):
 * a single concise number per draft — e.g. "Reddit · 1.2k engagements" — NOT a paragraph.
 *
 * Computed by matching a draft's topic keywords against the weekly-cached real Reddit posts
 * (marketing_reddit_engagement, see lib/marketing/redditEngagement.ts) and summing the real
 * upvotes + comments of every matching post. This is deliberately a plain keyword overlap,
 * not an LLM call: it runs on every queue-page render for ~25 drafts x ~100 cached posts,
 * and it must be deterministic and free. It's an indicator of community interest in the
 * TOPIC, not a measurement of this specific post's performance (that needs the Instagram
 * Graph API, deferred) — labeled as such in the UI.
 *
 * Works retroactively for every existing draft (no per-draft stored data needed), which is
 * why this lives here as a pure function over two lists rather than as a generation-time
 * field: the whole queue gets the metric the moment this ships. */

export interface EngagementSignal {
  /** Sum of real upvotes + comments across matching cached posts. */
  total: number
  /** How many cached posts matched — 0 means no signal, render nothing. */
  matches: number
  /** The single highest-engagement matching post, for the hover title. */
  top: { title: string; subreddit: string; upvotes: number; commentsCount: number } | null
}

// Words that carry no topical meaning and would create false matches across every draft.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'at', 'by', 'with', 'from', 'is',
  'are', 'be', 'it', 'its', 'this', 'that', 'these', 'those', 'as', 'vs', 'versus', 'how', 'why',
  'what', 'when', 'your', 'you', 'we', 'our', 'i', 'my', 'me', 'they', 'their', 'not', 'no', 'but',
  'so', 'if', 'than', 'then', 'into', 'about', 'more', 'most', 'very', 'really', 'just', 'still',
  'importance', 'important', 'matters', 'matter', 'real', 'true', 'truly', 'keeps', 'keep',
  'building', 'build', 'businesses', 'business', 'local', 'small', 'practice', 'practices',
  'marketing', 'growth', 'success', 'people', 'customers', 'customer', 'clients', 'client',
])

function keywords(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 4) continue
    if (STOPWORDS.has(raw)) continue
    // crude singularization so "referrals" matches "referral"
    out.add(raw.endsWith('s') && raw.length > 4 ? raw.slice(0, -1) : raw)
  }
  return out
}

export function formatEngagement(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`
  return String(n)
}

export function computeEngagementSignal(
  draftText: string,
  cached: { postTitle: string; subreddit: string; upvotes: number; commentsCount: number }[],
): EngagementSignal {
  const draftKw = keywords(draftText)
  if (draftKw.size === 0) return { total: 0, matches: 0, top: null }

  let total = 0
  let matches = 0
  let top: EngagementSignal['top'] = null
  for (const post of cached) {
    const postKw = keywords(post.postTitle)
    let overlap = 0
    for (const k of postKw) if (draftKw.has(k)) overlap++
    // Require at least one meaningful shared keyword. One is enough because the stopword list
    // already strips the generic filler that would otherwise match everything.
    if (overlap === 0) continue
    const engagement = post.upvotes + post.commentsCount
    total += engagement
    matches++
    if (!top || engagement > top.upvotes + top.commentsCount) {
      top = { title: post.postTitle, subreddit: post.subreddit, upvotes: post.upvotes, commentsCount: post.commentsCount }
    }
  }
  return { total, matches, top }
}
