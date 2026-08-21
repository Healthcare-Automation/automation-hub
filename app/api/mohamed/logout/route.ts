import { NextRequest, NextResponse } from 'next/server'
import { MOHAMED_COOKIE_NAME } from '@/lib/mohamedAuth'

// POST only: a GET logout could be triggered cross-site by any page (CSRF
// forced logout). The dashboard submits a same-origin form.
export async function POST(req: NextRequest) {
  const url = req.nextUrl.clone()
  url.pathname = '/mohamed/login'
  url.search = ''
  // 303 so the browser follows with GET rather than replaying the POST.
  const response = NextResponse.redirect(url, 303)
  response.cookies.set(MOHAMED_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/mohamed',
    maxAge: 0,
  })
  return response
}
