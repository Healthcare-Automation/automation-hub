import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { MOHAMED_COOKIE_NAME, verifyMohamedCookieValue } from '@/lib/mohamedAuth'
import { isUploadSigningConfigured, mintUploadToken } from '@/lib/mohamedUploadToken'

/**
 * Mints a short-lived (2 min) upload token for the browser to use directly
 * against the VPS's upload endpoint. The token itself, not this route, is
 * what the CSV upload actually needs — this route never sees or touches
 * the CSV bytes. Admin AND Mohamed's own session can mint one, same as
 * /api/mohamed/review-token — Mohamed is the one uploading their own
 * billing report and needs to see it queue and progress.
 */
export async function POST(req: NextRequest) {
  const adminOk = await verifyAdminCookieValue(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  const mohamedOk = await verifyMohamedCookieValue(req.cookies.get(MOHAMED_COOKIE_NAME)?.value)
  if (!adminOk && !mohamedOk) {
    return NextResponse.json({ ok: false, error: 'Sign in first.' }, { status: 401 })
  }
  if (!isUploadSigningConfigured()) {
    return NextResponse.json({ ok: false, error: 'Upload is not configured yet.' }, { status: 503 })
  }
  const token = await mintUploadToken()
  return NextResponse.json({ ok: true, token, uploadUrl: process.env.MOHAMED_UPLOAD_URL ?? null })
}
