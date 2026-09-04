import Link from 'next/link'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { getStoryOpportunities } from '@/lib/marketingQueries'
import { DemoBadge } from '@/components/marketing/DemoBadge'

export const dynamic = 'force-dynamic'

/** Story Workspace: pick a signal, review its three angles, choose one to develop.
 *  Ported from marketing_content/app/story-workspace/page.tsx. */
export default async function StoryWorkspacePage() {
  const { orgId } = await getDemoOrgAndUser()
  const opportunities = await getStoryOpportunities(orgId)

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Story Workspace</h2>
        <p className="mt-1 text-sm text-zinc-500">Pick a signal, review its three angles, choose one to develop.</p>
      </div>

      <ul className="space-y-4">
        {opportunities.map((opportunity) => (
          <li key={opportunity.id} className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-700/60">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
                <Link href={`/marketing/story-workspace/${opportunity.id}`} className="hover:underline">
                  {opportunity.title}
                </Link>
              </h3>
              {opportunity.is_demo_data && <DemoBadge />}
              <span className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-500 dark:border-zinc-700">
                {opportunity.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{opportunity.signal_summary}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
