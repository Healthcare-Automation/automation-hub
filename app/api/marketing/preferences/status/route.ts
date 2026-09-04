import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { updatePreferenceStatus } from '@/lib/marketingPreferences'
import type { PreferenceStatus } from '@/lib/marketing/types'

const VALID_STATUSES: PreferenceStatus[] = ['active', 'temporary', 'reset']

export async function POST(request: NextRequest) {
  const isAdmin = await verifyAdminCookieValue(request.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  const { id, status } = (body ?? {}) as { id?: unknown; status?: unknown }
  if (typeof id !== 'string' || !id || typeof status !== 'string' || !VALID_STATUSES.includes(status as PreferenceStatus)) {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 })
  }

  try {
    await updatePreferenceStatus(id, status as PreferenceStatus)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Marketing preference status update failed:', err)
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 503 })
  }
}
