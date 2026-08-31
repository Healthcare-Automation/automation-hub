import sql from './db'

/** Same Postgres database as the rest of the hub (outreach_* tables, synced from
 * the UZU outbound engine's SQLite working DB — see
 * /root/projects/internal/outreach_automation/scripts/sync_to_postgres.py).
 * Mostly read-only from this app, with a documented set of writable exceptions
 * (LinkedIn approve/reject, email QA + inline edits, logged replies, and the
 * draft_requests queue) — see PRESERVE_COLS in sync_to_postgres.py and
 * db/postgres_schema.sql for the full list. */
export const outreachSql: typeof sql = sql

export const isOutreachConfigured = Boolean(process.env.DATABASE_URL)
