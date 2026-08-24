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
  process.on('unhandledRejection', (reason: unknown) => {
    const code =
      typeof reason === 'object' && reason !== null && 'code' in reason
        ? String((reason as { code: unknown }).code)
        : ''
    const benign = ['CONNECTION_DESTROYED', 'CONNECTION_CLOSED', 'CONNECTION_ENDED', 'ECONNRESET', 'EPIPE']
    if (benign.includes(code)) {
      console.warn(`[instrumentation] swallowed background socket error: ${code}`)
      return
    }
    console.error('[instrumentation] unhandledRejection:', reason)
  })
}
