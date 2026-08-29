import sql from './db'

/** Same Postgres database as the rest of the hub (outreach_* tables, synced from
 * the UZU outbound engine's SQLite working DB — see
 * /root/projects/internal/outreach_automation/scripts/sync_to_postgres.py).
 * Read-only from this app: the dashboard never writes back into outreach_* tables. */
export const outreachSql: typeof sql = sql

export const isOutreachConfigured = Boolean(process.env.DATABASE_URL)
