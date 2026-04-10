import sql from './db'
import type { DayStatus, RunDetail, WeeklySummary } from './types'
import { getDayStatusKind } from './utils'

function generateDays(n: number): string[] {
  const days: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

function toDate(val: unknown): string {
  if (val instanceof Date) return val.toISOString().split('T')[0]
  return String(val).split('T')[0].split(' ')[0]
}

function toISOString(val: unknown): string {
  if (val instanceof Date) return val.toISOString()
  return String(val)
}

// Pair each gmail run with its next link_batch within 10 minutes.
// Used in all three queries so the "run count" always means one full pipeline cycle.
const PAIRED_CTE = `
  paired AS (
    SELECT
      g.id           AS gmail_id,
      g.started_at   AS started_at,
      g.finished_at  AS gmail_finished,
      b.id           AS batch_id,
      b.started_at   AS batch_started,
      b.finished_at  AS batch_finished
    FROM scrape_runs g
    LEFT JOIN LATERAL (
      SELECT id, started_at, finished_at
      FROM scrape_runs b2
      WHERE b2.run_type = 'link_batch'
        AND b2.started_at > g.started_at
        AND b2.started_at < g.started_at + INTERVAL '10 minutes'
      ORDER BY b2.started_at ASC
      LIMIT 1
    ) b ON true
    WHERE g.run_type = 'gmail'
  )
`

export async function getDailyStatus(): Promise<DayStatus[]> {
  const rows = await sql<Array<{
    day: Date | string
    total_runs: string | number
    completed_runs: string | number
    emails_scraped: string | number
    jobs_scraped: string | number
    sf_patches: string | number
    sf_errors: string | number
  }>>`
    WITH ${sql.unsafe(PAIRED_CTE)}
    SELECT
      date_trunc('day', p.started_at AT TIME ZONE 'UTC')::date AS day,
      count(DISTINCT p.gmail_id) AS total_runs,
      count(DISTINCT p.gmail_id) FILTER (
        WHERE p.gmail_finished IS NOT NULL
          AND (p.batch_id IS NULL OR p.batch_finished IS NOT NULL)
      ) AS completed_runs,
      count(DISTINCT es.id)  AS emails_scraped,
      count(DISTINCT jc.id)  AS jobs_scraped,
      count(DISTINCT jel.id) FILTER (WHERE jel.event_type = 'sf_scrape_fields_patched')                           AS sf_patches,
      count(DISTINCT jel.id) FILTER (WHERE jel.event_type IN ('sf_scrape_fields_error','sf_mapping_pull_failed')) AS sf_errors
    FROM paired p
    LEFT JOIN email_scrapes es  ON es.run_id  = p.gmail_id
    LEFT JOIN job_content   jc  ON jc.run_id  = p.batch_id
    LEFT JOIN job_event_log jel ON jel.run_id = p.batch_id
    WHERE p.started_at > NOW() - INTERVAL '90 days'
    GROUP BY date_trunc('day', p.started_at AT TIME ZONE 'UTC')::date
    ORDER BY 1 ASC
  `

  const dbMap = new Map<string, typeof rows[0]>()
  for (const row of rows) {
    dbMap.set(toDate(row.day), row)
  }

  return generateDays(90).map(day => {
    const row = dbMap.get(day)
    if (!row) {
      return { day, totalRuns: 0, completedRuns: 0, emailsScraped: 0, jobsScraped: 0, sfPatches: 0, sfErrors: 0, status: 'no_data' as const }
    }
    const totalRuns = Number(row.total_runs)
    const completedRuns = Number(row.completed_runs)
    const sfErrors = Number(row.sf_errors)
    return {
      day,
      totalRuns,
      completedRuns,
      emailsScraped: Number(row.emails_scraped),
      jobsScraped: Number(row.jobs_scraped),
      sfPatches: Number(row.sf_patches),
      sfErrors,
      status: getDayStatusKind({ totalRuns, completedRuns, emailsScraped: Number(row.emails_scraped), sfErrors }),
    }
  })
}

export async function getRecentRuns(limit = 20): Promise<RunDetail[]> {
  const rows = await sql<Array<{
    gmail_id:           number | string
    batch_id:           number | string | null
    started_at:         Date | string
    gmail_finished:     Date | string | null
    batch_finished:     Date | string | null
    gmail_secs:         string | number | null
    batch_secs:         string | number | null
    total_secs:         string | number | null
    email_count:        string | number
    job_count:          string | number
    sf_patch_count:     string | number
    sf_error_count:     string | number
    sf_error_details:   unknown
  }>>`
    WITH ${sql.unsafe(PAIRED_CTE)}
    SELECT
      p.gmail_id,
      p.batch_id,
      p.started_at,
      p.gmail_finished,
      p.batch_finished,
      EXTRACT(EPOCH FROM (p.gmail_finished  - p.started_at))    AS gmail_secs,
      EXTRACT(EPOCH FROM (p.batch_finished  - p.batch_started)) AS batch_secs,
      EXTRACT(EPOCH FROM (
        COALESCE(p.batch_finished, p.gmail_finished) - p.started_at
      )) AS total_secs,
      count(DISTINCT es.id)  AS email_count,
      count(DISTINCT jc.id)  AS job_count,
      count(DISTINCT jel.id) FILTER (WHERE jel.event_type = 'sf_scrape_fields_patched') AS sf_patch_count,
      count(DISTINCT jel.id) FILTER (WHERE jel.event_type IN ('sf_scrape_fields_error', 'sf_mapping_pull_failed')) AS sf_error_count,
      (
        SELECT COALESCE(
          json_agg(json_build_object(
            'jobId',     err.job_id,
            'eventType', err.event_type,
            'error',     COALESCE(
                           err.payload->>'error',
                           err.payload->>'detail',
                           err.payload->>'message',
                           'Salesforce sync failed'
                         )
          ) ORDER BY err.created_at),
          '[]'::json
        )
        FROM job_event_log err
        WHERE err.run_id = p.batch_id
          AND err.event_type IN ('sf_scrape_fields_error', 'sf_mapping_pull_failed')
        LIMIT 10
      ) AS sf_error_details
    FROM paired p
    LEFT JOIN email_scrapes es  ON es.run_id  = p.gmail_id
    LEFT JOIN job_content   jc  ON jc.run_id  = p.batch_id
    LEFT JOIN job_event_log jel ON jel.run_id = p.batch_id
    GROUP BY p.gmail_id, p.batch_id, p.started_at, p.gmail_finished,
             p.batch_started, p.batch_finished
    ORDER BY p.started_at DESC
    LIMIT ${limit}
  `

  return rows.map(row => {
    const startedAt  = toISOString(row.started_at)
    const gmailFinished = row.gmail_finished ? toISOString(row.gmail_finished) : null
    const batchFinished = row.batch_finished ? toISOString(row.batch_finished) : null
    const finishedAt = batchFinished ?? gmailFinished

    const gmailDurationSeconds = row.gmail_secs != null ? Math.round(Number(row.gmail_secs)) : null
    const batchDurationSeconds = row.batch_secs != null ? Math.round(Number(row.batch_secs)) : null
    const durationSeconds      = row.total_secs != null ? Math.round(Number(row.total_secs)) : null

    let status: RunDetail['status'] = 'running'
    if (gmailFinished && (row.batch_id === null || batchFinished)) {
      status = 'completed'
    } else {
      const ageMs = Date.now() - new Date(startedAt).getTime()
      if (ageMs > 60 * 60 * 1000) status = 'error'
    }

    let sfErrorDetails: import('./types').SFErrorDetail[] = []
    try {
      const raw = row.sf_error_details
      sfErrorDetails = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : [])
    } catch { sfErrorDetails = [] }

    return {
      id:                   Number(row.gmail_id),
      batchId:              row.batch_id != null ? Number(row.batch_id) : null,
      startedAt,
      finishedAt,
      gmailDurationSeconds,
      batchDurationSeconds,
      durationSeconds,
      emailCount:           Number(row.email_count),
      jobCount:             Number(row.job_count),
      sfPatchCount:         Number(row.sf_patch_count),
      sfErrorCount:         Number(row.sf_error_count),
      status,
      sfErrorDetails,
    }
  })
}

