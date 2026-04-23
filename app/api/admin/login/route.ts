import { NextRequest, NextResponse } from 'next/server'
import {
  ADMIN_COOKIE_MAX_AGE_SECONDS,
  ADMIN_COOKIE_NAME,
  buildAdminCookieValue,
  checkAdminPassword,
  isAdminConfigured,
} from '@/lib/adminAuth'

export async function POST(req: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Admin features not configured (missing ADMIN_PASSWORD or ADMIN_COOKIE_SECRET)' },
      { status: 503 },
    )
  }
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const password = String(body.password || '')
  if (!checkAdminPassword(password)) {
    return NextResponse.json({ ok: false, error: 'Invalid password' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE_NAME, await buildAdminCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_COOKIE_MAX_AGE_SECONDS,
  })
  return res
}
