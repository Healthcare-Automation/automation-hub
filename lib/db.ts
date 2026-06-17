import postgres from 'postgres'

declare global {
  // eslint-disable-next-line no-var
  var _pgSql: ReturnType<typeof postgres> | undefined
}

function createSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL environment variable is not set')
  return postgres(url, {
    ssl: 'require',
    max: 3,
    idle_timeout: 20,
    max_lifetime: 1800,
    // Fail fast instead of hanging forever if the pooler is unreachable/saturated — a hang
    // stacks SSR requests and holds connections, which spirals the whole dashboard down.
    connect_timeout: 10,
    // Required for Supabase's transaction pooler (port 6543), which serverless should use —
    // transaction mode can't keep session-level prepared statements. Harmless on session mode too.
    prepare: false,
    connection: { application_name: 'proxi-status-page' },
  })
}

const sql = globalThis._pgSql ?? createSql()

if (process.env.NODE_ENV !== 'production') {
  globalThis._pgSql = sql
}

export default sql
