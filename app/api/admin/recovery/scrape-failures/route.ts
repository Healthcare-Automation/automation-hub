import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'

/**
 * Surface jobs whose ingestion got stuck before they ever made it into Salesforce.
 *
 * The trigger is `job_create_failed` or `worksite_create_failed` in
 * job_event_log, with no subsequent `job_created_in_salesforce` for the same
 * job_id. These rows do NOT emit `sf_scrape_fields_error` (those only fire
 * after a Job__c record exists), so they're invisible to the existing recovery
 * list — yet they represent jobs we received an email for but never persisted.
 *
 * Common reasons surfaced in `payload.reason`:
 *   - `no_worksite_account_id`  — practice mapping or scrape came up empty.
 *   - `worksite_create_failed`  — Salesforce rejected the worksite create.
 *
 * We also pull the matching email_scrapes row (via run_id) so the UI can deep
 * link to the Kimedics job page for manual inspection / rescrape.
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
    WHERE jel.event_type IN ('job_create_failed', 'worksite_create_failed')
      AND jel.created_at >= NOW() - (${hours}::text || ' hours')::interval
      AND NOT EXISTS (
        -- Resolved by SF Job__c creation
        SELECT 1 FROM job_event_log ok
        WHERE ok.job_id = jel.job_id
          AND ok.event_type = 'job_created_in_salesforce'
          AND ok.created_at >= jel.created_at
      )
      AND NOT EXISTS (
        -- Resolved by a successful re-scrape: a later job_content row exists
        -- for the same job_id with the critical fields actually populated.
        -- This is what makes the row drop off the list once Rescrape worked.
        SELECT 1 FROM job_content jc_ok
        WHERE jc_ok.job_id = jel.job_id
          AND jc_ok.created_at >= jel.created_at
          AND COALESCE(jc_ok.title_line, '') <> ''
          AND COALESCE(jc_ok.description_full_text, '') <> ''
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
