import { NextRequest, NextResponse } from 'next/server'
import { getOpenAiActualCost, getAnthropicActualCost } from '@/lib/aiBilling'
import { buildCostUpdates, applyCostUpdates } from '@/lib/notionCosts'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  if (!process.env.NOTION_TOKEN) {
    return NextResponse.json({ error: 'NOTION_TOKEN not configured' }, { status: 500 })
  }

  const [openai, anthropic] = await Promise.all([getOpenAiActualCost(), getAnthropicActualCost()])
  const updates = buildCostUpdates(openai, anthropic)
  const today = new Date().toISOString().slice(0, 10)
  const written = await applyCostUpdates(updates, today)
  return NextResponse.json({ ok: true, written, updates })
}
