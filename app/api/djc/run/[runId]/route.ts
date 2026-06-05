import { NextRequest, NextResponse } from 'next/server'
import { getDjcRunDetail } from '@/lib/djcQueries'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId: runIdStr } = await params
    const runId = parseInt(runIdStr, 10)
    if (isNaN(runId)) {
      return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 })
    }
    const data = await getDjcRunDetail(runId)
    return NextResponse.json(data)
  } catch (error) {
    console.error('Failed to fetch DJC run detail:', error)
    return NextResponse.json({ error: 'Failed to fetch DJC run detail' }, { status: 500 })
  }
}
