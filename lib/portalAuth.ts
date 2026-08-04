/**
 * Client-portal session helpers — same signed-cookie scheme as ``lib/adminAuth.ts``
 * (HMAC over a base64url payload, Web Crypto so it runs in Edge Middleware), but a
 * separate cookie, role and lifetime. A portal cookie can never pass the admin check
 * or vice versa: the payloads assert different roles.
 *
 * Required env:
 *   CLIENT_ACCESS_CODE   — shared access code given to clients
 *   ADMIN_COOKIE_SECRET  — HMAC key, shared with the admin session (≥ 32 chars)
 */

export const CLIENT_COOKIE_NAME = 'ah_client'
export const CLIENT_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60 // 30 days

type Payload = { client: true; exp: number }

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

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export function isPortalConfigured(): boolean {
  return Boolean(
    (process.env.CLIENT_ACCESS_CODE || '').trim() &&
      (process.env.ADMIN_COOKIE_SECRET || '').trim().length >= 32,
  )
}

export async function buildClientCookieValue(now: number = Date.now()): Promise<string> {
  const payload: Payload = { client: true, exp: Math.floor(now / 1000) + CLIENT_COOKIE_MAX_AGE_SECONDS }
  const payloadB64 = toB64u(enc.encode(JSON.stringify(payload)))
  const sig = await sign(payloadB64)
  return `${payloadB64}.${sig}`
}

export async function verifyClientCookieValue(
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
    if (parsed.client !== true) return false
    if (typeof parsed.exp !== 'number' || parsed.exp * 1000 < now) return false
    return true
  } catch {
    return false
  }
}

export function checkClientAccessCode(supplied: string): boolean {
  const expected = (process.env.CLIENT_ACCESS_CODE || '').trim()
  if (!expected) return false
  return constantTimeEqual((supplied || '').trim(), expected)
}
