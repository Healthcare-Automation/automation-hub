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
    // Session pooler caps at 15 clients shared with builds/Modal/scripts — stay small
    // (2026-07-24 EMAXCONNSESSION outage).
    max: 2,
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

/**
 * Lazy proxy: the missing-DATABASE_URL error now fires on the FIRST QUERY,
 * not at module load. `next build`'s page-data collection imports every
 * route module; with an eager createSql() any environment without
 * DATABASE_URL (Vercel Preview, local checkouts) failed the whole build
 * before a single request existed. Behavior at runtime is unchanged —
 * queries still throw the same error when the var is really missing.
 */
let _cached: ReturnType<typeof postgres> | undefined

function getSql(): ReturnType<typeof postgres> {
  if (!_cached) {
    _cached = globalThis._pgSql ?? createSql()
    if (process.env.NODE_ENV !== 'production') {
      globalThis._pgSql = _cached
    }
  }
  return _cached
}

const sql: ReturnType<typeof postgres> = new Proxy((() => {}) as unknown as ReturnType<typeof postgres>, {
  apply(_target, _thisArg, args) {
    return Reflect.apply(getSql() as unknown as (...a: unknown[]) => unknown, undefined, args)
  },
  get(_target, prop) {
    const real = getSql() as unknown as Record<string | symbol, unknown>
    const value = real[prop]
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(real) : value
  },
})

export default sql
