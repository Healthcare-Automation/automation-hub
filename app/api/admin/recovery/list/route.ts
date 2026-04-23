import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'

/**
 * Return unresolved SF push errors in the window. One row per job (most recent error).
 *
 * Query params:
 *   hours — lookback window in hours (default 48).
 */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value
  if (!(await verifyAdminCookieValue(cookie))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const hoursRaw = req.nextUrl.searchParams.get('hours')
  const hours = Math.min(Math.max(Number(hoursRaw ?? 48) || 48, 1), 24 * 14)

  const rows = await sql<Array<{
    id: number
    job_id: string
    event_type: string
    run_id: number | null
    payload: any
    created_at: Date | string
  }>>`
    SELECT DISTINCT ON (jel.job_id)
      jel.id, jel.job_id, jel.event_type, jel.run_id, jel.payload, jel.created_at
    FROM job_event_log jel
    WHERE jel.event_type IN ('sf_scrape_fields_error', 'sf_mapping_pull_failed')
      AND jel.created_at >= NOW() - (${hours}::text || ' hours')::interval
      AND NOT EXISTS (
        SELECT 1 FROM job_event_log ok
        WHERE ok.job_id = jel.job_id
          AND ok.event_type IN ('sf_scrape_fields_patched','sf_scrape_fields_recovered')
          AND ok.created_at >= jel.created_at
      )
    ORDER BY jel.job_id, jel.created_at DESC
  `

  return NextResponse.json({
    ok: true,
    hours,
    items: rows.map((r) => ({
      id: Number(r.id),
      jobId: String(r.job_id),
      eventType: r.event_type,
      runId: r.run_id != null ? Number(r.run_id) : null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      error: r.payload?.error ?? r.payload?.detail ?? r.payload?.reason ?? '',
      attempt: r.payload?.attempt ?? null,
    })),
  })
}
