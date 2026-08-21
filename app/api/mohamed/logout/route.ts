import { NextRequest, NextResponse } from 'next/server'
import { MOHAMED_COOKIE_NAME } from '@/lib/mohamedAuth'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone()
  url.pathname = '/mohamed/login'
  url.search = ''
  const response = NextResponse.redirect(url)
  response.cookies.set(MOHAMED_COOKIE_NAME, '', { path: '/mohamed', maxAge: 0 })
  return response
}
