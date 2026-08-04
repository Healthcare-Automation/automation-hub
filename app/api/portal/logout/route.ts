import { NextRequest, NextResponse } from 'next/server'
import { CLIENT_COOKIE_NAME } from '@/lib/portalAuth'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone()
  url.pathname = '/portal/login'
  url.search = ''
  const res = NextResponse.redirect(url)
  res.cookies.set(CLIENT_COOKIE_NAME, '', { path: '/', maxAge: 0 })
  return res
}
