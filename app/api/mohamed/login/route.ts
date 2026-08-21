import { NextRequest, NextResponse } from 'next/server'
import {
  MOHAMED_COOKIE_MAX_AGE_SECONDS,
  MOHAMED_COOKIE_NAME,
  buildMohamedCookieValue,
  checkMohamedAccessCode,
  isMohamedPortalConfigured,
} from '@/lib/mohamedAuth'
import { clearLoginAttempts, loginClientKey, reserveLoginAttempt } from '@/lib/loginRateLimit'

export async function POST(req: NextRequest) {
  if (!isMohamedPortalConfigured()) {
    return NextResponse.json({ ok: false, error: 'The Mohamed portal is not configured yet.' }, { status: 503 })
  }

  // Reserve synchronously, before the first await, so concurrent requests
  // cannot all pass a stale count check.
  const clientKey = loginClientKey(req, 'mohamed')
  const limit = reserveLoginAttempt(clientKey)
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  let body: { code?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const supplied = String(body.code || '')
  if (supplied.length > 256 || !checkMohamedAccessCode(supplied)) {
    return NextResponse.json({ ok: false, error: 'That access code is not right.' }, { status: 401 })
  }

  clearLoginAttempts(clientKey)
  const response = NextResponse.json({ ok: true })
  response.cookies.set(MOHAMED_COOKIE_NAME, await buildMohamedCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/mohamed',
    maxAge: MOHAMED_COOKIE_MAX_AGE_SECONDS,
  })
  return response
}
