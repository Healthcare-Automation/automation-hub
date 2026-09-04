import Link from 'next/link'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { getBriefing } from '@/lib/marketingQueries'
import { DemoBadge } from '@/components/marketing/DemoBadge'
import { isMarketingConfigured } from '@/lib/marketingDb'

export const dynamic = 'force-dynamic'

/** Briefing (homepage): up to 5 story opportunities, ranked by trend score.
 *  Ported from marketing_content/app/page.tsx. */
export default async function MarketingBriefingPage() {
  if (!isMarketingConfigured) {
    return <p className="text-sm text-zinc-500">Set DATABASE_URL to show the Marketing tab here.</p>
  }

  const { orgId } = await getDemoOrgAndUser()
  const rows = await getBriefing(orgId)

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Today&apos;s Briefing</h2>
        <p className="mt-1 text-sm text-zinc-500">Up to five story opportunities, ranked by trend score.</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No story opportunities yet. Run <code>npx tsx scripts/seed-marketing.ts</code> to populate demo data.
        </p>
      ) : (
        <ol className="space-y-4">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-700/60">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
                  <Link href={`/marketing/story-workspace/${row.id}`} className="hover:underline">
                    {row.title}
                  </Link>
                </h3>
                {row.is_demo_data && <DemoBadge />}
              </div>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{row.signal_summary}</p>
              {row.total_score !== null && (
                <p className="mt-3 text-xs text-zinc-500">
                  Trend score {row.total_score}/100 — {row.explanation}
                </p>
              )}
              <Link
                href={`/marketing/story-workspace/${row.id}`}
                className="mt-3 inline-block text-sm text-zinc-900 hover:underline dark:text-white"
              >
                View angles →
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
