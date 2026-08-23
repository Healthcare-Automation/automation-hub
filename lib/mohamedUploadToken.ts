/**
 * Short-lived upload tokens for direct browser -> VPS CSV uploads.
 *
 * Why not just hand the browser MOHAMED_UPLOAD_TOKEN directly: that's a
 * long-lived secret baked into a Vercel env var — putting it in client JS
 * (even briefly, even NEXT_PUBLIC_-scoped) means anyone who views the page
 * source gets a standing credential to the VPS endpoint forever. Instead:
 * an admin-only Vercel route mints a token that's only valid for 2 minutes
 * and carries no other privilege, using a SEPARATE secret
 * (MOHAMED_UPLOAD_SIGNING_SECRET) that never leaves the server. The VPS
 * verifies the signature with its own copy of that same secret.
 *
 * Payload: `{exp}` — nothing else needed; there's no per-user identity to
 * carry (upload is admin-gated, same trust level as the trigger button).
 *
 * Required env: MOHAMED_UPLOAD_SIGNING_SECRET (>= 32 chars, shared with the
 * VPS's own copy at /etc/credstore.encrypted/mohamed/mohamed-upload-signing-secret.cred)
 */

const TOKEN_TTL_SECONDS = 120

const enc = new TextEncoder()

function toB64u(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_')
}

function secretString(): string {
  const s = (process.env.MOHAMED_UPLOAD_SIGNING_SECRET || '').trim()
  if (s.length < 32) throw new Error('MOHAMED_UPLOAD_SIGNING_SECRET must be at least 32 chars')
  return s
}

async function hmacKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(secretString()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

export function isUploadSigningConfigured(): boolean {
  return (process.env.MOHAMED_UPLOAD_SIGNING_SECRET || '').trim().length >= 32
}

/** Mints `<payloadB64u>.<sigB64u>`, valid for TOKEN_TTL_SECONDS from now. */
export async function mintUploadToken(now: number = Date.now()): Promise<string> {
  const payload = { exp: Math.floor(now / 1000) + TOKEN_TTL_SECONDS }
  const payloadB64 = toB64u(enc.encode(JSON.stringify(payload)))
  const key = await hmacKey()
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(payloadB64))
  return `${payloadB64}.${toB64u(new Uint8Array(sig))}`
}
