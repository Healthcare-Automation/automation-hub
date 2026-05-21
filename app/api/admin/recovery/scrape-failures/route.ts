import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'

/**
 * Surface jobs whose ingestion got stuck before they ever made it into Salesforce.
 *
 * Triggers — any of these event types in job_event_log, with no later success marker for the same job_id:
 *   - `job_create_failed`                — Salesforce rejected the Job__c POST.
 *   - `worksite_create_failed`           — Salesforce rejected the Worksite__c POST.
 *   - `mapping_no_match`                 — resolver couldn't find a Salesforce match for this practice.
 *   - `mapping_review_required`          — resolver bailed because an existing SF Job__c
 *                                          shares the resolved worksite + city/state.
 *   - `mapping_ambiguous`                — resolver found multiple matching Salesforce candidates.
 *
 * "Success marker" = any of `job_created_in_salesforce`, `sf_ids_update`,
 * `sf_scrape_fields_patched`, `sf_scrape_fields_recovered`, `mapping_ai_match`,
 * or a `manual_rescrape_completed` / `auto_retry_completed` with action
 * `re_scraped`. Any later event of those types means the stuck state was
 * resolved and the row should drop off the list.
 *
 * Common reasons surfaced in `payload.reason`:
 *   - `no_worksite_account_id`                              — practice mapping or scrape came up empty.
 *   - `worksite_create_failed`                              — Salesforce rejected the worksite create.
 *   - `existing_job_at_resolved_worksite_with_matching_location` — see resolver punt #1.
 *
 * Query params:
 *   hours — lookback window in hours (default 48, capped at 14d).
 */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value
  if (!(await verifyAdminCookieValue(cookie))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const hoursRaw = req.nextUrl.searchParams.get('hours')
  const hours = Math.min(Math.max(Number(hoursRaw ?? 48) || 48, 1), 24 * 14)

  const rows = await sql<Array<{
    job_id: string
    event_type: string
    run_id: number | null
    reason: string | null
    detail: string | null
    error_message: string | null
    practice_value: string | null
    created_at: Date | string
  }>>`
    SELECT DISTINCT ON (jel.job_id)
      jel.job_id,
      jel.event_type,
      jel.run_id,
      jel.payload->>'reason'  AS reason,
      jel.payload->>'detail'  AS detail,
      jel.payload->>'error'   AS error_message,
      jel.payload->>'practice' AS practice_value,
      jel.created_at
    FROM job_event_log jel
    WHERE jel.event_type IN (
            'job_create_failed',
            'worksite_create_failed',
            'mapping_no_match',
            'mapping_review_required',
            'mapping_ambiguous'
          )
      AND jel.created_at >= NOW() - (${hours}::text || ' hours')::interval
      AND NOT EXISTS (
        -- Resolved by any later success marker for the same job_id.
        SELECT 1 FROM job_event_log ok
        WHERE ok.job_id = jel.job_id
          AND ok.created_at >= jel.created_at
          AND (
            ok.event_type IN (
              'job_created_in_salesforce',
              'sf_ids_update',
              'sf_scrape_fields_patched',
              'sf_scrape_fields_recovered',
              'mapping_ai_match'
            )
            OR (
              ok.event_type IN ('manual_rescrape_completed', 'auto_retry_completed')
              AND COALESCE(ok.payload->>'action', '') IN ('re_scraped', 're_scraped_with_warning')
            )
          )
      )
    ORDER BY jel.job_id, jel.created_at DESC
  `

  return NextResponse.json({
    ok: true,
    hours,
    items: rows.map((r) => ({
      jobId: String(r.job_id),
      eventType: r.event_type,
      runId: r.run_id != null ? Number(r.run_id) : null,
      reason: r.reason,
      detail: r.detail,
      errorMessage: r.error_message,
      practiceValue: r.practice_value,
      kimedicsLink: `https://portal.kimedics.com/app/workspace/job-posts/${encodeURIComponent(String(r.job_id))}`,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    })),
  })
}
