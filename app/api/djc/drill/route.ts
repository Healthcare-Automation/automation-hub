import { NextRequest, NextResponse } from 'next/server'
import { getFunnelStageDetail, getSpecialtyDetail } from '@/lib/djcStory'

export const dynamic = 'force-dynamic'

/** Raw rows behind a funnel stage or a supply-vs-demand bar, for the Overview side panel. */
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams
    const kind = q.get('kind')
    let detail = null
    if (kind === 'funnel') {
      const stage = q.get('stage')
      if (stage !== 'apps' && stage !== 'submitted' && stage !== 'placed') {
        return NextResponse.json({ error: 'Unknown stage' }, { status: 400 })
      }
      detail = await getFunnelStageDetail(stage)
    } else if (kind === 'specialty') {
      const specialty = q.get('specialty')
      const side = q.get('side')
      if (!specialty || (side !== 'matched' && side !== 'unmatched')) {
        return NextResponse.json({ error: 'Bad request' }, { status: 400 })
      }
      detail = await getSpecialtyDetail(specialty, side)
    } else {
      return NextResponse.json({ error: 'Unknown kind' }, { status: 400 })
    }
    if (!detail) return NextResponse.json({ error: 'Unavailable' }, { status: 503 })
    return NextResponse.json(detail)
  } catch (error) {
    console.error('Failed to load drill rows:', error)
    return NextResponse.json({ error: 'Failed to load rows' }, { status: 500 })
  }
}
