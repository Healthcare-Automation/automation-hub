import { NextRequest, NextResponse } from 'next/server'
import { getOpenAiActualCost, getOpenAiCostRange, getAnthropicCostByKey } from '@/lib/aiBilling'
import { buildCostUpdates, applyCostUpdates, ANTHROPIC_KEY_TO_SERVICE } from '@/lib/notionCosts'
import { snapshotMonth } from '@/lib/notionLedger'

export const dynamic = 'force-dynamic'

const r2 = (n: number) => Math.round(n * 100) / 100

/** Exact calendar-month LLM costs for the month that just ended — usage attributes to
 * the month it happened in, not a trailing-30d window. */
async function prevMonthOverrides(monthEnd: Date): Promise<{ start: string; overrides: Record<string, number> }> {
  const start = new Date(Date.UTC(monthEnd.getUTCFullYear(), monthEnd.getUTCMonth() - 1, 1))
  const [openai, anthropic] = await Promise.all([
    getOpenAiCostRange(Math.floor(start.getTime() / 1000), Math.floor(monthEnd.getTime() / 1000)),
    getAnthropicCostByKey(start.toISOString(), monthEnd.toISOString()),
  ])
  const overrides: Record<string, number> = {}
  if (openai.available && openai.last30 != null) overrides['OpenAI'] = r2(openai.last30)
  if (anthropic.available) {
    for (const [keyId, cost] of Object.entries(anthropic.byKey)) {
      const service = ANTHROPIC_KEY_TO_SERVICE[keyId]
      if (service) overrides[service] = r2(cost)
    }
  }
  return { start: start.toISOString().slice(0, 10), overrides }
}

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

  const [openai, anthropic] = await Promise.all([getOpenAiActualCost(), getAnthropicCostByKey()])
  const { updates, unmapped } = buildCostUpdates(openai, anthropic)
  const today = new Date().toISOString().slice(0, 10)
  const written = await applyCostUpdates(updates, today)
  let snapshotted = 0
  let snapshotMonthStart: string | null = null
  if (today.endsWith('-01')) {
    // finalize the month that just ended with exact calendar-month LLM figures
    const { start, overrides } = await prevMonthOverrides(new Date(`${today}T00:00:00Z`))
    snapshotMonthStart = start
    snapshotted = await snapshotMonth(start, overrides)
  }
  return NextResponse.json({ ok: true, written, snapshotted, snapshotMonthStart, updates, unmapped })
}
