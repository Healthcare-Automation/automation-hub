/**
 * User-facing labels for Salesforce ID resolution (`sf_ids_update.payload.source`
 * from `update_sf_ids_for_job` in Python).
 *
 * Order in resolver: external id → practice → AI; see `sf_job_supabase_resolve.py`.
 */
const SOURCE_LABELS: Record<string, string> = {
  sf_external_job_id_match: 'External Job ID',
  sf_practice_match: 'Practice (Client Job Id)',
  sf_ai_match: 'AI practice match',
  job_content_history: 'Earlier scrape (job_content)',
  sf_create_job: 'After new Job__c create',
  sf_existing_by_external_id_query: 'Existing Job__c (SOQL by External Job Id)',
}

/**
 * Timeline / card titles for `job_event_log` rows that are not `sf_ids_update`.
 */
const LOG_EVENT_TITLES: Record<string, string> = {
  mapping_cache_hit: 'Mapping: already linked',
  mapping_no_match: 'Mapping: no match',
  mapping_ambiguous: 'Mapping: ambiguous',
  mapping_ai_match: 'Mapping: AI match',
  sf_mapping_skipped: 'Mapping: Salesforce pull skipped',
  sf_mapping_pull_failed: 'Mapping: Salesforce pull failed',
  sf_scrape_fields_recovered: 'Salesforce push recovered',
  sf_field_quarantined: 'Field quarantined (parser fix needed)',
  sf_push_unhandled_error: 'Salesforce push: unhandled error',
}

export function humanizeMappingSource(source: string | null | undefined): string {
  const s = (source ?? '').trim()
  if (!s || s === 'unknown') return 'Unknown'
  return SOURCE_LABELS[s] ?? s.replace(/^sf_/, '').replaceAll('_', ' ')
}

export function humanizeMappingLogEventTitle(eventType: string): string {
  return LOG_EVENT_TITLES[eventType] ?? eventType.replaceAll('_', ' ')
}
