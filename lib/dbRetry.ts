/**
 * Retry a DB read past transient Supabase pooler saturation.
 *
 * The session pooler caps at 15 clients TOTAL across the hub, Vercel builds, Modal jobs and local
 * scripts. When a long Modal run holds slots, a page render can lose the race and throw
 * EMAXCONNSESSION — which rendered as "could not read pipeline data", indistinguishable from the
 * data genuinely being missing. Saturation clears in seconds, so a couple of short retries turn a
 * visible error into a slightly slower page.
 *
 * Only connection-capacity errors are retried; a real query bug should still fail loudly and fast.
 */
const TRANSIENT = /EMAXCONN|max clients|too many clients|Connection terminated|CONNECT_TIMEOUT|ECONNRESET/i

export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 400): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!TRANSIENT.test(String(err))) throw err
      if (i < attempts - 1) await new Promise(r => setTimeout(r, baseDelayMs * (i + 1)))
    }
  }
  throw lastErr
}

/** True when a failure was the pooler being busy rather than the data being absent. */
export function isPoolSaturation(err: unknown): boolean {
  return TRANSIENT.test(String(err))
}
