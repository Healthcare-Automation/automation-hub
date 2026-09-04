import Link from 'next/link'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { getContentDrafts, getStoryOpportunity, getStoryAngles } from '@/lib/marketingQueries'
import { DemoBadge } from '@/components/marketing/DemoBadge'
import { GenerateContentForm } from '@/components/marketing/GenerateContentForm'

export const dynamic = 'force-dynamic'

/** Ported from marketing_content/app/content-library/page.tsx. When opportunityId +
 * angleId are present (linked from Story Workspace), shows the format picker instead
 * of the library list — same explicit-format-choice flow as the standalone app. */
export default async function ContentLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ opportunityId?: string; angleId?: string }>
}) {
  const { opportunityId, angleId } = await searchParams

  if (opportunityId && angleId) {
    const opportunity = await getStoryOpportunity(opportunityId)
    const angles = await getStoryAngles(opportunityId)
    const angle = angles.find((a) => a.id === angleId)
    if (!opportunity || !angle) {
      return <p className="text-sm text-zinc-500">Opportunity or angle not found.</p>
    }
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Content Studio</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Generating content for <span className="font-medium text-zinc-800 dark:text-zinc-200">{opportunity.title}</span> ({angle.angle_type} angle).
          </p>
        </div>
        <GenerateContentForm opportunityId={opportunityId} angleId={angleId} />
      </div>
    )
  }

  const { orgId } = await getDemoOrgAndUser()
  const drafts = await getContentDrafts(orgId)

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Content Library</h2>
        <p className="mt-1 text-sm text-zinc-500">Generated drafts. Pick an angle in Story Workspace to create a new one.</p>
      </div>

      {drafts.length === 0 ? (
        <p className="text-sm text-zinc-500">No content drafts yet.</p>
      ) : (
        <ul className="space-y-4">
          {drafts.map((draft) => (
            <li key={draft.id} className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-700/60">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
                  <Link href={`/marketing/content-library/${draft.id}`} className="hover:underline">
                    {draft.format === 'linkedin_post' ? 'LinkedIn post' : 'Video script'}: {draft.main_idea.slice(0, 60)}
                  </Link>
                </h3>
                {draft.is_demo_data && <DemoBadge />}
              </div>
              <p className="mt-1 text-xs text-zinc-500">Audience: {draft.audience}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
