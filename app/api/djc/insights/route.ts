import { NextRequest, NextResponse } from 'next/server'
import { drillDjcCandidates, getCandidateTrail } from '@/lib/djcInsights'

export const dynamic = 'force-dynamic'

/** Candidate drill-down for the DJC Insights page.
 *  - ?dim=specialty&value=Pediatrics → candidate rows (dims whitelisted in lib/djcInsights.ts)
 *  - ?candidate=1461111 → that candidate's full pipeline event trail */
export async function GET(req: NextRequest) {
  const candidate = req.nextUrl.searchParams.get('candidate')
  try {
    if (candidate) {
      const events = await getCandidateTrail(candidate)
      if (events === null) return NextResponse.json({ error: 'bad candidate id' }, { status: 400 })
      return NextResponse.json({ events })
    }
    const dim = req.nextUrl.searchParams.get('dim') ?? ''
    const value = req.nextUrl.searchParams.get('value') ?? ''
    if (!dim) return NextResponse.json({ error: 'dim required' }, { status: 400 })
    const rows = await drillDjcCandidates(dim, value)
    if (rows === null) return NextResponse.json({ error: 'unknown dimension' }, { status: 400 })
    return NextResponse.json({ rows })
  } catch (err) {
    console.error('DJC insights drill failed:', err)
    return NextResponse.json({ error: 'query failed' }, { status: 500 })
  }
}
