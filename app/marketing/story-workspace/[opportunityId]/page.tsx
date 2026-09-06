import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getStoryOpportunity, getStoryAngles } from '@/lib/marketingQueries'
import { DemoBadge } from '@/components/marketing/DemoBadge'
import { AngleWorkspace } from '@/components/marketing/AngleWorkspace'

export const dynamic = 'force-dynamic'

/** Story Workspace: three angles side by side, pick one, Content Studio opens inline
 * right below — same panel flow the rest of the tab uses, no separate page for content. */
export default async function StoryOpportunityPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>
}) {
  const { opportunityId } = await params
  const cookieStore = await cookies()
  const isAdmin = await verifyAdminCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)

  const opportunity = await getStoryOpportunity(opportunityId)
  if (!opportunity) {
    return <p className="text-sm text-zinc-500">Story opportunity not found.</p>
  }

  const angles = await getStoryAngles(opportunityId)

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">{opportunity.title}</h2>
          {opportunity.is_demo_data && <DemoBadge />}
          <span className="rounded border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-500 dark:border-zinc-700">
            {opportunity.generated_by === 'llm' ? 'Angles generated via LLM' : 'Angles generated via local template'}
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">{opportunity.signal_summary}</p>
      </div>

      <AngleWorkspace
        opportunityId={opportunity.id}
        angles={angles}
        selectedAngleId={opportunity.selected_angle_id}
        isAdmin={isAdmin}
      />
    </div>
  )
}
