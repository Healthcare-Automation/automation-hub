import Link from 'next/link'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { getContentDrafts } from '@/lib/marketingQueries'
import { DemoBadge } from '@/components/marketing/DemoBadge'

export const dynamic = 'force-dynamic'

/** Content Library: every draft generated so far. Generation itself now happens inline
 * in Story Workspace's Content Studio panel (no page jump) — this page is purely the
 * persisted history of what's been generated. */
export default async function ContentLibraryPage() {
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
                <span className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:border-zinc-700">
                  {draft.generated_by === 'llm' ? 'LLM' : 'Template'}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">Audience: {draft.audience}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
