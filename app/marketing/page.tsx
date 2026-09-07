import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { getInstagramDrafts } from '@/lib/marketingQueries'
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
  const drafts = await getInstagramDrafts(orgId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Instagram Queue</h2>
        <p className="mt-1 text-sm text-zinc-500">
          UZU&apos;s own brand-account drafts — grounded in cited research, never auto-posted. Review, approve, and check off once posted.
        </p>
      </div>

      {drafts.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No Instagram drafts yet. Run <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">npm run instagram:generate</code> or wait for the Mon/Wed/Fri cron.
        </p>
      ) : (
        <InstagramQueueBoard drafts={drafts} isAdmin={isAdmin} />
      )}
    </div>
  )
}
