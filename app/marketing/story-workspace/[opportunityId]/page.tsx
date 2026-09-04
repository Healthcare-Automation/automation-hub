import Link from 'next/link'
import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getStoryOpportunity, getStoryAngles } from '@/lib/marketingQueries'
import { DemoBadge } from '@/components/marketing/DemoBadge'
import { PickAngleButton } from '@/components/marketing/PickAngleButton'
import { FeedbackForm } from '@/components/marketing/FeedbackForm'

export const dynamic = 'force-dynamic'

const ANGLE_LABELS: Record<string, string> = {
  practical: 'Practical',
  strategic: 'Strategic',
  human: 'Human',
}

/** Ported from marketing_content/app/story-workspace/[opportunityId]/page.tsx. */
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
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">{opportunity.title}</h2>
          {opportunity.is_demo_data && <DemoBadge />}
        </div>
        <p className="mt-1 text-sm text-zinc-500">{opportunity.signal_summary}</p>
      </div>

      {opportunity.selected_angle_id && (
        <div className="rounded-lg border border-zinc-300 bg-zinc-50 p-3 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-200">
          Angle selected.{' '}
          <Link
            href={`/marketing/content-library?opportunityId=${opportunity.id}&angleId=${opportunity.selected_angle_id}`}
            className="underline"
          >
            Generate content from this angle →
          </Link>
        </div>
      )}

      <div className="space-y-6">
        {angles.map((angle) => (
          <article key={angle.id} className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-700/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-white">{ANGLE_LABELS[angle.angle_type]}</h3>
              <div className="flex items-center gap-2">
                {angle.structure.isHypothetical && (
                  <span className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-500 dark:border-zinc-700">
                    Hypothetical
                  </span>
                )}
                <PickAngleButton
                  opportunityId={opportunity.id}
                  angleId={angle.id}
                  isSelected={opportunity.selected_angle_id === angle.id}
                  isAdmin={isAdmin}
                />
              </div>
            </div>

            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="font-medium text-zinc-500">Audience</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">{angle.structure.audience}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Recognizable moment</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">{angle.structure.recognizableMoment}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Tension / misconception</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">{angle.structure.tensionOrMisconception}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Evidence</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">{angle.structure.evidence}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Our interpretation</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">{angle.structure.ourInterpretation}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Why it matters</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">{angle.structure.whyItMatters}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Takeaway</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">{angle.structure.takeaway}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Closing thought / CTA</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">{angle.structure.closingThoughtCta}</dd>
              </div>
              {angle.applied_preference_notes.length > 0 && (
                <div>
                  <dt className="font-medium text-zinc-500">Learned-preference adjustments</dt>
                  <dd>
                    <ul className="list-disc pl-5 text-zinc-800 dark:text-zinc-200">
                      {angle.applied_preference_notes.map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
            </dl>

            <div className="mt-4">
              <FeedbackForm targetType="story_angle" targetId={angle.id} isAdmin={isAdmin} />
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
