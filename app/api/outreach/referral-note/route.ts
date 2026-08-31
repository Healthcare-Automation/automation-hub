import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { setReferralNote } from '@/lib/outreachQueries'

/** Andy noting a warm intro / mutual connection on a prospect -- relationship intel only
 * he has, pulled back into SQLite by pull_linkedin_approvals.py so Hermes sees it too. */
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
  const { companyId, note, strength } = (body ?? {}) as
    { companyId?: unknown; note?: unknown; strength?: unknown }
  const numId = typeof companyId === 'number' ? companyId : Number(companyId)
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid_company_id' }, { status: 400 })
  }
  const validStrengths = ['warm_intro', 'mutual_connection', 'cold', null]
  const strengthVal = typeof strength === 'string' ? strength : null
  if (!validStrengths.includes(strengthVal)) {
    return NextResponse.json({ ok: false, error: 'invalid_strength' }, { status: 400 })
  }
  const noteVal = typeof note === 'string' && note.trim().length > 0 ? note.trim() : null

  try {
    await setReferralNote(numId, noteVal, strengthVal as 'warm_intro' | 'mutual_connection' | 'cold' | null)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Referral note write failed:', err)
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 503 })
  }
}
