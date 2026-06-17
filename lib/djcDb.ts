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
    max: 3,
    idle_timeout: 20,
    max_lifetime: 1800,
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
