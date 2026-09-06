import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { getMarketingOrgAndUser } from '@/lib/marketingQueries'
import { hasLLMProvider } from '@/lib/marketing/llm'
import { hasEmbeddingsProvider } from '@/lib/marketing/embeddings'

export const dynamic = 'force-dynamic'

/** Ported from marketing_content/app/settings/page.tsx; generation-mode copy updated for
 * the real OPENAI_API_KEY wiring (MARKETING_V1_BRIEF.md section 3) — NOT OPENAI_ADMIN_KEY,
 * which is a separate billing-read key used only by the cost-sync cron. */
export default async function MarketingSettingsPage() {
  const { orgId, userId } = await getDemoOrgAndUser()
  const { org, user } = await getMarketingOrgAndUser(orgId, userId)
  const llmConfigured = hasLLMProvider()
  const embeddingsConfigured = hasEmbeddingsProvider()

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
          <dt className="font-medium text-zinc-500">Story/content generation</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">
            {llmConfigured ? (
              <>
                LLM configured (<code>OPENAI_API_KEY</code> set, model <code>{process.env.OPENAI_MODEL ?? 'gpt-4o-mini'}</code>
                ). Story angles and content drafts are generated via the LLM with structured JSON output, falling back to
                the local template on any failure.
              </>
            ) : (
              <>
                Template fallback (no <code>OPENAI_API_KEY</code> set). Story angles and content drafts are produced by
                the deterministic local generator in <code>lib/marketing/storyGenerator.ts</code> and{' '}
                <code>lib/marketing/contentGenerator.ts</code>. Set <code>OPENAI_API_KEY</code> (and optionally{' '}
                <code>OPENAI_MODEL</code>) to route through a real provider instead — never{' '}
                <code>OPENAI_ADMIN_KEY</code>, which is a separate billing-read key.
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Embeddings / clustering</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">
            {embeddingsConfigured
              ? 'OpenAI text-embedding-3-small (OPENAI_API_KEY set) — same key as generation above.'
              : 'Local hash-embedding fallback (no OPENAI_API_KEY set). Coarser than a real embedding, so the clustering similarity threshold is lowered to compensate — see lib/marketingClustering.ts.'}
          </dd>
        </div>
      </dl>
    </div>
  )
}
