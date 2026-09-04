import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { getRecentSourceItems } from '@/lib/marketingQueries'
import { DemoBadge } from '@/components/marketing/DemoBadge'
import { IngestUrlForm } from '@/components/marketing/IngestUrlForm'
import { stubAdapters, STUB_ADAPTER_DESCRIPTIONS } from '@/lib/marketing/adapters/stubs'

export const dynamic = 'force-dynamic'

/** Ported from marketing_content/app/sources/page.tsx. Manual URL ingestion (real
 * fetch, admin-gated) plus documented stub adapters that never return fabricated data. */
export default async function SourcesPage() {
  const cookieStore = await cookies()
  const isAdmin = await verifyAdminCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)

  const { orgId } = await getDemoOrgAndUser()
  const items = await getRecentSourceItems(orgId, 30)

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Sources and Integrations</h2>
        <p className="mt-1 text-sm text-zinc-500">Paste a URL to ingest it as a real source item.</p>
      </div>

      {isAdmin ? (
        <IngestUrlForm />
      ) : (
        <p className="text-xs text-zinc-500">Sign in as admin to ingest a URL.</p>
      )}

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
