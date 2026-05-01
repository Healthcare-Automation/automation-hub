import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'

/**
 * Admin-auth'd diagnostic: reports presence (NEVER values) of the env vars
 * the recovery + rescrape proxy endpoints rely on. Use this to confirm a
 * Vercel deploy actually picked up the env vars after they were added /
 * scoped to Production.
 */
export const dynamic = 'force-dynamic'

function presence(name: string) {
  const raw = process.env[name]
  if (raw == null) return { name, set: false, length: 0 }
  const trimmed = raw.trim()
  return {
    name,
    set: trimmed.length > 0,
    length: trimmed.length,
    hadWhitespace: trimmed.length !== raw.length,
  }
}

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value
  if (!(await verifyAdminCookieValue(cookie))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  return NextResponse.json({
    ok: true,
    runtime: {
      nodeEnv: process.env.NODE_ENV ?? null,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      vercelRegion: process.env.VERCEL_REGION ?? null,
      deploymentUrl: process.env.VERCEL_URL ?? null,
    },
    envVars: [
      presence('MODAL_RESCRAPE_ENDPOINT_URL'),
      presence('MODAL_RESCRAPE_TOKEN'),
      presence('MODAL_RECOVERY_ENDPOINT_URL'),
      presence('MODAL_RECOVERY_TOKEN'),
    ],
  })
}
