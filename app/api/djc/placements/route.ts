import { NextRequest, NextResponse } from 'next/server'
import { getPlacementMonth } from '@/lib/djcStory'

export const dynamic = 'force-dynamic'

/** Everyone placed in one month, for the drill-down panel on the Overview placements chart. */
export async function GET(request: NextRequest) {
  try {
    const month = request.nextUrl.searchParams.get('month') || ''
    const detail = await getPlacementMonth(month)
    if (!detail) return NextResponse.json({ error: 'Unknown month' }, { status: 400 })
    return NextResponse.json(detail)
  } catch (error) {
    console.error('Failed to load placement month:', error)
    return NextResponse.json({ error: 'Failed to load placements' }, { status: 500 })
  }
}
