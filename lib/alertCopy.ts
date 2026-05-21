/**
 * Client-facing plain-English copy for pipeline error event types. This is the
 * canonical surface for what non-technical clients read in Slack. Keep wording
 * concrete and human; never expose raw event type identifiers.
 */

export type AlertCopy = { title: string; body: string }

export const ERROR_COPY: Record<string, AlertCopy> = {
  worksite_create_failed: {
    title: 'Job stuck in sync',
    body:
      "A new job was received from Kimedics but couldn't be saved into Salesforce.\n" +
      "Most likely cause: the practice page didn't load (login wall / page change).",
  },
  job_create_failed: {
    title: 'Job stuck in sync',
    body:
      "A new job was received from Kimedics but couldn't be saved into Salesforce.\n" +
      "Most likely cause: the worksite for this practice couldn't be created automatically.",
  },
  sf_scrape_fields_error: {
    title: 'Field update failed',
    body:
      'A job is in Salesforce, but one of the field updates ' +
      "didn't go through.\n" +
      'The system will retry; usually this clears itself on the next run.',
  },
  sf_mapping_pull_failed: {
    title: 'Salesforce mapping unavailable',
    body:
      "We couldn't read Salesforce's field mappings, so updates are paused.\n" +
      'Most likely cause: Salesforce was temporarily unreachable.',
  },
  mapping_blocked_no_practice_value: {
    title: 'Sync paused — no practice info',
    body:
      "This job arrived without a practice or location, so we couldn't decide where it belongs in Salesforce.\n" +
      "Most likely cause: the Kimedics page didn't load (login wall / page change).",
  },
  scrape_silent_failure: {
    title: 'Scrape returned nothing',
    body:
      'The system fetched the Kimedics page but came back with no content.\n' +
      'The system will retry automatically on the next pipeline run.',
  },
  sf_field_quarantined: {
    title: 'One field dropped during sync',
    body:
      'Salesforce rejected one of the field values, so the system dropped that field and saved the rest of the job.\n' +
      'The dropped field needs a fix — the rest of the record is up to date.',
  },
  sf_push_unhandled_error: {
    title: 'Sync issue — unrecognized error',
    body:
      "Salesforce returned an error the automatic recovery engine doesn't know how to handle yet.\n" +
      'The team has been paged to look into it.',
  },
  mapping_no_match: {
    title: 'Sync paused — no Salesforce match',
    body:
      "The system couldn't find a Salesforce match for this practice, and the create step didn't complete on its own.\n" +
      "This usually fixes itself in 10 minutes; the team has been paged in case it doesn't.",
  },
}

export const GENERIC_FALLBACK: AlertCopy = {
  title: 'Sync issue',
  body:
    'The system encountered an unexpected problem with this job.\n' +
    'The team has been notified and is looking into it.',
}

export function getAlertCopy(eventType: string): AlertCopy {
  return ERROR_COPY[eventType] ?? GENERIC_FALLBACK
}

/**
 * Body shown on a resolved (green) Slack message, keyed by the recovery
 * event type that caused us to flip the alert. Falls back to a generic
 * "now synced" line if a new recovery event lands without a copy entry.
 */
export const RESOLVED_BODY: Record<string, string> = {
  job_created_in_salesforce: 'This job is now successfully saved in Salesforce.',
  sf_scrape_fields_patched: 'All fields are now synced to Salesforce.',
  sf_scrape_fields_recovered:
    'The automatic recovery succeeded. All fields are now synced.',
  manual_rescrape_completed:
    'A team member fixed this manually. The job is now synced.',
  auto_retry_completed: 'The retry succeeded. The job is now synced.',
  sf_ids_update: 'Mapping resolved. This job is now wired up in Salesforce.',
  mapping_ai_match: 'An automated match resolved this job. It\'s now wired up in Salesforce.',
  worksite_created: 'A new worksite was created. This job is now in Salesforce.',
}

export const RESOLVED_FALLBACK = 'This job is now synced to Salesforce.'

export function getResolvedBody(recoveryEventType: string): string {
  return RESOLVED_BODY[recoveryEventType] ?? RESOLVED_FALLBACK
}

/**
 * Maps the recovery event type to a short tag we store in slack_alerts.resolved_by.
 * Lets ops queries explain *why* an alert flipped without re-joining job_event_log.
 */
export function getResolvedByTag(recoveryEventType: string): string {
  switch (recoveryEventType) {
    case 'manual_rescrape_completed':
      return 'manual_recovery'
    case 'sf_scrape_fields_patched':
      return 'patched'
    case 'sf_scrape_fields_recovered':
      return 'recovered'
    case 'auto_retry_completed':
    case 'job_created_in_salesforce':
      return 'auto_retry'
    case 'sf_ids_update':
      return 'mapping_resolved'
    case 'mapping_ai_match':
      return 'ai_match'
    case 'worksite_created':
      return 'worksite_created'
    default:
      return 'other'
  }
}
