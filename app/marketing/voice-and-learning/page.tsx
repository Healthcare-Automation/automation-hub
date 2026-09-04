import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { getLearnedPreferences, type LearnedPreferenceViewRow } from '@/lib/marketingQueries'
import { PreferenceControls, ResetHistoryButton } from '@/components/marketing/PreferenceControls'

export const dynamic = 'force-dynamic'

const TYPE_LABELS: Record<string, string> = {
  explicit_preference: 'Explicit preference',
  observed_preference: 'Observed preference',
  performance_evidence: 'Performance evidence',
}

/** Ported from marketing_content/app/voice-and-learning/page.tsx. What the system has
 * learned from feedback, and why — repeated feedback (3+ times) becomes an observed
 * preference (lib/marketingPreferences.ts recomputeObservedPreferences). */
export default async function VoiceAndLearningPage() {
  const cookieStore = await cookies()
  const isAdmin = await verifyAdminCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)

  const { orgId } = await getDemoOrgAndUser()
  const preferences = await getLearnedPreferences(orgId)

  const grouped = new Map<string, LearnedPreferenceViewRow[]>()
  for (const pref of preferences) {
    const list = grouped.get(pref.preference_type) ?? []
    list.push(pref)
    grouped.set(pref.preference_type, list)
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Voice and Learning</h2>
          <p className="mt-1 text-sm text-zinc-500">What the system has learned from feedback, and why.</p>
        </div>
        {isAdmin && <ResetHistoryButton />}
      </div>

      {preferences.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No learned preferences yet. Submit feedback on a story angle or content draft to start building this out —
          repeated feedback (3+ times) becomes an observed preference.
        </p>
      ) : (
        Array.from(grouped.entries()).map(([type, prefs]) => (
          <section key={type} className="space-y-4">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-white">{TYPE_LABELS[type] ?? type}</h3>
            <ul className="space-y-3">
              {prefs.map((pref) => (
                <li key={pref.id} className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-700/60">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-white">{pref.key}</p>
                      <p className="text-xs text-zinc-500">
                        Status: {pref.status} · based on {pref.occurrence_count} feedback event
                        {pref.occurrence_count === 1 ? '' : 's'}
                      </p>
                    </div>
                    {isAdmin && <PreferenceControls id={pref.id} status={pref.status} />}
                  </div>
                  {pref.supporting_example_ids.length > 0 && (
                    <details className="mt-2 text-xs text-zinc-500">
                      <summary className="cursor-pointer">Supporting feedback event ids</summary>
                      <ul className="mt-1 list-disc pl-5">
                        {pref.supporting_example_ids.map((id) => (
                          <li key={id}>{id}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
