import { NextRequest, NextResponse } from 'next/server'
import {
  CLIENT_COOKIE_MAX_AGE_SECONDS,
  CLIENT_COOKIE_NAME,
  buildClientCookieValue,
  checkClientAccessCode,
  isPortalConfigured,
} from '@/lib/portalAuth'

export async function POST(req: NextRequest) {
  if (!isPortalConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'The client portal is not configured yet.' },
      { status: 503 },
    )
  }
  let body: { code?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  if (!checkClientAccessCode(String(body.code || ''))) {
    return NextResponse.json({ ok: false, error: 'That access code is not right.' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(CLIENT_COOKIE_NAME, await buildClientCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: CLIENT_COOKIE_MAX_AGE_SECONDS,
  })
  return res
}
