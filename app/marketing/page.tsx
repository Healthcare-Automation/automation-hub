import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { getBriefingCards, getBriefingMetrics, hasLiveMarketingData } from '@/lib/marketingQueries'
import { isMarketingConfigured } from '@/lib/marketingDb'
import { BriefingMetricStrip } from '@/components/marketing/BriefingMetricStrip'
import { HideDemoToggle } from '@/components/marketing/HideDemoToggle'
import { OpportunityCard } from '@/components/marketing/OpportunityCard'

export const dynamic = 'force-dynamic'

/** Briefing (homepage): a metric strip, then up to five story opportunities ranked by
 * trend score — live data always outranks demo (getBriefingCards), and demo is hidden by
 * default once any live data exists (hasLiveMarketingData). */
export default async function MarketingBriefingPage() {
  if (!isMarketingConfigured) {
    return <p className="text-sm text-zinc-500">Set DATABASE_URL to show the Marketing tab here.</p>
  }

  const cookieStore = await cookies()
  const isAdmin = await verifyAdminCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)
  const { orgId } = await getDemoOrgAndUser()

  const hideDemoCookie = cookieStore.get('mkt_hide_demo')?.value
  const hideDemo = hideDemoCookie === undefined ? await hasLiveMarketingData(orgId) : hideDemoCookie === '1'

  const [metrics, cards] = await Promise.all([getBriefingMetrics(orgId), getBriefingCards(orgId, { hideDemo })])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Today&apos;s Briefing</h2>
          <p className="mt-1 text-sm text-zinc-500">Up to five story opportunities, ranked by trend score.</p>
        </div>
        <HideDemoToggle hideDemo={hideDemo} />
      </div>

      <BriefingMetricStrip {...metrics} />

      {cards.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {hideDemo
            ? 'No live story opportunities yet — the scheduled research run populates this, or use "Run research now" on the Sources page.'
            : 'No story opportunities yet. Run npx tsx scripts/seed-marketing.ts to populate demo data.'}
        </p>
      ) : (
        <ol className="space-y-4">
          {cards.map((card) => (
            <OpportunityCard key={card.id} card={card} isAdmin={isAdmin} />
          ))}
        </ol>
      )}
    </div>
  )
}
