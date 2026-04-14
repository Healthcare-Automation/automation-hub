import { NextRequest, NextResponse } from 'next/server'
import { getValidationData } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId: runIdStr } = await params
    const runId = parseInt(runIdStr)
    const jobId = request.nextUrl.searchParams.get('jobId') || undefined

    console.log('=== Validation API Debug ===')
    console.log('Requested runId:', runIdStr, 'parsed as:', runId)
    if (jobId) console.log('Filtering by jobId:', jobId)

    if (isNaN(runId)) {
      return NextResponse.json(
        { error: 'Invalid run ID' },
        { status: 400 }
      )
    }

    const data = await getValidationData(runId, jobId)
    console.log('Found', data.length, 'jobs for run', runId)

    return NextResponse.json({ jobs: data })
  } catch (error) {
    console.error('Failed to fetch validation data:', error)
    console.error('Error details:', error)
    return NextResponse.json(
      { error: 'Failed to fetch validation data' },
      { status: 500 }
    )
  }
}