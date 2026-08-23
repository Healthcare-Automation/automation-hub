import postgres from 'postgres'

declare global {
  // eslint-disable-next-line no-var
  var _mohamedPgSql: ReturnType<typeof postgres> | null | undefined
}

/**
 * The Mohamed billing automation has its OWN Supabase project holding only the
 * PHI-free run ledger (see /root/projects/mohamed/docs/run-ledger.md). The hub
 * connects with the read-only `mohamed_hub_reader` role via MOHAMED_DATABASE_URL.
 * Returns null when unset so /mohamed falls back to the synthetic ledger.
 */
function createMohamedSql(): ReturnType<typeof postgres> | null {
  const url = process.env.MOHAMED_DATABASE_URL
  if (!url) return null
  // `vercel env pull` writes the literal placeholder "[SENSITIVE]" for env
  // vars flagged Sensitive — it is not a URL and crashed every local
  // `next build` at module load. Treat any non-postgres value as unset.
  if (!url.startsWith('postgres')) return null
  return postgres(url, {
    ssl: 'require',
    // This is a dedicated pooler for the Mohamed project alone (2 roles:
    // hub_reader, vps_writer) — not the shared DJC/Kimedics pooler that hit
    // EMAXCONNSESSION from too many idle connections. max:3 (not 1) lets the
    // page's Promise.all([ledger, history, inFlight]) actually run those
    // queries in parallel instead of queuing behind each other on one
    // connection, which was serializing what should be a single round trip.
    max: 3,
    idle_timeout: 5,
    max_lifetime: 1800,
    connect_timeout: 10,
    prepare: false,
    connection: { application_name: 'automation-hub-mohamed' },
  })
}

const mohamedSql = globalThis._mohamedPgSql ?? createMohamedSql()

if (process.env.NODE_ENV !== 'production') {
  globalThis._mohamedPgSql = mohamedSql
}

export const isMohamedLedgerConfigured = mohamedSql !== null
export default mohamedSql
