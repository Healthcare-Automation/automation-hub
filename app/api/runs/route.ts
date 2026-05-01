import { NextRequest, NextResponse } from 'next/server'
import { getRecentRuns, searchRuns } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get('jobId')
    const sfJobId = request.nextUrl.searchParams.get('sfJobId')
    const practice = request.nextUrl.searchParams.get('practice')
    if (jobId || sfJobId || practice) {
      const runs = await searchRuns({
        jobId: jobId ?? undefined,
        sfJobId: sfJobId ?? undefined,
        practice: practice ?? undefined,
      })
      return NextResponse.json({ runs })
    }

    const limit = request.nextUrl.searchParams.get('limit')
    const offset = request.nextUrl.searchParams.get('offset')
    const n = limit ? Number(limit) : 20
    const o = offset ? Number(offset) : 0
    const runs = await getRecentRuns(Number.isFinite(n) ? n : 20, Number.isFinite(o) ? o : 0)
    return NextResponse.json({ runs })
  } catch (error) {
    console.error('Failed to fetch runs:', error)
    return NextResponse.json({ error: 'Failed to fetch runs' }, { status: 500 })
  }
}

