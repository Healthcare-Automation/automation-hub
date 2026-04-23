/**
 * Admin session helpers.
 *
 * Single shared password gates ``/admin/*``. On successful login, we set an
 * HttpOnly, Secure, SameSite=Lax cookie whose value is an HMAC-signed payload
 * ``<base64url(payload)>.<base64url(hmac)>``. Payload: ``{admin: true, exp}``.
 *
 * Uses the Web Crypto API (``globalThis.crypto.subtle``) so the same module
 * works in Next.js Edge Middleware and in Node.js route handlers. All signing
 * and verification is therefore async.
 *
 * This is intentionally minimal — one role, one password, no user tracking.
 *
 * Required env:
 *   ADMIN_PASSWORD       — shared password
 *   ADMIN_COOKIE_SECRET  — HMAC key for the session cookie (≥ 32 chars)
 */

export const ADMIN_COOKIE_NAME = 'ah_admin'
export const ADMIN_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60 // 12 h

type Payload = { admin: true; exp: number }

const enc = new TextEncoder()
const dec = new TextDecoder()

function toB64u(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_')
}

function fromB64u(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = s.replaceAll('-', '+').replaceAll('_', '/') + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function secretString(): string {
  const s = (process.env.ADMIN_COOKIE_SECRET || '').trim()
  if (s.length < 32) throw new Error('ADMIN_COOKIE_SECRET must be at least 32 chars')
  return s
}

async function hmacKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(secretString()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function sign(payloadB64u: string): Promise<string> {
  const key = await hmacKey()
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(payloadB64u))
  return toB64u(new Uint8Array(sig))
}

/** Constant-time string compare. Works in Edge and Node. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export function isAdminConfigured(): boolean {
  return Boolean(
    (process.env.ADMIN_PASSWORD || '').trim() &&
      (process.env.ADMIN_COOKIE_SECRET || '').trim().length >= 32,
  )
}

export async function buildAdminCookieValue(now: number = Date.now()): Promise<string> {
  const payload: Payload = { admin: true, exp: Math.floor(now / 1000) + ADMIN_COOKIE_MAX_AGE_SECONDS }
  const payloadB64 = toB64u(enc.encode(JSON.stringify(payload)))
  const sig = await sign(payloadB64)
  return `${payloadB64}.${sig}`
}

export async function verifyAdminCookieValue(
  value: string | undefined | null,
  now: number = Date.now(),
): Promise<boolean> {
  if (!value) return false
  const parts = String(value).split('.')
  if (parts.length !== 2) return false
  const [payloadB64, sig] = parts
  let expected: string
  try {
    expected = await sign(payloadB64)
  } catch {
    return false
  }
  if (!constantTimeEqual(sig, expected)) return false
  try {
    const parsed = JSON.parse(dec.decode(fromB64u(payloadB64))) as Payload
    if (parsed.admin !== true) return false
    if (typeof parsed.exp !== 'number' || parsed.exp * 1000 < now) return false
    return true
  } catch {
    return false
  }
}

export function checkAdminPassword(supplied: string): boolean {
  const expected = (process.env.ADMIN_PASSWORD || '').trim()
  if (!expected) return false
  return constantTimeEqual(supplied || '', expected)
}
