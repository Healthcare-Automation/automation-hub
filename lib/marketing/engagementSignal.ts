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
  /** Every matching post, highest engagement first, with its real Reddit URL so the number
   * is verifiable — Andy (2026-09-10): "Are these accurate tho? Maybe source link?" Each
   * link is the actual thread; anyone can click through and see the count themselves. */
  posts: { title: string; subreddit: string; url: string; upvotes: number; commentsCount: number }[]
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
  cached: { postTitle: string; postUrl: string; subreddit: string; upvotes: number; commentsCount: number }[],
): EngagementSignal {
  const draftKw = keywords(draftText)
  if (draftKw.size === 0) return { total: 0, matches: 0, posts: [] }

  const posts: EngagementSignal['posts'] = []
  for (const post of cached) {
    const postKw = keywords(post.postTitle)
    let overlap = 0
    for (const k of postKw) if (draftKw.has(k)) overlap++
    // 1 shared meaningful keyword. Tested 2 on 2026-09-10 against real data: 26/27 drafts
    // dropped to zero and the lone survivor was a false match — our post titles and Reddit
    // titles are both ~5 words and rarely share two meaningful ones. So this stays loose by
    // necessity, and the honest framing is "related discussion", not "this exact topic".
    // Accountability comes from the UI instead: every counted thread is listed with a real
    // Reddit link so the match can be eyeballed and the count verified by anyone.
    if (overlap < 1) continue
    posts.push({ title: post.postTitle, subreddit: post.subreddit, url: post.postUrl, upvotes: post.upvotes, commentsCount: post.commentsCount })
  }
  posts.sort((a, b) => b.upvotes + b.commentsCount - (a.upvotes + a.commentsCount))
  const total = posts.reduce((n, p) => n + p.upvotes + p.commentsCount, 0)
  return { total, matches: posts.length, posts }
}
