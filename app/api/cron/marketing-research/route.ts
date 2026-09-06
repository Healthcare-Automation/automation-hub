import { NextRequest, NextResponse } from 'next/server'
import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { runFullPipeline } from '@/lib/marketingPipeline'

export const dynamic = 'force-dynamic'
// The ingestion stage self-limits to a 45s time budget (lib/marketingResearch.ts); this
// just gives the clustering/scoring/opportunity stages after it room to finish on the
// item volumes this pipeline handles, comfortably under Vercel's 300s function default.
export const maxDuration = 120

/** ingest → enrich → embed → cluster → score → opportunities, on the same 6-hour cadence
 * as vercel.json's cron entry, auth'd the same way as every other cron in this repo
 * (see app/api/cron/slack-alerts for the pattern). Chunked by design: ingestion stops
 * starting new feeds once its time budget is spent, so a single tick may only process a
 * subset of the registry — the next tick picks up the rest (ingestFeed dedupes, so
 * there's no double-counting). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    const { orgId } = await getDemoOrgAndUser()
    const result = await runFullPipeline({ orgId, triggeredBy: 'cron' })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[marketing-research] cron run failed', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
