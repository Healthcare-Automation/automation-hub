/**
 * job_event_log rows for scrape→SF sync are sometimes missing from the strict
 * "this run" SQL match (NULL run_id, different scrape_runs id, or time window).
 * History still contains them — merge so hub timeline + field diffs see the same PATCH.
 */

export const SF_FIELD_SYNC_EVENT_TYPES = [
  'sf_sync_skipped_no_mapping',
  'sf_scrape_fields_skip',
  'sf_scrape_fields_error',
  'sf_scrape_fields_patched',
] as const

export type JobLogEvent = {
  id?: number
  eventType: string
  createdAt: string
  payload?: Record<string, any>
  runId?: number
}

function isSfFieldSyncType(t: string): boolean {
  return (SF_FIELD_SYNC_EVENT_TYPES as readonly string[]).includes(t)
}

/** Deduped list of SF field-sync events: this run + history (by id). */
export function mergeSalesforceFieldSyncEvents(
  thisRun: JobLogEvent[],
  history: JobLogEvent[],
): JobLogEvent[] {
  const fromRun = thisRun.filter(e => isSfFieldSyncType(e.eventType))
  const ids = new Set(fromRun.map(e => e.id).filter((x): x is number => x != null && x !== 0))

  // Constrain history merges to the same time window as "this run".
  // This prevents the ValidationPopup from showing SF field-sync events from unrelated runs.
  const times = fromRun
    .map(e => new Date(e.createdAt).getTime())
    .filter(t => Number.isFinite(t) && t > 0)
  const minT = times.length ? Math.min(...times) : 0
  const maxT = times.length ? Math.max(...times) : 0
  const slackMs = 15 * 60 * 1000

  const extra = history.filter(e => {
    if (!isSfFieldSyncType(e.eventType)) return false
    if (e.id != null && e.id !== 0 && ids.has(e.id)) return false
    if (minT && maxT) {
      const t = new Date(e.createdAt).getTime()
      if (!Number.isFinite(t) || t < (minT - slackMs) || t > (maxT + slackMs)) return false
    }
    return true
  })
  return [...fromRun, ...extra]
}

/** Full timeline for ValidationPopup: non–field-sync events from this run only, plus merged SF sync events. */
export function mergeTimelineEvents(thisRun: JobLogEvent[], history: JobLogEvent[]): JobLogEvent[] {
  const sf = mergeSalesforceFieldSyncEvents(thisRun, history)
  const nonSf = thisRun.filter(e => !isSfFieldSyncType(e.eventType))
  return [...nonSf, ...sf].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
}
