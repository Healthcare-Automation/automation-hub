import { unstable_cache } from 'next/cache'
import { getDjcInsights, type InsightsPeriod } from '@/lib/djcInsights'
import DjcInsightsPanel from '@/components/DjcInsightsPanel'

/** Sourcing analytics: views ledger, conserve audit, funnel, site health, rules.
 *  Reads searchParams (period), so it's dynamic — the data layer is cached instead. */
const getCached = unstable_cache(
  (period: InsightsPeriod) => getDjcInsights(period),
  ['djc-insights-acquisition'],
  { revalidate: 60 },
)

export default async function AcquisitionPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: raw } = await searchParams
  const period: InsightsPeriod = raw === 'all' ? 'all' : 'quarter'
  let data = null
  try {
    data = await getCached(period)
  } catch (err) {
    console.error('Failed to load DJC acquisition view:', err)
  }
  return data ? (
    <DjcInsightsPanel data={data} view="acquisition" />
  ) : (
    <p className="text-sm text-zinc-500">Acquisition view unavailable — could not read data.</p>
  )
}
