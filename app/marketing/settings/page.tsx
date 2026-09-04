import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { getMarketingOrgAndUser } from '@/lib/marketingQueries'
import { hasLLMProvider } from '@/lib/marketing/llm'

export const dynamic = 'force-dynamic'

/** Ported from marketing_content/app/settings/page.tsx. */
export default async function MarketingSettingsPage() {
  const { orgId, userId } = await getDemoOrgAndUser()
  const { org, user } = await getMarketingOrgAndUser(orgId, userId)
  const llmConfigured = hasLLMProvider()

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Settings</h2>
        <p className="mt-1 text-sm text-zinc-500">Org, actor, and generation mode.</p>
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
          <dt className="font-medium text-zinc-500">Generation mode</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">
            {llmConfigured ? (
              'External LLM configured (LLM_API_KEY set)'
            ) : (
              <>
                Template fallback (no <code>LLM_API_KEY</code> set). Story angles and content drafts are produced by
                the deterministic local generator in <code>lib/marketing/storyGenerator.ts</code> and{' '}
                <code>lib/marketing/contentGenerator.ts</code>. Set <code>LLM_API_KEY</code> (and optionally{' '}
                <code>LLM_MODEL</code>/<code>LLM_BASE_URL</code>) to route through a real provider instead.
              </>
            )}
          </dd>
        </div>
      </dl>
    </div>
  )
}
