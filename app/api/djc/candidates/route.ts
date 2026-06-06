import { NextRequest, NextResponse } from 'next/server'
import { searchDjcCandidates } from '@/lib/djcQueries'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q') || undefined
    const specialty = request.nextUrl.searchParams.get('specialty') || undefined
    const candidates = await searchDjcCandidates({ q, specialty })
    return NextResponse.json({ candidates })
  } catch (error) {
    console.error('Failed to search DJC candidates:', error)
    return NextResponse.json({ error: 'Failed to search candidates' }, { status: 500 })
  }
}
