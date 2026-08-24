import postgres from 'postgres'

declare global {
  // eslint-disable-next-line no-var
  var _cbPgSql: ReturnType<typeof postgres> | null | undefined
}

/**
 * The DJC Candidate Bank stores scraped candidates in the "Job Board [Internal]" Supabase project
 * (separate from both Kimedics and the DJC→SF automation), so it gets its own connection string:
 * CANDIDATE_BANK_DATABASE_URL. Returns null when unset so the dashboard degrades gracefully.
 */
function createCbSql(): ReturnType<typeof postgres> | null {
  const url = process.env.CANDIDATE_BANK_DATABASE_URL
  if (!url) return null
  return postgres(url, {
    ssl: 'require',
    max: 3,
    idle_timeout: 20,
    // NO max_lifetime: its recycle timer fires on thaw after a Vercel
    // function freeze and terminates an already-destroyed socket, which
    // postgres.js raises as an unhandled rejection that crashes the render
    // (see lib/mohamedDb.ts, 2026-08-24). idle_timeout alone retires sockets.
    connect_timeout: 10,
    // Supabase transaction pooler (6543) can't keep session-level prepared statements.
    prepare: false,
    connection: { application_name: 'proxi-status-candidate-bank' },
  })
}

const cbSql = globalThis._cbPgSql ?? createCbSql()

if (process.env.NODE_ENV !== 'production') {
  globalThis._cbPgSql = cbSql
}

export const isCandidateBankConfigured = cbSql !== null
export default cbSql