export async function getRunsForJobId(jobId: string): Promise<RunDetail[]> {
  const rows = await sql<Array<{
    gmail_id:           number | string
    batch_id:           number | string | null
    started_at:         Date | string
    gmail_finished:     Date | string | null
    batch_finished:     Date | string | null
    gmail_secs:         string | number | null
    batch_secs:         string | number | null
    total_secs:         string | number | null
    email_count:        string | number
    job_count:          string | number
    sf_patch_count:     string | number
    sf_error_count:     string | number
    sf_error_details:   unknown
  }>>`
    WITH ${sql.unsafe(PAIRED_CTE)}
    SELECT
      p.gmail_id,
      p.batch_id,
      p.started_at,
      p.gmail_finished,
      p.batch_finished,
      EXTRACT(EPOCH FROM (p.gmail_finished  - p.started_at))    AS gmail_secs,
      EXTRACT(EPOCH FROM (p.batch_finished  - p.batch_started)) AS batch_secs,
      EXTRACT(EPOCH FROM (
        COALESCE(p.batch_finished, p.gmail_finished) - p.started_at
      )) AS total_secs,
      count(DISTINCT es.id)  AS email_count,
      count(DISTINCT jc.id)  AS job_count,
      count(DISTINCT jel.id) FILTER (WHERE jel.event_type = 'sf_scrape_fields_patched') AS sf_patch_count,
      count(DISTINCT jel.id) FILTER (WHERE jel.event_type IN ('sf_scrape_fields_error', 'sf_mapping_pull_failed')) AS sf_error_count,
      (
        SELECT COALESCE(
          json_agg(json_build_object(
            'jobId',     err.job_id,
            'eventType', err.event_type,
            'error',     COALESCE(
                           err.payload->>'error',
                           err.payload->>'detail',
                           err.payload->>'message',
                           'Salesforce sync failed'
                         )
          ) ORDER BY err.created_at),
          '[]'::json
        )
        FROM job_event_log err
        WHERE err.run_id = p.batch_id
          AND err.job_id = ${jobId}
          AND err.event_type IN ('sf_scrape_fields_error', 'sf_mapping_pull_failed')
        LIMIT 10
      ) AS sf_error_details
    FROM paired p
    LEFT JOIN email_scrapes es  ON es.run_id  = p.gmail_id
    LEFT JOIN job_content   jc  ON jc.run_id  = p.batch_id AND jc.job_id = ${jobId}
    LEFT JOIN job_event_log jel ON jel.run_id = p.batch_id AND jel.job_id = ${jobId}
    WHERE jc.id IS NOT NULL
    GROUP BY p.gmail_id, p.batch_id, p.started_at, p.gmail_finished,
             p.batch_started, p.batch_finished
    ORDER BY p.started_at DESC
  `

  // Reuse mapping logic from getRecentRuns
  return rows.map(row => {
    const startedAt  = toISOString(row.started_at)
    const gmailFinished = row.gmail_finished ? toISOString(row.gmail_finished) : null
    const batchFinished = row.batch_finished ? toISOString(row.batch_finished) : null
    const finishedAt = batchFinished ?? gmailFinished

    const gmailDurationSeconds = row.gmail_secs != null ? Math.round(Number(row.gmail_secs)) : null
    const batchDurationSeconds = row.batch_secs != null ? Math.round(Number(row.batch_secs)) : null
    const durationSeconds      = row.total_secs != null ? Math.round(Number(row.total_secs)) : null

    let status: RunDetail['status'] = 'running'
    if (gmailFinished && (row.batch_id === null || batchFinished)) {
      status = 'completed'
    } else {
      const ageMs = Date.now() - new Date(startedAt).getTime()
      if (ageMs > 60 * 60 * 1000) status = 'error'
    }

    let sfErrorDetails: import('./types').SFErrorDetail[] = []
    try {
      const raw = row.sf_error_details
      sfErrorDetails = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : [])
    } catch { sfErrorDetails = [] }

    return {
      id:                   Number(row.gmail_id),
      batchId:              row.batch_id != null ? Number(row.batch_id) : null,
      startedAt,
      finishedAt,
      gmailDurationSeconds,
      batchDurationSeconds,
      durationSeconds,
      emailCount:           Number(row.email_count),
      jobCount:             Number(row.job_count),
      sfPatchCount:         Number(row.sf_patch_count),
      sfErrorCount:         Number(row.sf_error_count),
      status,
      sfErrorDetails,
    }
  })
}

