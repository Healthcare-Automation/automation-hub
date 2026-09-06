import { cookies } from 'next/headers'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { getTrendRadarRows, hasLiveMarketingData } from '@/lib/marketingQueries'
import { HideDemoToggle } from '@/components/marketing/HideDemoToggle'
import { TrendRadarTable } from '@/components/marketing/TrendRadarTable'

export const dynamic = 'force-dynamic'

/** Trend Radar: every cluster (live + demo unless hidden), sortable/filterable table —
 * clicking a row opens the same evidence side panel Briefing cards use. */
export default async function TrendRadarPage() {
  const cookieStore = await cookies()
  const { orgId } = await getDemoOrgAndUser()

  const hideDemoCookie = cookieStore.get('mkt_hide_demo')?.value
  const hideDemo = hideDemoCookie === undefined ? await hasLiveMarketingData(orgId) : hideDemoCookie === '1'

  const rows = await getTrendRadarRows(orgId)
  const visibleRows = hideDemo ? rows.filter((r) => !r.isDemoData) : rows

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Trend Radar</h2>
          <p className="mt-1 text-sm text-zinc-500">Every cluster of evidence, scored and explained.</p>
        </div>
        <HideDemoToggle hideDemo={hideDemo} />
      </div>

      {visibleRows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {hideDemo
            ? 'No live clusters yet — the scheduled research run populates this.'
            : 'No trend clusters yet. Run npx tsx scripts/seed-marketing.ts to populate demo data.'}
        </p>
      ) : (
        <TrendRadarTable rows={visibleRows} />
      )}
    </div>
  )
}
