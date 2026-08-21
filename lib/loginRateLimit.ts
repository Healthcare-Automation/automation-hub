import type { NextRequest } from 'next/server'

/**
 * Process-local login limiter with reserve-before-verify semantics.
 *
 * `reserveLoginAttempt` must be called synchronously, BEFORE the first `await`
 * in a route handler, so that concurrent requests from one client cannot all
 * pass a count check that only gets updated later. The reservation counts
 * toward the window immediately; a successful login calls
 * `clearLoginAttempts` to release it.
 *
 * This limiter is defence in depth. State is per process, so the Vercel WAF
 * rate-limit rule on /api/mohamed/login (5 requests / 15 min per IP, enforced
 * at the edge from the platform-trusted client IP) is the shared layer.
 */

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5
const MAX_KEYS = 10_000
const attempts = new Map<string, { count: number; resetsAt: number }>()

export type LoginLimit = { allowed: boolean; retryAfterSeconds: number }

function prune(now: number) {
  if (attempts.size < MAX_KEYS) return
  for (const [key, entry] of attempts) {
    if (entry.resetsAt <= now) attempts.delete(key)
  }
  // Hard bound: evict oldest UNLOCKED reservations first, so a flood of fresh
  // keys cannot push out a bucket that is currently enforcing a lockout.
  if (attempts.size >= MAX_KEYS) {
    for (const [key, entry] of attempts) {
      if (attempts.size < MAX_KEYS) break
      if (entry.count < MAX_ATTEMPTS) attempts.delete(key)
    }
  }
  while (attempts.size >= MAX_KEYS) {
    const oldest = attempts.keys().next().value
    if (oldest === undefined) break
    attempts.delete(oldest)
  }
}

/**
 * Client key for the limiter.
 *
 * Trust model: on Vercel the platform overwrites x-real-ip and x-forwarded-for
 * with the connecting client, so neither is spoofable there. Off-platform (local
 * dev, another host) only the LAST x-forwarded-for hop is used — that is the one
 * appended by the nearest proxy, whereas a client can prepend arbitrary values.
 * If no header is present at all, every request shares one bucket (fail closed).
 */
export function loginClientKey(req: NextRequest, tenant: string): string {
  const realIp = req.headers.get('x-real-ip')?.trim()
  const hops = (req.headers.get('x-forwarded-for') || '').split(',').map((hop) => hop.trim()).filter(Boolean)
  const lastHop = hops.length ? hops[hops.length - 1] : ''
  const address = realIp || lastHop || 'unknown'
  return `${tenant}:${address.slice(0, 80)}`
}

/** Atomically reserve one attempt for `key`. Call before any `await`. */
export function reserveLoginAttempt(key: string, now: number = Date.now()): LoginLimit {
  prune(now)
  let entry = attempts.get(key)
  if (!entry || entry.resetsAt <= now) {
    entry = { count: 0, resetsAt: now + WINDOW_MS }
    attempts.set(key, entry)
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetsAt - now) / 1000)),
    }
  }
  entry.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}

export function clearLoginAttempts(key: string) {
  attempts.delete(key)
}

export function loginLimiterSizeForTest(): number {
  return attempts.size
}

export function resetLoginLimitsForTest() {
  attempts.clear()
}
