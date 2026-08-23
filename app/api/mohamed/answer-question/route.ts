import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { MOHAMED_COOKIE_NAME, verifyMohamedCookieValue } from '@/lib/mohamedAuth'
import { QuestionWriteError, answerClientQuestion } from '@/lib/mohamedQuestions'

export const preferredRegion = 'hnd1'

/** Records Mohamed's (or admin's) answer to an open clarifying question. */
export async function POST(request: NextRequest) {
  const adminOk = await verifyAdminCookieValue(request.cookies.get(ADMIN_COOKIE_NAME)?.value)
  const mohamedOk = await verifyMohamedCookieValue(request.cookies.get(MOHAMED_COOKIE_NAME)?.value)
  if (!adminOk && !mohamedOk) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  const { id, answer } = (body ?? {}) as { id?: unknown; answer?: unknown }
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 })
  }
  if (typeof answer !== 'string' || !answer.trim() || answer.length > 4000) {
    return NextResponse.json({ ok: false, error: 'invalid_answer' }, { status: 400 })
  }

  try {
    await answerClientQuestion(id, answer, adminOk ? 'admin' : 'mohamed_portal')
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof QuestionWriteError ? err.message : 'answer_write_failed'
    console.error('Mohamed question answer failed:', err)
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
