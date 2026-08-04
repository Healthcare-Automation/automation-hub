import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { CLIENT_COOKIE_NAME, verifyClientCookieValue } from '@/lib/portalAuth'

export const config = {
  matcher: ['/admin/:path*', '/portal/:path*'],
}

/**
 * Two gated areas, both behind signed session cookies:
 *  - /admin/*  — admin cookie only; login at /admin/login.
 *  - /portal/* — the client report. A client cookie OR an admin cookie passes, so
 *    admins can preview exactly what clients see. Login at /portal/login.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/admin')) {
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

  // /portal/*
  if (pathname === '/portal/login') return NextResponse.next()

  if (await verifyClientCookieValue(req.cookies.get(CLIENT_COOKIE_NAME)?.value)) {
    return NextResponse.next()
  }
  if (await verifyAdminCookieValue(req.cookies.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.next()
  }

  const url = req.nextUrl.clone()
  url.pathname = '/portal/login'
  return NextResponse.redirect(url)
}
