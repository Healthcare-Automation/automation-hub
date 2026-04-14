import { NextRequest, NextResponse } from 'next/server'
import { getRecentRuns, getRunsForJobId } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get('jobId')
    if (jobId) {
      const runs = await getRunsForJobId(jobId)
      return NextResponse.json({ runs })
    }

    const limit = request.nextUrl.searchParams.get('limit')
    const n = limit ? Number(limit) : 20
    const runs = await getRecentRuns(Number.isFinite(n) ? n : 20)
    return NextResponse.json({ runs })
  } catch (error) {
    console.error('Failed to fetch runs:', error)
    return NextResponse.json({ error: 'Failed to fetch runs' }, { status: 500 })
  }
}

