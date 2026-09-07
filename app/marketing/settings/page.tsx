import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { getMarketingOrgAndUser } from '@/lib/marketingQueries'
import { hasLLMProvider } from '@/lib/marketing/llm'

export const dynamic = 'force-dynamic'

/** Rewritten 2026-09-08 for the Instagram-only Marketing tab (MARKETING_TAB_REBUILD_BRIEF.md)
 * — describes the Instagram content pipeline (topic planning, live web search, caption/stat
 * generation, image generation) instead of the retired Briefing/Trend Radar pipeline's
 * story-generation and embeddings/clustering copy. NOT OPENAI_ADMIN_KEY, which is a separate
 * billing-read key used only by the cost-sync cron. */
export default async function MarketingSettingsPage() {
  const { orgId, userId } = await getDemoOrgAndUser()
  const { org, user } = await getMarketingOrgAndUser(orgId, userId)
  const llmConfigured = hasLLMProvider()

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Settings</h2>
        <p className="mt-1 text-sm text-zinc-500">Org, actor, and the Instagram pipeline's configuration.</p>
      </div>

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="font-medium text-zinc-500">Organization</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">{org?.name}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Signed in as</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">
            {user?.name} ({user?.email})
          </dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Instagram content generation</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">
            {llmConfigured ? (
              <>
                Configured (<code>OPENAI_API_KEY</code> set, model <code>{process.env.OPENAI_MODEL ?? 'gpt-4o-mini'}</code>
                ). Each run does its own topic planning and live web search, then generates a caption, hook, core
                stat, and hashtags with structured JSON output, and a stat-card image via <code>gpt-image-1</code>.
              </>
            ) : (
              <>
                Not configured — <code>OPENAI_API_KEY</code> is not set. The Instagram pipeline (topic planning,
                web search, caption/image generation) depends entirely on this key; without it, the Mon/Wed/Fri
                cron cannot generate new drafts. Set <code>OPENAI_API_KEY</code> (and optionally <code>OPENAI_MODEL</code>)
                — never <code>OPENAI_ADMIN_KEY</code>, which is a separate billing-read key.
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Schedule</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">
            Monday / Wednesday / Friday, via the <code>run_instagram_content</code> Modal cron
            (<code>modal/marketing_research.py</code>) — runs <code>scripts/generate-instagram-content.ts</code> and
            lands ~3 drafts/week in this queue for review.
          </dd>
        </div>
      </dl>
    </div>
  )
}
