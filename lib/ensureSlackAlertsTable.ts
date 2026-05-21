import sql from '@/lib/db'

let hasRun = false

/**
 * Lazy schema bootstrap for the slack_alerts table. First call in a given
 * process runs the CREATE TABLE / CREATE INDEX (both IF NOT EXISTS so they're
 * idempotent against an already-provisioned DB); subsequent calls short-circuit
 * via an in-memory flag.
 *
 * Mirrors the pattern used by proxi_salesforce_automation's ensure_tables
 * helper since this repo has no migration runner.
 */
export async function ensureSlackAlertsTable(): Promise<void> {
  if (hasRun) return
  await sql`
    CREATE TABLE IF NOT EXISTS slack_alerts (
      id              BIGSERIAL PRIMARY KEY,
      job_id          TEXT       NOT NULL,
      event_type      TEXT       NOT NULL,
      source_event_id BIGINT     NOT NULL,
      automation      TEXT       NOT NULL DEFAULT 'kimedics_sf_pipeline',
      channel         TEXT       NOT NULL,
      message_ts      TEXT       NOT NULL,
      posted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at     TIMESTAMPTZ,
      resolved_by     TEXT,
      UNIQUE (job_id, event_type, source_event_id)
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS idx_slack_alerts_open
      ON slack_alerts (job_id, event_type)
      WHERE resolved_at IS NULL
  `
  hasRun = true
}
