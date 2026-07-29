import { unstable_cache } from 'next/cache'
import { getDjcInsights, type InsightsPeriod } from '@/lib/djcInsights'
import { getDjcViewEfficiencyWeekly } from '@/lib/djcQueries'
import { withDbRetry } from '@/lib/dbRetry'
import DjcInsightsPanel from '@/components/DjcInsightsPanel'
import { getViewCycles, getCycleProjection, getSourcingByMonth, getAutomationFunnel,
         getEfficiencyWeeks, getActivityBuckets, getCandidateOutcomes, getLocationSupply,
         getOutreachByMonth, getRoleSpend, getOutreachDetail } from '@/lib/djcOps'
import AcquisitionStory from '@/components/djc/AcquisitionStory'

/** Sourcing analytics: views ledger, conserve audit, funnel, site health, rules.
 *  Reads searchParams (period), so it's dynamic — the data layer is cached instead. */
const getCached = unstable_cache(
  (period: InsightsPeriod) => getDjcInsights(period),
  ['djc-insights-acquisition'],
  { revalidate: 60 },
)

// Cached too. Every Vercel instance holds its own small pool, and the Supabase session pooler caps
// at 15 clients across the hub, builds, Modal jobs and scripts — so an uncached per-render query is
// a reliable way to exhaust it. One database hit a minute, shared across all instances.
const getCachedEfficiency = unstable_cache(
  () => getDjcViewEfficiencyWeekly(12),
  ['djc-view-efficiency-weekly'],
  { revalidate: 60 },
)

// Sequential inside one cache entry: the Supabase session pooler caps at 15 clients across the
// whole estate, so four parallel queries per render is a reliable way to exhaust it.
const getCachedOps = unstable_cache(async () => ({
  cycles: await getViewCycles(),
  projection: await getCycleProjection(),
  sourcing: await getSourcingByMonth(),
  funnel: await getAutomationFunnel(),
  weeks: await getEfficiencyWeeks(6),
  activity: await getActivityBuckets(),
  outcomesCycle: await getCandidateOutcomes(14),
  outcomesAll: await getCandidateOutcomes(null),
  locations: await getLocationSupply(),
  outreach: await getOutreachByMonth(),
  roles: await getRoleSpend(),
  outreachDetail: await getOutreachDetail(),
}), ['djc-ops-v17'], { revalidate: 120 })

export default async function AcquisitionPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: raw } = await searchParams
  const period: InsightsPeriod = raw === 'all' ? 'all' : 'quarter'
  let data = null
  let ops = null
  let weekly: Awaited<ReturnType<typeof getDjcViewEfficiencyWeekly>> | null = []
  try {
    ;[data, weekly] = await Promise.all([
      getCached(period),
      withDbRetry(() => getCachedEfficiency()).catch(() => null),
    ])
    ops = await withDbRetry(() => getCachedOps()).catch(e => {
      console.error('DJC ops block failed:', e)
      return null
    })
  } catch (err) {
    console.error('Failed to load DJC acquisition view:', err)
  }
  return data ? (
    <div className="space-y-14">
      {ops && (
        <AcquisitionStory
          cycles={ops.cycles} projection={ops.projection} sourcing={ops.sourcing}
          funnel={ops.funnel} weeks={ops.weeks} activity={ops.activity}
          outcomesCycle={ops.outcomesCycle} outcomesAll={ops.outcomesAll}
          locations={ops.locations} outreach={ops.outreach} roles={ops.roles} outreachDetail={ops.outreachDetail}
        />
      )}
      <DjcInsightsPanel data={data} view="acquisition" viewEfficiency={weekly === null ? null : weekly.map(w => ({ day: w.week, views: w.views, created: w.created, freeSkips: w.freeSkips }))} />
    </div>
  ) : (
    <p className="text-sm text-zinc-500">Acquisition view unavailable — could not read data.</p>
  )
}
