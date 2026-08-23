import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { isUploadSigningConfigured, mintUploadToken } from '@/lib/mohamedUploadToken'

/**
 * Admin-only: mints a short-lived (2 min) upload token for the browser to
 * use directly against the VPS's upload endpoint. The token itself, not
 * this route, is what the CSV upload actually needs — this route never
 * sees or touches the CSV bytes.
 */
export async function POST(req: NextRequest) {
  const isAdmin = await verifyAdminCookieValue(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!isAdmin) return NextResponse.json({ ok: false, error: 'Sign in as admin first.' }, { status: 401 })
  if (!isUploadSigningConfigured()) {
    return NextResponse.json({ ok: false, error: 'Upload is not configured yet.' }, { status: 503 })
  }
  const token = await mintUploadToken()
  return NextResponse.json({ ok: true, token, uploadUrl: process.env.MOHAMED_UPLOAD_URL ?? null })
}
