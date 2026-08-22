/**
 * Mohamed client-session helpers.
 *
 * The cookie has its own role claim and name. It cannot pass Proxi client or
 * admin verification, even though all sessions use the same HMAC key.
 *
 * Required env:
 *   MOHAMED_ACCESS_CODE  - access code shared only with Mohamed
 *   ADMIN_COOKIE_SECRET - HMAC key shared by Hub session signing (>= 32 chars)
 */

export const MOHAMED_COOKIE_NAME = 'ah_mohamed'
export const MOHAMED_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
export const MOHAMED_ACCESS_CODE_MIN_LENGTH = 24

type Payload = { tenant: 'mohamed'; exp: number }

const enc = new TextEncoder()
const dec = new TextDecoder()

function toB64u(bytes: Uint8Array): string {
  let value = ''
  for (let index = 0; index < bytes.length; index++) value += String.fromCharCode(bytes[index])
  return btoa(value).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_')
}

function fromB64u(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + padding)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function secretString(): string {
  const secret = (process.env.ADMIN_COOKIE_SECRET || '').trim()
  if (secret.length < 32) throw new Error('ADMIN_COOKIE_SECRET must be at least 32 chars')
  return secret
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

async function sign(payload: string): Promise<string> {
  const key = await hmacKey()
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return toB64u(new Uint8Array(signature))
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

export function isMohamedPortalConfigured(): boolean {
  return Boolean(
    (process.env.MOHAMED_ACCESS_CODE || '').trim().length >= MOHAMED_ACCESS_CODE_MIN_LENGTH &&
      (process.env.ADMIN_COOKIE_SECRET || '').trim().length >= 32,
  )
}

export function checkMohamedAccessCode(supplied: string): boolean {
  const expected = (process.env.MOHAMED_ACCESS_CODE || '').trim()
  if (expected.length < MOHAMED_ACCESS_CODE_MIN_LENGTH) return false
  return constantTimeEqual((supplied || '').trim(), expected)
}

export async function buildMohamedCookieValue(now: number = Date.now()): Promise<string> {
  const payload: Payload = {
    tenant: 'mohamed',
    exp: Math.floor(now / 1000) + MOHAMED_COOKIE_MAX_AGE_SECONDS,
  }
  const encoded = toB64u(enc.encode(JSON.stringify(payload)))
  return `${encoded}.${await sign(encoded)}`
}

export async function verifyMohamedCookieValue(
  value: string | undefined | null,
  now: number = Date.now(),
): Promise<boolean> {
  if (!value) return false
  const parts = String(value).split('.')
  if (parts.length !== 2) return false
  const [payload, signature] = parts

  let expected: string
  try {
    expected = await sign(payload)
  } catch {
    return false
  }
  if (!constantTimeEqual(signature, expected)) return false

  try {
    const parsed = JSON.parse(dec.decode(fromB64u(payload))) as Payload
    return parsed.tenant === 'mohamed' && typeof parsed.exp === 'number' && parsed.exp * 1000 >= now
  } catch {
    return false
  }
}
