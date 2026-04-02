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

export async function getWeeklySummary(): Promise<WeeklySummary> {
  const [emailRes, jobRes, sfRes, runRes] = await Promise.all([
    sql`SELECT count(*) AS c FROM email_scrapes WHERE created_at > NOW() - INTERVAL '7 days'`,
    sql`SELECT count(*) AS c FROM job_content   WHERE created_at > NOW() - INTERVAL '7 days'`,
    sql`SELECT count(*) AS c FROM job_event_log WHERE event_type = 'sf_scrape_fields_patched' AND created_at > NOW() - INTERVAL '7 days'`,
    // Count pipeline runs — "completed" means finished AND zero SF errors
    sql`
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
      WHERE started_at > NOW() - INTERVAL '7 days'
    `,
  ])

  const totalRuns = Number(runRes[0]?.total ?? 0)
  const completedRuns = Number(runRes[0]?.completed ?? 0)

  return {
    emailsProcessed: Number(emailRes[0]?.c ?? 0),
    jobsScraped:     Number(jobRes[0]?.c ?? 0),
    sfPatches:       Number(sfRes[0]?.c ?? 0),
    totalRuns,
    completedRuns,
    successRate: totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 100) : 0,
  }
}
