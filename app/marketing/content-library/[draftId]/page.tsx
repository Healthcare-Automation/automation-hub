import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getContentDraft } from '@/lib/marketingQueries'
import { DemoBadge } from '@/components/marketing/DemoBadge'
import { ComplianceBanner } from '@/components/marketing/ComplianceBanner'
import { FeedbackForm } from '@/components/marketing/FeedbackForm'

export const dynamic = 'force-dynamic'

/** Ported from marketing_content/app/content-library/[draftId]/page.tsx. Compliance
 * banner is a visible warning, not a silent rewrite — no "publish" action exists
 * anywhere in this port (BUILD_BRIEF.md: human approval required, no auto-publish). */
export default async function ContentDraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params
  const cookieStore = await cookies()
  const isAdmin = await verifyAdminCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)

  const draft = await getContentDraft(draftId)
  if (!draft) {
    return <p className="text-sm text-zinc-500">Content draft not found.</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
          {draft.format === 'linkedin_post' ? 'LinkedIn post' : 'Video script'}
        </h2>
        {draft.is_demo_data && <DemoBadge />}
        <span className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-500 dark:border-zinc-700">
          {draft.generated_by === 'template' ? 'Generated via local template (no LLM key configured)' : 'Generated via LLM'}
        </span>
      </div>

      <ComplianceBanner claims={draft.claims_requiring_review} />

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="font-medium text-zinc-500">Audience</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">{draft.audience}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Objective</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">{draft.objective}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Main idea</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">{draft.main_idea}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Source material</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">
            {draft.source_material_links.length === 0 ? (
              'None linked'
            ) : (
              <ul className="list-disc pl-5">
                {draft.source_material_links.map((link, i) => (
                  <li key={i}>
                    <a href={link} target="_blank" rel="noreferrer" className="text-zinc-900 hover:underline dark:text-white">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Hook options</dt>
          <dd>
            <ul className="list-disc pl-5 text-zinc-800 dark:text-zinc-200">
              {draft.hook_options.map((hook, i) => (
                <li key={i}>{hook}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Draft</dt>
          <dd className="whitespace-pre-wrap rounded border border-zinc-200 p-3 font-mono text-xs leading-relaxed text-zinc-800 dark:border-zinc-700 dark:text-zinc-200">
            {draft.draft_text}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Alternative point of view</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">{draft.alternative_pov}</dd>
        </div>
        {draft.suggested_visual && (
          <div>
            <dt className="font-medium text-zinc-500">Suggested visual</dt>
            <dd className="text-zinc-800 dark:text-zinc-200">{draft.suggested_visual}</dd>
          </div>
        )}
      </dl>

      <FeedbackForm targetType="content_draft" targetId={draft.id} isAdmin={isAdmin} />
    </div>
  )
}
