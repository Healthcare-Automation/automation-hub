import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'

export const config = {
  matcher: ['/admin/:path*'],
}

/**
 * Gate /admin/* behind a signed session cookie. The login page itself lives at
 * /admin/login and must stay reachable without a session.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname === '/admin/login') return NextResponse.next()

  const cookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value
  if (await verifyAdminCookieValue(cookie)) {
    return NextResponse.next()
  }

  const url = req.nextUrl.clone()
  url.pathname = '/admin/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}
