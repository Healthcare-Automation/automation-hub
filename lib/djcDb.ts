import postgres from 'postgres'

declare global {
  // eslint-disable-next-line no-var
  var _djcPgSql: ReturnType<typeof postgres> | null | undefined
}

/**
 * The DJC → Salesforce automation uses its OWN Supabase project (separate from Kimedics) for
 * pooler/credential isolation, so it gets a second connection string: DJC_DATABASE_URL.
 * Returns null when unset so the dashboard degrades gracefully instead of crashing.
 */
function createDjcSql(): ReturnType<typeof postgres> | null {
  const url = process.env.DJC_DATABASE_URL
  if (!url) return null
  return postgres(url, {
    ssl: 'require',
    // Supabase session pooler caps at 15 clients total across the hub, builds, Modal jobs, and
    // local scripts — keep the per-instance footprint minimal (2026-07-24 EMAXCONNSESSION outage).
    // One connection per instance, released fast. Vercel freezes a function between invocations, so
    // its pooled connections stay checked out and idle — 14 of the pooler's 15 slots were being held
    // this way, idle for minutes, while pages failed with EMAXCONNSESSION.
    max: 1,
    idle_timeout: 5,
    max_lifetime: 1800,
    // Fail fast instead of hanging forever if the pooler is unreachable/saturated.
    connect_timeout: 10,
    // Required for Supabase's transaction pooler (port 6543), which serverless should use —
    // transaction mode can't keep session-level prepared statements. Harmless on session mode too.
    prepare: false,
    connection: { application_name: 'proxi-status-djc' },
  })
}

const djcSql = globalThis._djcPgSql ?? createDjcSql()

if (process.env.NODE_ENV !== 'production') {
  globalThis._djcPgSql = djcSql
}

export const isDjcConfigured = djcSql !== null
export default djcSql
