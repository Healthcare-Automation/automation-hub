import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { getLearnedPreferences, type LearnedPreferenceViewRow } from '@/lib/marketingQueries'
import { getFeedbackEventsByIds } from '@/lib/marketingPreferences'
import { PreferenceControls, ResetHistoryButton } from '@/components/marketing/PreferenceControls'

export const dynamic = 'force-dynamic'

const TYPE_LABELS: Record<string, string> = {
  explicit_preference: 'Explicit preference',
  observed_preference: 'Observed preference',
  performance_evidence: 'Performance evidence',
}

const TARGET_LABELS: Record<string, string> = {
  story_opportunity: 'Story opportunity',
  story_angle: 'Story angle',
  content_draft: 'Content draft',
}

/** Voice and Learning: what the system has learned from feedback, grouped by type, with
 * an examples drawer per preference showing the actual feedback events (tags, free text,
 * when, on what) behind the count — not just raw ids. Repeated feedback (3+ times)
 * becomes an observed preference (lib/marketingPreferences.ts recomputeObservedPreferences),
 * and generation reads active preferences on every run (storyGenerator.ts/
 * contentGenerator.ts), so this is a real, demonstrable feedback loop. */
export default async function VoiceAndLearningPage() {
  const cookieStore = await cookies()
  const isAdmin = await verifyAdminCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)

  const { orgId } = await getDemoOrgAndUser()
  const preferences = await getLearnedPreferences(orgId)

  const examplesByPreference = new Map(
    await Promise.all(
      preferences.map(async (p) => [p.id, await getFeedbackEventsByIds(p.supporting_example_ids)] as const),
    ),
  )

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
              {prefs.map((pref) => {
                const examples = examplesByPreference.get(pref.id) ?? []
                return (
                  <li key={pref.id} className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-700/60">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-zinc-900 dark:text-white">{pref.key}</p>
                        <p className="text-xs text-zinc-500">
                          Status: {pref.status} · {pref.occurrence_count} supporting example
                          {pref.occurrence_count === 1 ? '' : 's'}
                        </p>
                      </div>
                      {isAdmin && <PreferenceControls id={pref.id} status={pref.status} />}
                    </div>
                    {examples.length > 0 && (
                      <details className="mt-3 border-t border-zinc-200 pt-3 text-xs dark:border-zinc-700/60">
                        <summary className="cursor-pointer font-medium text-zinc-600 dark:text-zinc-400">
                          Show {examples.length} example{examples.length === 1 ? '' : 's'}
                        </summary>
                        <ul className="mt-2 space-y-2">
                          {examples.map((event) => (
                            <li key={event.id} className="rounded border border-zinc-200 p-2 dark:border-zinc-700/60">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:border-zinc-700">
                                  {TARGET_LABELS[event.target_type] ?? event.target_type}
                                </span>
                                {event.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded border border-amber-400/50 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400"
                                  >
                                    {tag.replace(/_/g, ' ')}
                                  </span>
                                ))}
                                <span className="ml-auto text-[10px] text-zinc-400">
                                  {new Date(event.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                              {event.free_text && <p className="mt-1 text-zinc-600 dark:text-zinc-400">{event.free_text}</p>}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
