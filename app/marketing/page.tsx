import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { getInstagramDrafts, getTopRedditEngagement } from '@/lib/marketingQueries'
import { computeEngagementSignal } from '@/lib/marketing/engagementSignal'
import { InstagramQueueBoard } from '@/components/marketing/InstagramQueueBoard'

export const dynamic = 'force-dynamic'

/** Instagram content queue (INSTAGRAM_QUEUE_BRIEF.md) — UZU's own brand-account review
 * queue, not client-facing. ~3 drafts/week land here from the Mon/Wed/Fri Modal cron
 * (scripts/generate-instagram-content.ts); Andy reviews/approves after the fact. This is
 * now the Marketing tab's landing page (moved from app/marketing/instagram-queue/page.tsx
 * on 2026-09-08 — MARKETING_TAB_REBUILD_BRIEF.md made the tab Instagram-only). */
export default async function MarketingPage() {
  const { orgId } = await getDemoOrgAndUser()
  const cookieStore = await cookies()
  const isAdmin = await verifyAdminCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)
  // Engagement cache is org-agnostic and small (~100 rows) — one query for the whole page,
  // then a pure in-memory keyword match per draft. Not an N+1. getTopRedditEngagement never
  // throws (returns [] on any DB error), so a cache problem can't take the queue page down.
  const [drafts, cached] = await Promise.all([getInstagramDrafts(orgId), getTopRedditEngagement(200)])
  const draftsWithSignal = drafts.map((d) => ({
    ...d,
    engagement: computeEngagementSignal(`${d.mainIdea} ${d.hookLine}`, cached),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-lg font-bold text-stone-800 dark:text-white">Instagram Queue</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          UZU&apos;s own brand-account drafts — grounded in cited research, never auto-posted. Review, approve, and check off once posted.
        </p>
      </div>

      {drafts.length === 0 ? (
        <p className="text-sm text-stone-500">
          No Instagram drafts yet. Run <code className="rounded bg-stone-200 px-1 py-0.5 text-xs dark:bg-stone-800">npm run instagram:generate</code> or wait for the Mon/Wed/Fri cron.
        </p>
      ) : (
        <InstagramQueueBoard drafts={draftsWithSignal} isAdmin={isAdmin} />
      )}
    </div>
  )
}