export async function getValidationData(runId: number, jobId?: string) {
  // Get detailed job validation data for a specific run
  console.log('=== getValidationData Debug ===')
  console.log('Querying for runId:', runId)

  // Note: UI passes a pipeline "run id" (gmail anchor). Depending on how the
  // automation writes data, job_content may be keyed by either gmail run or
  // the paired link_batch run. This query tolerates both.
  const rows = await sql<Array<{
    id: number | string
    job_id: string
    job_post_id: string | null
    kimedics_link: string | null
    sf_job_id: string | null
    title_line: string | null
    location_line: string | null
    job_title: string | null
    practice_value: string | null
    city: string | null
    state: string | null
    posting_org: string | null
    priority: string | null
    status: string | null
    point_of_contact: string | null
    provider_start_date: string | null
    provider_end_date: string | null
    description_full_text: string | null
    raw_columns_json: unknown
    created_at: Date | string
    run_id: number | string | null
    email_scrape_id: number | string | null
    email_subject: string | null
    email_action_or_change: string | null
    email_created_at: Date | string | null
    events_this_run: unknown
    events_history: unknown
  }>>`
    SELECT
      jc.id,
      jc.job_id,
      jc.job_post_id,
      es.view_job_link as kimedics_link,
      es.subject as email_subject,
      es.action_or_change as email_action_or_change,
      es.created_at as email_created_at,
      jc.sf_job_id,
      jc.title_line,
      jc.location_line,
      jc.job_title,
      jc.practice_value,
      jc.city,
      jc.state,
      jc.posting_org,
      jc.priority,
      jc.status,
      jc.point_of_contact,
      jc.provider_start_date,
      jc.provider_end_date,
      jc.description_full_text,
      jc.raw_columns_json,
      jc.created_at,
      jc.run_id,
      jc.email_scrape_id,
      COALESCE(ev_this.events, '[]'::json)    AS events_this_run,
      COALESCE(ev_hist.events, '[]'::json)    AS events_history
    FROM job_content jc
    LEFT JOIN email_scrapes es ON es.id = jc.email_scrape_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id',        jel.id,
            'runId',     jel.run_id,
            'eventType', jel.event_type,
            'payload',   jel.payload,
            'createdAt', jel.created_at
          ) ORDER BY jel.created_at
        ),
        '[]'::json
      ) AS events
      FROM job_event_log jel
      WHERE jel.job_id = jc.job_id
        AND jc.run_id IS NOT NULL
        AND jel.run_id = jc.run_id
    ) ev_this ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id',        jel.id,
            'runId',     jel.run_id,
            'eventType', jel.event_type,
            'payload',   jel.payload,
            'createdAt', jel.created_at
          ) ORDER BY jel.created_at DESC
        ),
        '[]'::json
      ) AS events
      FROM (
        SELECT *
        FROM job_event_log jel
        WHERE jel.job_id = jc.job_id
          AND jel.event_type IN (
            'mapping_cache_hit','sf_mapping_skipped','sf_mapping_pull_failed',
            'mapping_ambiguous','mapping_ai_match','mapping_no_match',
            'sf_ids_update',
            'sf_sync_skipped_no_mapping','sf_scrape_fields_skip',
            'sf_scrape_fields_error','sf_scrape_fields_patched'
          )
        ORDER BY jel.created_at DESC
        LIMIT 50
      ) jel
    ) ev_hist ON true
    WHERE (
      jc.run_id = ${runId}
      OR (es.run_id = ${runId} AND jc.email_scrape_id = es.id)
    )
    ${jobId ? sql`AND jc.job_id = ${jobId}` : sql``}
    ORDER BY COALESCE(es.created_at, jc.created_at) DESC
  `

  console.log('Raw SQL result:', rows.length, 'rows found')
  if (rows.length > 0) {
    console.log('First row sample:', {
      id: rows[0].id,
      job_id: rows[0].job_id,
      sf_job_id: rows[0].sf_job_id,
      kimedics_link: rows[0].kimedics_link
    })
  }

  return rows.map(row => {
    type RawEvent = { id?: number; runId?: number; eventType: string; payload?: any; createdAt: string }
    const parseEvents = (raw: unknown): RawEvent[] => {
      try {
        const v = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : [])
        return Array.isArray(v) ? (v as RawEvent[]) : []
      } catch {
        return []
      }
    }

    const eventsThisRun = parseEvents(row.events_this_run)
    const eventsHistory = parseEvents(row.events_history)

    let rawData: Record<string, any> = {}
    try {
      rawData = typeof row.raw_columns_json === 'string' ? JSON.parse(row.raw_columns_json) : row.raw_columns_json || {}
    } catch {
      rawData = {}
    }

    // Family A: Salesforce ID resolution ("mapping") events
    const mappingEvents = eventsThisRun.filter(e =>
      ['mapping_cache_hit', 'sf_mapping_skipped', 'sf_mapping_pull_failed',
       'mapping_ambiguous', 'mapping_ai_match', 'mapping_no_match'].includes(e.eventType)
    )

    // Family B: Supabase mapping field update audit (prev/next)
    const mappingUpdateEvents = eventsThisRun.filter(e => e.eventType === 'sf_ids_update')

    // Family C: Salesforce PATCH of "scrape-sync" fields (client-visible field diffs)
    const salesforceFieldEvents = eventsThisRun.filter(e =>
      [
        'sf_sync_skipped_no_mapping',
        'sf_scrape_fields_skip',
        'sf_scrape_fields_error',
        'sf_scrape_fields_patched',
      ].includes(e.eventType)
    )

    // Extract mapping resolution details
    const mappingResolution = mappingUpdateEvents.map(e => ({
      eventId: e.id,
      runId: e.runId,
      createdAt: e.createdAt,
      source: e.payload?.source || 'unknown',
      detail: e.payload?.mapping_detail || '',
      status: e.payload?.mapping_status || '',
      fieldsChanged: e.payload?.fields_changed || [],
      prev: e.payload?.prev || {},
      next: e.payload?.next || {},
      updatedRows: e.payload?.updated_rows || {}
    }))[0] // Take the first one since there's usually only one per job

    // Extract Salesforce field changes with before/after (full audit: all compared fields, not only PATCH body)
    const patchedRows = salesforceFieldEvents
      .filter(e => e.eventType === 'sf_scrape_fields_patched')
      .map(e => ({
        ...e.payload,
        eventId: e.id,
        runId: e.runId,
        createdAt: e.createdAt,
        sfJobId: e.payload?.sf_job_id,
        fieldsChanged: e.payload?.fields_changed || [],
        fieldsCompared: e.payload?.fields_compared?.length
          ? e.payload.fields_compared
          : (e.payload?.fields_changed || []),
        prev: e.payload?.prev || {},
        next: e.payload?.next || {},
        auditOnly: false,
      }))

    const auditRows = salesforceFieldEvents
      .filter(e =>
        e.eventType === 'sf_scrape_fields_skip' &&
        e.payload?.reason === 'already_matches_salesforce' &&
        Array.isArray(e.payload?.fields_compared) &&
        e.payload.fields_compared.length > 0
      )
      .map(e => ({
        ...e.payload,
        eventId: e.id,
        runId: e.runId,
        createdAt: e.createdAt,
        sfJobId: e.payload?.sf_job_id,
        fieldsChanged: e.payload?.fields_changed || [],
        fieldsCompared: e.payload.fields_compared || [],
        prev: e.payload?.prev || {},
        next: e.payload?.next || {},
        auditOnly: true,
        skipReason: e.payload?.reason,
      }))

    const salesforceFieldPatches = [...patchedRows, ...auditRows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    // Extract skip/error reasons by family
    const mappingIssues = mappingEvents
      .filter(e => ['sf_mapping_skipped', 'sf_mapping_pull_failed', 'mapping_no_match', 'mapping_ambiguous'].includes(e.eventType))
      .map(e => ({
        type: e.eventType,
        message: e.payload?.error || e.payload?.reason || e.eventType,
        details: e.payload
      }))

    const salesforceIssues = salesforceFieldEvents
      .filter(e => ['sf_sync_skipped_no_mapping', 'sf_scrape_fields_skip', 'sf_scrape_fields_error'].includes(e.eventType))
      .reduce((acc, e) => {
        const key = `${e.eventType}_${e.payload?.reason || 'unknown'}`
        const existing = acc.find(item => item.key === key)
        if (existing) {
          existing.count += 1
          existing.details.fields = existing.details.fields || []
          if (e.payload?.field && !existing.details.fields.includes(e.payload.field)) {
            existing.details.fields.push(e.payload.field)
          }
        } else {
          acc.push({
            key,
            type: e.eventType,
            message: e.payload?.error || e.payload?.reason || e.eventType,
            count: 1,
            details: {
              ...e.payload,
              fields: e.payload?.field ? [e.payload.field] : []
            }
          })
        }
        return acc
      }, [] as Array<{key: string, type: string, message: string, count: number, details: any}>)

    // Legacy error extraction for backward compatibility
    const errors = [...mappingIssues, ...salesforceIssues].map(issue => issue.message).filter(Boolean)

    // Determine status based on sf_job_id and errors
    let status: 'success' | 'failed' | 'partial'
    if (!row.sf_job_id) {
      status = 'failed'
    } else if (errors.length > 0) {
      status = 'partial'
    } else {
      status = 'success'
    }

    // Build Kimedics data from job_content fields
    const kimedicsData: Record<string, any> = {
      title: row.title_line || row.job_title,
      location: row.location_line || `${row.city || ''}, ${row.state || ''}`.trim().replace(/^,|,$/, ''),
      practice: row.practice_value,
      posting_org: row.posting_org,
      priority: row.priority,
      status: row.status,
      point_of_contact: row.point_of_contact,
      provider_start_date: row.provider_start_date,
      provider_end_date: row.provider_end_date,
      description: row.description_full_text,
      ...rawData // Include any additional scraped fields
    }

    // Extract fields that have actual values (for comparison)
    const fieldsUpdated = Object.keys(kimedicsData).filter(key =>
      kimedicsData[key] &&
      kimedicsData[key] !== '' &&
      !['id', 'created_at', 'updated_at'].includes(key)
    )

    // Build comprehensive automation audit data
    return {
      id: String(row.id),
      jobId: String(row.job_id),
      jobPostId: row.job_post_id ? String(row.job_post_id) : null,
      runId: row.run_id != null ? Number(row.run_id) : null,
      emailScrapeId: row.email_scrape_id != null ? Number(row.email_scrape_id) : null,
      emailSubject: row.email_subject ?? null,
      emailActionOrChange: row.email_action_or_change ?? null,
      emailCreatedAt: row.email_created_at ? toISOString(row.email_created_at) : null,
      kimedicsLink: row.kimedics_link || '',
      sfJobId: row.sf_job_id,
      status,
      fieldsUpdated,
      kimedicsData,
      salesforceData: kimedicsData, // Will be enhanced with actual SF data in UI

      // Primary timeline source: only events attributable to this run_id
      eventsThisRun,

      // Family A + B: Salesforce Mapping
      mappingResolution,
      mappingIssues,

      // Family C: Salesforce Field Updates
      salesforceFieldPatches,
      salesforceIssues,

      // Raw events for debugging
      mappingEvents,
      salesforceFieldEvents,
      eventsHistory,

      // Legacy for backward compatibility
      errors,
      createdAt: toISOString(row.created_at),
    }
  })
}

