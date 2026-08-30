import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getCompanyDetail } from '@/lib/outreachQueries'

/** Company detail includes contact PII (name/email) and drafted outreach copy —
 * gate it the same way as the LinkedIn decision route, not left open. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await verifyAdminCookieValue(request.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!isAdmin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const numId = Number(id)
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  }
  try {
    const detail = await getCompanyDetail(numId)
    if (!detail) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json(detail)
  } catch (err) {
    console.error('Failed to load company detail:', err)
    return NextResponse.json({ error: 'load_failed' }, { status: 503 })
  }
}
