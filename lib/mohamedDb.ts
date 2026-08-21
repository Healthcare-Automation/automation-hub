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
  return postgres(url, {
    ssl: 'require',
    // Same footprint rules as the other Supabase poolers (2026-07-24 EMAXCONNSESSION outage).
    max: 1,
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
