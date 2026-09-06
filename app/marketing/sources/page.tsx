import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import {
  getFeedSourceStats,
  getRecentSourceItems,
  getResearchRunHistory,
} from '@/lib/marketingQueries'
import { DemoBadge } from '@/components/marketing/DemoBadge'
import { IngestUrlForm } from '@/components/marketing/IngestUrlForm'
import { FeedRegistryTable } from '@/components/marketing/FeedRegistryTable'
import { RunResearchButton } from '@/components/marketing/RunResearchButton'
import { stubAdapters, STUB_ADAPTER_DESCRIPTIONS } from '@/lib/marketing/adapters/stubs'

export const dynamic = 'force-dynamic'

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Sources page: the real feed registry (name, type, reliability, enabled, last fetched,
 * items 7d, last error), the manual URL form, "Run research now", and run history. */
export default async function SourcesPage() {
  const cookieStore = await cookies()
  const isAdmin = await verifyAdminCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)

  const { orgId } = await getDemoOrgAndUser()
  const [feedStats, items, runs] = await Promise.all([
    getFeedSourceStats(orgId),
    getRecentSourceItems(orgId, 30),
    getResearchRunHistory(orgId, 10),
  ])

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Sources and Integrations</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {feedStats.length} real RSS/Atom feeds run on a 6-hour schedule, plus manual URL ingestion.
        </p>
      </div>

      {isAdmin && (
        <section className="space-y-2">
          <RunResearchButton />
        </section>
      )}

      <section>
        <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Feed registry</h3>
        <div className="mt-3">
          <FeedRegistryTable rows={feedStats} isAdmin={isAdmin} />
        </div>
      </section>

      <section>
        <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Run history</h3>
        {runs.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No research runs yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700/60">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-zinc-900/[0.03] text-[10px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-800/40">
                <tr>
                  <th className="px-3 py-2 font-medium">Started</th>
                  <th className="px-3 py-2 font-medium">Triggered by</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Items ingested</th>
                  <th className="px-3 py-2 text-right font-medium">Clusters</th>
                  <th className="px-3 py-2 text-right font-medium">Opportunities</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-t border-zinc-200 dark:border-zinc-800/70">
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-500">{formatDateTime(run.startedAt)}</td>
                    <td className="px-3 py-2 text-zinc-500">{run.triggeredBy}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          run.status === 'completed'
                            ? 'text-teal-700 dark:text-teal-300'
                            : run.status === 'failed'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-zinc-500'
                        }
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{run.itemsIngested}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{run.clustersUpdated}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{run.opportunitiesCreated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Manual URL ingestion</h3>
        <p className="mt-1 text-sm text-zinc-500">Paste a URL to ingest it as a real source item.</p>
        <div className="mt-3">
          {isAdmin ? <IngestUrlForm /> : <p className="text-xs text-zinc-500">Sign in as admin to ingest a URL.</p>}
        </div>
      </section>

      <section>
        <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Recently ingested</h3>
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-700/60">
              <a href={item.source_url} target="_blank" rel="noreferrer" className="text-zinc-900 hover:underline dark:text-white">
                {item.title}
              </a>
              <span className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-500 dark:border-zinc-700">
                {item.source_type}
              </span>
              {item.is_demo_data && <DemoBadge />}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Coming soon</h3>
        <p className="mt-1 text-sm text-zinc-500">
          These adapters are documented but not implemented in this pass — they will never silently return fabricated data.
        </p>
        <ul className="mt-3 space-y-2">
          {stubAdapters.map((adapter) => (
            <li key={adapter.id} className="rounded-lg border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-700">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{adapter.id}</span> — {STUB_ADAPTER_DESCRIPTIONS[adapter.id]}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
