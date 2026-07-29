import { NextRequest, NextResponse } from 'next/server'
import { getFunnelStageRows } from '@/lib/djcPipeline'
import type { PipelineRange } from '@/lib/djcTypes'

export const dynamic = 'force-dynamic'

/** Raw applications behind a funnel stage, so every number on the funnel can be opened up. */
export async function GET(request: NextRequest) {
  try {
    const stage = request.nextUrl.searchParams.get('stage') || 'Application'
    const raw = request.nextUrl.searchParams.get('range')
    const range: PipelineRange = raw === '7d' || raw === '30d' ? raw : 'all'
    const rows = await getFunnelStageRows(stage, range)
    return NextResponse.json({ rows })
  } catch (error) {
    console.error('Failed to load funnel stage rows:', error)
    return NextResponse.json({ error: 'Failed to load rows' }, { status: 500 })
  }
}
