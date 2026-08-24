import postgres from 'postgres'

type Sql = ReturnType<typeof postgres>

declare global {
  // eslint-disable-next-line no-var
  var _mohamedPgSql: Sql | null | undefined
}

/**
 * The Mohamed billing automation has its OWN Supabase project holding only the
 * PHI-free run ledger (see /root/projects/mohamed/docs/run-ledger.md). The hub
 * connects with the read-only `mohamed_hub_reader` role via MOHAMED_DATABASE_URL.
 * getMohamedSql() returns null when unset so /mohamed falls back to the
 * synthetic ledger.
 */
function createMohamedSql(): Sql | null {
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
    // page's Promise.all([ledger, history, inFlight, questions]) actually run
    // in parallel instead of queuing behind each other on one connection.
    max: 3,
    // Close idle sockets almost immediately: any socket that survives a
    // Vercel function freeze is dead on thaw, and a query on it hangs.
    // Server-side pooling (Supabase transaction pooler) makes reconnects
    // cheap, so there is no benefit to keeping client sockets warm.
    idle_timeout: 2,
    // NO max_lifetime: its recycle timer fires on thaw after a freeze and
    // writes a terminate to an already-destroyed socket, which postgres.js
    // surfaces as an UNHANDLED REJECTION (write CONNECTION_DESTROYED) that
    // crashes the whole page render — this was the /mohamed "flips to a
    // different page on every refresh" bug (Vercel logs, 2026-08-24).
    connect_timeout: 10,
    prepare: false,
    connection: { application_name: 'automation-hub-mohamed' },
  })
}

let client: Sql | null | undefined

/** Current pool, created lazily so mohamedResetPool() can swap it. */
export function getMohamedSql(): Sql | null {
  if (client === undefined) client = createMohamedSql()
  return client
}

/**
 * Drop the cached pool so the next query builds fresh connections.
 * Needed because Vercel freezes function instances: a TCP socket cached in
 * module scope can be dead on thaw, and a query on a dead socket HANGS
 * (connect_timeout only guards new connections). mohamedQuery() calls this
 * when its watchdog fires.
 */
export function mohamedResetPool(): void {
  const old = client
  client = undefined
  // Close the old pool in the background; never await it on the request path.
  void old?.end({ timeout: 1 }).catch(() => {})
}

const QUERY_TIMEOUT_MS = 6_000

export class MohamedDbTimeout extends Error {
  constructor() {
    super('mohamed_db_timeout')
  }
}

async function raceTimeout<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = getMohamedSql()
  if (!sql) throw new MohamedDbTimeout()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fn(sql),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new MohamedDbTimeout()), QUERY_TIMEOUT_MS)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Run a Mohamed-ledger query with a hang watchdog: if it does not settle in
 * 6s, assume a dead cached socket, reset the pool, and retry ONCE on fresh
 * connections. A second timeout throws MohamedDbTimeout — callers already
 * treat any throw as "degrade, don't 500" (synthetic ledger / empty list).
 * The page's worst case becomes ~12s degraded instead of an endless hang.
 */
export async function mohamedQuery<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  if (!isMohamedLedgerConfigured) throw new MohamedDbTimeout()
  try {
    return await raceTimeout(fn)
  } catch (err) {
    if (!(err instanceof MohamedDbTimeout)) throw err
    mohamedResetPool()
    return await raceTimeout(fn)
  }
}

export const isMohamedLedgerConfigured = getMohamedSql() !== null

/**
 * Back-compat default export: the pool created at module load. Prefer
 * mohamedQuery() for reads — direct use of this handle bypasses the hang
 * watchdog and will wait forever on a dead socket.
 */
const mohamedSql = getMohamedSql()
export default mohamedSql