/** Rolling 7-day window (`NOW() - 7 days`) — must match WeeklySummaryCards copy. */
export async function getWeeklySummary(): Promise<WeeklySummary> {
  const runAggSql = sql`
    WITH ${sql.unsafe(PAIRED_CTE)}
    SELECT
      count(*)  AS total,
      count(*) FILTER (
        WHERE gmail_finished IS NOT NULL
          AND (batch_id IS NULL OR batch_finished IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1 FROM job_event_log e
            WHERE e.run_id = paired.batch_id
              AND e.event_type IN ('sf_scrape_fields_error', 'sf_mapping_pull_failed')
          )
      ) AS completed
    FROM paired
  `

  const [
    emailRes,
    jobRes,
    sfRes,
    runRes,
    allTimeEmailRes,
    allTimeJobRes,
    allTimeSfRes,
    allTimeRunRes,
  ] = await Promise.all([
    sql`SELECT count(*) AS c FROM email_scrapes WHERE created_at > NOW() - INTERVAL '7 days'`,
    sql`SELECT count(*) AS c FROM job_content   WHERE created_at > NOW() - INTERVAL '7 days'`,
    sql`SELECT count(*) AS c FROM job_event_log WHERE event_type = 'sf_scrape_fields_patched' AND created_at > NOW() - INTERVAL '7 days'`,
    sql`${runAggSql} WHERE started_at > NOW() - INTERVAL '7 days'`,
    sql`SELECT count(*) AS c FROM email_scrapes`,
    sql`SELECT count(*) AS c FROM job_content`,
    sql`SELECT count(*) AS c FROM job_event_log WHERE event_type = 'sf_scrape_fields_patched'`,
    sql`${runAggSql}`,
  ])

  const totalRuns = Number(runRes[0]?.total ?? 0)
  const completedRuns = Number(runRes[0]?.completed ?? 0)
  const allTimeTotalRuns = Number(allTimeRunRes[0]?.total ?? 0)
  const allTimeCompletedRuns = Number(allTimeRunRes[0]?.completed ?? 0)

  return {
    emailsProcessed: Number(emailRes[0]?.c ?? 0),
    jobsScraped:     Number(jobRes[0]?.c ?? 0),
    sfPatches:       Number(sfRes[0]?.c ?? 0),
    totalRuns,
    completedRuns,
    successRate: totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 100) : 0,
    allTime: {
      emailsProcessed: Number(allTimeEmailRes[0]?.c ?? 0),
      jobsScraped:     Number(allTimeJobRes[0]?.c ?? 0),
      sfPatches:       Number(allTimeSfRes[0]?.c ?? 0),
      totalRuns:       allTimeTotalRuns,
      completedRuns:   allTimeCompletedRuns,
      successRate:
        allTimeTotalRuns > 0 ? Math.round((allTimeCompletedRuns / allTimeTotalRuns) * 100) : 0,
    },
  }
}
