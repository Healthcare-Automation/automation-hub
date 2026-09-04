import type postgres from 'postgres'
import { marketingSql as sql } from './marketingDb'
import type { FeedbackTargetType, PreferenceStatus } from './marketing/types'

/** Ported from marketing_content/lib/preferences.ts (raw SQL instead of Drizzle). The
 * feedback -> learning loop: repeated negative tags cross a minimum-occurrence threshold
 * before becoming an active observed_preference — a single rejection never becomes a
 * permanent rule (BUILD_BRIEF.md requirement). */

export interface RecordFeedbackInput {
  orgId: string
  targetType: FeedbackTargetType
  targetId: string
  tags: string[]
  freeText?: string
  capturedEdits?: Record<string, unknown>
}

export async function recordFeedback(input: RecordFeedbackInput) {
  const [event] = await sql`
    insert into marketing_feedback_events (org_id, target_type, target_id, tags, free_text, captured_edits)
    values (
      ${input.orgId}, ${input.targetType}, ${input.targetId},
      ${sql.json(input.tags)}, ${input.freeText ?? null},
      ${input.capturedEdits ? sql.json(input.capturedEdits as unknown as postgres.JSONValue) : null}
    )
    returning *
  `
  return event
}

export interface LearnedPreferenceRow {
  id: string
  org_id: string
  preference_type: 'explicit_preference' | 'observed_preference' | 'performance_evidence'
  key: string
  value: Record<string, unknown>
  supporting_example_ids: string[]
  occurrence_count: number
  status: PreferenceStatus
  created_at: string
  updated_at: string
}

export async function getActivePreferences(orgId: string): Promise<LearnedPreferenceRow[]> {
  return sql<LearnedPreferenceRow[]>`
    select * from marketing_learned_preferences where org_id = ${orgId} and status = 'active'
  `
}

const NEGATIVE_TAGS_TO_RULE_KEY: Record<string, string> = {
  too_clinical: 'avoid_tag:too_clinical',
  too_generic: 'avoid_tag:too_generic',
  too_promotional: 'avoid_tag:too_promotional',
  too_obvious: 'avoid_tag:too_obvious',
  wrong_tone: 'avoid_tag:wrong_tone',
  not_credible_enough: 'avoid_tag:not_credible_enough',
  do_not_use_this_style_again: 'avoid_tag:do_not_use_this_style_again',
}

/** Scans feedback_events for repeated negative tags and promotes them to active
 * observed_preference rows once they cross minOccurrences (default 3). */
export async function recomputeObservedPreferences(
  orgId: string,
  options: { minOccurrences?: number } = {},
) {
  const minOccurrences = options.minOccurrences ?? 3
  const events = await sql<{ id: string; tags: string[] }[]>`
    select id, tags from marketing_feedback_events where org_id = ${orgId}
  `

  const counts = new Map<string, { count: number; exampleIds: string[] }>()
  for (const event of events) {
    for (const tag of event.tags) {
      const key = NEGATIVE_TAGS_TO_RULE_KEY[tag]
      if (!key) continue
      const entry = counts.get(key) ?? { count: 0, exampleIds: [] }
      entry.count += 1
      entry.exampleIds.push(event.id)
      counts.set(key, entry)
    }
  }

  const created = []
  for (const [key, { count, exampleIds }] of counts.entries()) {
    if (count < minOccurrences) continue
    const [existing] = await sql<{ id: string }[]>`
      select id from marketing_learned_preferences where org_id = ${orgId} and key = ${key} limit 1
    `
    if (existing) {
      const [updated] = await sql`
        update marketing_learned_preferences
        set occurrence_count = ${count}, supporting_example_ids = ${sql.json(exampleIds)}, updated_at = now()
        where id = ${existing.id}
        returning *
      `
      created.push(updated)
    } else {
      const [inserted] = await sql`
        insert into marketing_learned_preferences
          (org_id, preference_type, key, value, supporting_example_ids, occurrence_count, status)
        values (
          ${orgId}, 'observed_preference', ${key},
          ${sql.json({ avoidTag: key.replace('avoid_tag:', '') })},
          ${sql.json(exampleIds)}, ${count}, 'active'
        )
        returning *
      `
      created.push(inserted)
    }
  }
  return created
}

export async function updatePreferenceStatus(preferenceId: string, status: PreferenceStatus) {
  await sql`
    update marketing_learned_preferences set status = ${status}, updated_at = now() where id = ${preferenceId}
  `
}

export async function deletePreference(preferenceId: string) {
  await sql`delete from marketing_learned_preferences where id = ${preferenceId}`
}

export async function resetPreferenceHistory(orgId: string) {
  await sql`delete from marketing_learned_preferences where org_id = ${orgId}`
}
