/**
 * Global safety net for background socket errors.
 *
 * postgres.js can raise errors on timers/sockets with no awaiting caller
 * (e.g. terminating a connection that a Vercel function freeze already
 * destroyed). Those surface as UNHANDLED REJECTIONS and crash whatever
 * request happens to be rendering — the /mohamed "different page on every
 * refresh" bug (2026-08-24). Pool options now avoid the known cause
 * (no max_lifetime); this handler guarantees the CLASS of bug can't crash
 * a render: connection-lifecycle errors are logged and swallowed, anything
 * else is logged loudly (still not crashed — Next dev behavior differs from
 * prod, and crashing a shared function instance kills innocent requests).
 */
export async function register() {
  const benign = ['CONNECTION_DESTROYED', 'CONNECTION_CLOSED', 'CONNECTION_ENDED', 'ECONNRESET', 'EPIPE']
  const codeOf = (reason: unknown): string =>
    typeof reason === 'object' && reason !== null && 'code' in reason
      ? String((reason as { code: unknown }).code)
      : ''

  process.on('unhandledRejection', (reason: unknown) => {
    const code = codeOf(reason)
    if (benign.includes(code)) {
      console.warn(`[instrumentation] swallowed background socket error: ${code}`)
      return
    }
    console.error('[instrumentation] unhandledRejection:', reason)
  })

  // The rejection handler alone did NOT stop the crashes (Vercel logs
  // 2026-08-24, exit status 128 with our "swallowed" line right above it):
  // postgres.js's idle/terminate timer writes to a socket the function
  // freeze already destroyed, and that write throws SYNCHRONOUSLY inside
  // the Timeout callback — an uncaughtException, not a rejection
  // (stack: Timeout._onTimeout -> terminate -> write CONNECTION_DESTROYED).
  // Swallow the same benign connection-lifecycle class here; rethrow-like
  // logging for everything else. Never exit for a background socket burp.
  process.on('uncaughtException', (error: unknown) => {
    const code = codeOf(error)
    if (benign.includes(code)) {
      console.warn(`[instrumentation] swallowed background socket exception: ${code}`)
      return
    }
    console.error('[instrumentation] uncaughtException:', error)
  })
}
