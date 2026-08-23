import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { MOHAMED_COOKIE_NAME, verifyMohamedCookieValue } from '@/lib/mohamedAuth'
import { isUploadSigningConfigured, mintUploadToken } from '@/lib/mohamedUploadToken'

// Same reasoning as app/mohamed/page.tsx: co-locate with the Tokyo-region
// Mohamed Supabase project instead of paying a trans-Pacific round trip.
export const preferredRegion = 'hnd1'

// Same short-lived token pattern as /api/mohamed/upload-token, reused here
// so the browser can fetch review artifacts (fields.json, screenshot.png)
// directly from the VPS without a static credential ever touching
// browser-reachable JS. Both admin AND the Mohamed portal session (Andy,
// Mohamed, Sean per the access decision) can mint one -- this route is
// read-only PHI viewing, not the trigger, so it's fine to share.
export async function POST(request: NextRequest) {
  const adminOk = await verifyAdminCookieValue(request.cookies.get(ADMIN_COOKIE_NAME)?.value)
  const mohamedOk = await verifyMohamedCookieValue(request.cookies.get(MOHAMED_COOKIE_NAME)?.value)
  if (!adminOk && !mohamedOk) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  if (!isUploadSigningConfigured()) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  }
  const token = await mintUploadToken()
  return NextResponse.json({ ok: true, token, uploadUrl: process.env.MOHAMED_UPLOAD_URL ?? null })
}
