import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { deletePreference } from '@/lib/marketingPreferences'

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
  const { id } = (body ?? {}) as { id?: unknown }
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 })
  }

  try {
    await deletePreference(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Marketing preference remove failed:', err)
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 503 })
  }
}
