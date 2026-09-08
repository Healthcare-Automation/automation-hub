import { config } from 'dotenv'
config({ path: '.env.local' })

import { fetchAllEngagementEvidence } from '../lib/marketing/redditEngagement'
import { replaceRedditEngagementCache } from '../lib/marketingQueries'

/** Weekly refresh of the Reddit engagement evidence cache — deliberately NOT run per
 * Instagram research pass (that would re-pull on every 3x/week generation, burning Apify
 * usage for data that barely changes day to day). Run this via a weekly Modal schedule
 * (modal/marketing_research.py's run_refresh_reddit_engagement) or manually:
 *   npm run reddit-engagement:refresh
 * See lib/marketing/redditEngagement.ts for cost/rationale. */
async function main() {
  console.log('Fetching Reddit engagement evidence from curated subreddits...')
  const posts = await fetchAllEngagementEvidence()
  if (posts.length === 0) {
    console.error('Fetched zero posts across all subreddits — leaving the existing cache in place rather than wiping it.')
    process.exit(1)
  }
  await replaceRedditEngagementCache(posts)
  console.log(`Cached ${posts.length} posts.`)
  const bySubreddit = new Map<string, number>()
  for (const p of posts) bySubreddit.set(p.subreddit, (bySubreddit.get(p.subreddit) ?? 0) + 1)
  for (const [sub, count] of bySubreddit) console.log(`  r/${sub}: ${count}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
