import { fetchInstagramEngagement, INSTAGRAM_STUDY_ACCOUNTS } from '../lib/marketing/instagramEngagement'
import { replaceInstagramEngagementCache } from '../lib/marketingQueries'

/** Weekly refresh of the dental/practice-growth Instagram engagement cache. Run via
 * `npm run instagram-engagement:refresh` (env from --env-file) or the Modal cron
 * (modal/marketing_research.py::run_refresh_instagram_engagement). An empty fetch leaves
 * the existing cache in place. */
async function main() {
  console.log(`Fetching Instagram engagement for ${INSTAGRAM_STUDY_ACCOUNTS.length} accounts…`)
  const posts = await fetchInstagramEngagement()
  if (posts.length === 0) {
    console.error('No posts fetched — leaving existing cache untouched.')
    process.exit(1)
  }
  await replaceInstagramEngagementCache(posts)
  const byAccount = new Map<string, number>()
  for (const p of posts) byAccount.set(p.account, (byAccount.get(p.account) ?? 0) + 1)
  console.log(`Cached ${posts.length} posts:`)
  for (const [a, n] of [...byAccount.entries()].sort((x, y) => y[1] - x[1])) console.log(`  @${a}: ${n}`)
  const top = [...posts].sort((a, b) => b.likes + b.comments - (a.likes + a.comments)).slice(0, 5)
  console.log('Top 5 by engagement:')
  for (const p of top) console.log(`  ${p.likes} likes / ${p.comments} comments  @${p.account}  ${p.caption.slice(0, 70).replace(/\n/g, ' ')}`)
  process.exit(0)
}

main().catch((err) => {
  console.error('refresh-instagram-engagement failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
