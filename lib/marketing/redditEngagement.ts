/** Real engagement evidence from Reddit — Sean's feedback (2026-09-09, via Andy): bias
 * content toward what people are ALREADY reacting to, not just net-new guesses. See
 * sql/marketing_schema.sql's marketing_reddit_engagement table for the caching rationale.
 *
 * Uses Apify's harshmaur/reddit-scraper actor in `startUrls` mode, pointed at a curated
 * list of relevant subreddits' `/top/?t=month` pages — NOT this actor's own keyword search,
 * which was verified live (2026-09-09) to return near-zero-engagement, off-topic noise
 * ("sort":"top" ignores the query entirely and returns Reddit's all-time global top; no
 * sort returns "newest keyword match", almost all upvotes=0-11). Pointing it at a specific
 * subreddit's own /top/ URL instead returned genuinely on-topic, high-engagement posts
 * (verified: r/smallbusiness top-of-year, real posts with 800-10,000+ upvotes about
 * reviews/pricing/referrals/customer stories).
 *
 * Cost: ~$0.004/result (harshmaur/reddit-scraper's pay-per-event rate) — pulling ~25 posts
 * from each of ~6 curated subreddits once a week is well under $1/week, comfortably inside
 * Apify's free-tier $5/month hard cap (confirmed via /v2/users/me: maxMonthlyUsageUsd: 5).
 * This module NEVER runs per research pass — only from the weekly refresh script
 * (scripts/refresh-reddit-engagement.ts) — to keep it there. */

// Curated, not keyword-searched (see module doc for why search mode is unreliable on this
// actor). Update this list by hand as content themes shift — it's cheap to change and the
// failure mode of a stale list is just "less relevant evidence", never a broken build.
export const ENGAGEMENT_SUBREDDITS = ['smallbusiness', 'Dentistry', 'marketing', 'Entrepreneur'] as const

export interface RedditEngagementPost {
  subreddit: string
  title: string
  url: string
  upvotes: number
  commentsCount: number
  postedAt: string | null
}

interface ApifyRedditItem {
  title?: string
  postUrl?: string
  upVotes?: number
  commentsCount?: number
  communityName?: string
  createdAt?: string
  dataType?: string
}

const APIFY_ACTOR = 'harshmaur~reddit-scraper'
const RESULTS_PER_SUBREDDIT = 25

function apifyToken(): string | undefined {
  return process.env.APIFY_TOKEN
}

/** Fetches one subreddit's top-of-month posts with real engagement counts. Never throws —
 * returns an empty array on any failure (missing token, actor error, malformed response) so
 * a bad pull for one subreddit doesn't take down the whole weekly refresh. */
export async function fetchSubredditTopPosts(subreddit: string): Promise<RedditEngagementPost[]> {
  const token = apifyToken()
  if (!token) {
    console.error('APIFY_TOKEN not set — skipping Reddit engagement fetch.')
    return []
  }
  try {
    const response = await fetch(
      `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(120_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls: [{ url: `https://www.reddit.com/r/${subreddit}/top/?t=month` }],
          maxItems: RESULTS_PER_SUBREDDIT,
          sort: 'top',
        }),
      },
    )
    if (!response.ok) {
      console.error(`Apify Reddit fetch failed for r/${subreddit}:`, response.status, await response.text())
      return []
    }
    // Apify's raw response can include unescaped control characters inside post body/HTML
    // fields (verified live, 2026-09-09) — strict JSON.parse throws on those even though the
    // fields we actually read (title/url/counts) are unaffected. Read as text and parse
    // non-strictly rather than losing an entire subreddit's data to one bad body field.
    const raw = await response.text()
    let items: ApifyRedditItem[]
    try {
      items = JSON.parse(raw)
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      items = JSON.parse(raw.replace(/[\u0000-\u001F]+/g, ' '))
    }
    return items
      .filter((item) => item.dataType === 'post' && item.title && item.postUrl && typeof item.upVotes === 'number')
      .map((item) => ({
        subreddit,
        title: item.title!,
        url: item.postUrl!,
        upvotes: item.upVotes!,
        commentsCount: item.commentsCount ?? 0,
        postedAt: item.createdAt ?? null,
      }))
  } catch (err) {
    console.error(`Apify Reddit fetch threw for r/${subreddit}:`, err instanceof Error ? err.message : err)
    return []
  }
}

/** Fetches all curated subreddits sequentially (not parallel — stay gentle on Apify's
 * concurrent-run limit and keep costs predictable). Never throws. */
export async function fetchAllEngagementEvidence(): Promise<RedditEngagementPost[]> {
  const all: RedditEngagementPost[] = []
  for (const subreddit of ENGAGEMENT_SUBREDDITS) {
    const posts = await fetchSubredditTopPosts(subreddit)
    all.push(...posts)
  }
  return all
}
