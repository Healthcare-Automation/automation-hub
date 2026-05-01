import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'

/**
 * Recent manual-push recovery history.
 *
 * Returns ``sf_scrape_fields_recovered`` and ``sf_field_quarantined`` events
 * whose payload.invocation indicates a manual run (admin UI or CLI).
 *
 * Query params:
 *   limit — max rows (default 50, max 500).
 */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value
  if (!(await verifyAdminCookieValue(cookie))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const rawLimit = Number(req.nextUrl.searchParams.get('limit') ?? 50) || 50
  const limit = Math.min(Math.max(rawLimit, 1), 500)

  const rows = await sql<Array<{
    id: number
    job_id: string
    event_type: string
    run_id: number | null
    payload: any
    created_at: Date | string
  }>>`
    SELECT id, job_id, event_type, run_id, payload, created_at
    FROM job_event_log
    WHERE event_type IN (
        'sf_scrape_fields_recovered',
        'sf_field_quarantined',
        'sf_push_unhandled_error',
        'manual_rescrape_completed'
      )
      AND payload->>'invocation' IN ('manual_cli', 'manual_admin_ui')
    ORDER BY created_at DESC,
             CASE event_type
               WHEN 'sf_scrape_fields_recovered' THEN 0
               WHEN 'manual_rescrape_completed'  THEN 1
               WHEN 'sf_field_quarantined'       THEN 2
               WHEN 'sf_push_unhandled_error'    THEN 3
               ELSE 4
             END,
             id DESC
    LIMIT ${limit}
  `

  return NextResponse.json({
    ok: true,
    items: rows.map((r) => ({
      id: Number(r.id),
      jobId: String(r.job_id),
      eventType: r.event_type,
      runId: r.run_id != null ? Number(r.run_id) : null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      invocation: r.payload?.invocation ?? null,
      invoker: r.payload?.invoker ?? null,
      action: r.payload?.action ?? null,
      fieldsPushed: Array.isArray(r.payload?.fields_pushed) ? r.payload.fields_pushed : [],
      fieldsQuarantined: Array.isArray(r.payload?.fields_quarantined) ? r.payload.fields_quarantined : [],
      field: r.payload?.field ?? null,
      offendingFields: Array.isArray(r.payload?.offending_fields) ? r.payload.offending_fields : [],
      sfJobId: r.payload?.sf_job_id ?? null,
      error: r.payload?.sf_error ?? r.payload?.original_error ?? r.payload?.error ?? null,
    })),
  })
}
