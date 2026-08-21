import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { CLIENT_COOKIE_NAME, verifyClientCookieValue } from '@/lib/portalAuth'
import { MOHAMED_COOKIE_NAME, verifyMohamedCookieValue } from '@/lib/mohamedAuth'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

const PUBLIC_PATHS = new Set([
  '/admin/login',
  '/portal/login',
  '/mohamed/login',
  '/api/admin/login',
  '/api/portal/login',
  '/api/portal/logout',
  '/api/mohamed/login',
  '/api/mohamed/logout',
])

function redirect(req: NextRequest, pathname: string, next?: string) {
  const url = req.nextUrl.clone()
  url.pathname = pathname
  url.search = ''
  if (next) url.searchParams.set('next', next)
  return NextResponse.redirect(url)
}

function unauthorizedApi() {
  return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
}

/**
 * Tenant boundaries:
 *  - /portal/* and /api/reports/*: Proxi client or admin.
 *  - /mohamed/*: Mohamed client or admin.
 *  - all other pages and data APIs: admin only.
 *  - login/logout and cron routes pass through to their own authentication.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith('/api/cron/')) {
    return NextResponse.next()
  }

  const isAdmin = await verifyAdminCookieValue(req.cookies.get(ADMIN_COOKIE_NAME)?.value)

  if (pathname.startsWith('/mohamed')) {
    if (isAdmin) return NextResponse.next()
    const isMohamed = await verifyMohamedCookieValue(req.cookies.get(MOHAMED_COOKIE_NAME)?.value)
    return isMohamed ? NextResponse.next() : redirect(req, '/mohamed/login')
  }

  if (pathname.startsWith('/portal')) {
    if (isAdmin) return NextResponse.next()
    const isClient = await verifyClientCookieValue(req.cookies.get(CLIENT_COOKIE_NAME)?.value)
    return isClient ? NextResponse.next() : redirect(req, '/portal/login')
  }

  if (pathname.startsWith('/api/reports/')) {
    if (isAdmin) return NextResponse.next()
    const isClient = await verifyClientCookieValue(req.cookies.get(CLIENT_COOKIE_NAME)?.value)
    return isClient ? NextResponse.next() : unauthorizedApi()
  }

  if (isAdmin) return NextResponse.next()
  if (pathname.startsWith('/api/')) return unauthorizedApi()
  return redirect(req, '/admin/login', pathname)
}
