/** Real engagement evidence from dental / practice-growth Instagram accounts (Andy,
 * 2026-09-10: the Reddit-grounded drafts read "2-dimensional and obvious" — go study what
 * actually blew up in this exact niche and replicate those angles, likes/comments included).
 *
 * Apify actor apify/instagram-post-scraper, username mode. Cached weekly into
 * marketing_instagram_engagement (sql/marketing_schema.sql) by scripts/refresh-instagram-
 * engagement.ts / the Modal cron — never called per generation run. Same cost discipline as
 * lib/marketing/redditEngagement.ts: ~$0.0027/post on the free tier, 8 accounts x 30 posts
 * = ~$0.65/week.
 *
 * Account list is Andy's (2026-09-10) — hand-curated, not discovered. Live sweep the same
 * day showed engagement is wildly uneven across it: @dentalnachos peaks at 11.7k likes,
 * @drmarkcostes medians ~1.4k, while @thedentalmarketer / @gary_takacs / @thegarybird sit at
 * 7-29 likes per post despite authoritative-sounding bios. The scraper also returns tagged/
 * collab posts from OTHER accounts (e.g. @smileoutreachinternational at 1.7k) — those are
 * kept; a post that blew up is evidence regardless of who posted it. We rank by the number,
 * not the account. */

export const INSTAGRAM_STUDY_ACCOUNTS = [
  'thegarybird',
  'minalsampatllc',
  'thedentalmarketer',
  'drmarkcostes',
  'bulletproofdentalpractice',
  'dentalnachos',
  'gary_takacs',
  'drpeggybown',
] as const

export const POSTS_PER_ACCOUNT = 30

export interface InstagramEngagementPost {
  account: string
  url: string
  type: string | null
  caption: string
  likes: number
  comments: number
  videoViews: number | null
  postedAt: string | null
}

interface ApifyInstagramItem {
  ownerUsername?: string
  url?: string
  type?: string
  caption?: string
  likesCount?: number
  commentsCount?: number
  videoViewCount?: number
  timestamp?: string
}

/** Returns [] (never throws) on any failure so the weekly refresh leaves the existing cache
 * untouched rather than wiping it — same contract as fetchAllEngagementEvidence. */
export async function fetchInstagramEngagement(): Promise<InstagramEngagementPost[]> {
  const token = process.env.APIFY_TOKEN
  if (!token) {
    console.warn('instagramEngagement: APIFY_TOKEN unset — skipping fetch.')
    return []
  }
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-post-scraper/run-sync-get-dataset-items?token=${token}&timeout=280`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: [...INSTAGRAM_STUDY_ACCOUNTS], resultsLimit: POSTS_PER_ACCOUNT }),
      },
    )
    if (!res.ok) {
      console.error(`instagramEngagement: Apify HTTP ${res.status}`)
      return []
    }
    const items = (await res.json()) as ApifyInstagramItem[] | { error?: unknown }
    if (!Array.isArray(items)) {
      console.error('instagramEngagement: unexpected Apify payload', JSON.stringify(items).slice(0, 300))
      return []
    }
    const out: InstagramEngagementPost[] = []
    for (const it of items) {
      if (!it.url || !it.ownerUsername) continue
      // likesCount is -1 when Instagram hides the count on that post — treat as 0 rather
      // than dropping the post (comments may still be a real signal).
      const likes = typeof it.likesCount === 'number' && it.likesCount >= 0 ? it.likesCount : 0
      out.push({
        account: it.ownerUsername,
        url: it.url,
        type: it.type ?? null,
        caption: (it.caption ?? '').trim(),
        likes,
        comments: typeof it.commentsCount === 'number' && it.commentsCount >= 0 ? it.commentsCount : 0,
        videoViews: typeof it.videoViewCount === 'number' && it.videoViewCount >= 0 ? it.videoViewCount : null,
        postedAt: it.timestamp ?? null,
      })
    }
    return out
  } catch (err) {
    console.error('instagramEngagement: fetch failed', err instanceof Error ? err.message : err)
    return []
  }
}
