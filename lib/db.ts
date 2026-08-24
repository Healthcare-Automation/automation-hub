import postgres from 'postgres'

declare global {
  // eslint-disable-next-line no-var
  var _pgSql: ReturnType<typeof postgres> | undefined
}

const MISSING_URL_ERROR = 'DATABASE_URL environment variable is not set'

/**
 * postgres.js never connects at construction time — connections open on the
 * first executed query. That lets builds without DATABASE_URL (Vercel
 * Preview, local checkouts) succeed even though modules like lib/queries.ts
 * call `sql.unsafe(...)` (a fragment builder, no I/O) at module scope: when
 * the var is missing we construct against a placeholder URL and intercept
 * QUERY EXECUTION (the tagged-template call) to throw the same clear error
 * the old eager check produced. Fragment helpers keep working; a real
 * misconfigured deployment still fails loudly on its first query.
 */
function createSql(): ReturnType<typeof postgres> {
  const url = process.env.DATABASE_URL
  const instance = postgres(url ?? 'postgresql://missing:missing@127.0.0.1:1/missing', {
    ssl: 'require',
    // Session pooler caps at 15 clients shared with builds/Modal/scripts — stay small
    // (2026-07-24 EMAXCONNSESSION outage).
    max: 2,
    idle_timeout: 20,
    // NO max_lifetime: its recycle timer fires on thaw after a Vercel
    // function freeze and terminates an already-destroyed socket, which
    // postgres.js raises as an unhandled rejection that crashes the render
    // (see lib/mohamedDb.ts, 2026-08-24). idle_timeout alone retires sockets.
    // Fail fast instead of hanging forever if the pooler is unreachable/saturated — a hang
    // stacks SSR requests and holds connections, which spirals the whole dashboard down.
    connect_timeout: 10,
    // Required for Supabase's transaction pooler (port 6543), which serverless should use —
    // transaction mode can't keep session-level prepared statements. Harmless on session mode too.
    prepare: false,
    connection: { application_name: 'proxi-status-page' },
  })
  if (url) return instance
  return new Proxy(instance, {
    apply() {
      throw new Error(MISSING_URL_ERROR)
    },
  })
}

const sql = globalThis._pgSql ?? createSql()

if (process.env.NODE_ENV !== 'production') {
  globalThis._pgSql = sql
}

export default sql
