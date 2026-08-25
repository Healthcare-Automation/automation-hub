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
    // EMAXCONNSESSION from too many idle connections. max:4 matches the 4
    // concurrent query streams the page actually issues in parallel
    // (ledger, history, in-flight run, questions — see app/mohamed/page.tsx's
    // Promise.allSettled); at max:3 the 4th stream queued behind whichever
    // of the other three finished first, adding latency that looked like
    // random slow/degraded components on every other page load.
    max: 4,
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
// Bumped every time the pool is swapped, so a reset triggered by one of
// several concurrent queries on the SAME pool doesn't get repeated by its
// siblings — they're all about to fail the same way, and re-resetting adds
// nothing but more forced socket closes.
let generation = 0

/** Current pool, created lazily so mohamedResetPool() can swap it. */
export function getMohamedSql(): Sql | null {
  if (client === undefined) client = createMohamedSql()
  return client
}

/** Current pool generation, for callers that want to guard a reset against
 * being repeated by sibling queries that fail on the same dead pool. */
export function mohamedPoolGeneration(): number {
  return generation
}

/**
 * Drop the cached pool so the next query builds fresh connections.
 * Needed because Vercel freezes function instances: a TCP socket cached in
 * module scope can be dead on thaw, and a query on a dead socket HANGS
 * (connect_timeout only guards new connections). mohamedQuery() calls this
 * when its watchdog fires.
 *
 * Regression (Andy, 2026-08-25 — "keeps re-connecting, components
 * disappearing"): a single page load fires 6-7 queries in parallel
 * (ledger, history, outcome signals, in-flight run, questions, approvals),
 * ALL sharing this one pool. The old `old.end({timeout: 1})` force-killed
 * that shared pool within 1 SECOND of any one query's failure — cutting
 * off the other 5 queries mid-flight even though they were healthy,
 * cascading one flaky connection into several components going degraded
 * at once. Two fixes: (1) let the old pool drain gracefully instead of
 * guillotining live queries on it, since callers already stopped
 * referencing it as `client` so there's no correctness reason to rush; (2)
 * a generation guard so N queries failing around the same moment on the
 * same dead pool only trigger ONE reset, not N redundant ones.
 */
export function mohamedResetPool(expectedGeneration?: number): void {
  if (expectedGeneration !== undefined && expectedGeneration !== generation) return
  const old = client
  client = undefined
  generation += 1
  // Close the old pool gracefully in the background — never await it on the
  // request path, and never force-cut queries that are still legitimately
  // in flight on it. New queries never see this handle again regardless.
  void old?.end().catch(() => {})
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
 * Run a Mohamed-ledger query with a hang watchdog AND a dead-socket retry:
 * if it does not settle in 6s (dead cached socket hangs) OR fails with any
 * connection-level error (dead cached socket writes fail instantly with
 * CONNECTION_ENDED/DESTROYED on thawed Vercel instances), reset the pool
 * and retry ONCE on fresh connections. Only a second failure propagates —
 * callers treat any throw as "degrade, don't 500". Retrying on every error
 * (not just timeouts) matters: the instant-fail path was ~5% of production
 * page loads, each one flashing the amber reconnect banner (2026-08-24).
 */
export async function mohamedQuery<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  if (!isMohamedLedgerConfigured) throw new MohamedDbTimeout()
  const generationAtStart = mohamedPoolGeneration()
  try {
    return await raceTimeout(fn)
  } catch {
    // Guard against N sibling queries (this page load fires 6-7 in
    // parallel) all resetting the same already-dead pool redundantly —
    // only the first one to notice actually swaps it.
    mohamedResetPool(generationAtStart)
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
