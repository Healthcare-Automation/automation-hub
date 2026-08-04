import { NextRequest, NextResponse } from 'next/server'
import { runDrill, type DrillParams } from '@/lib/drill'
import { withDbRetry } from '@/lib/dbRetry'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { CLIENT_COOKIE_NAME, verifyClientCookieValue } from '@/lib/portalAuth'

/** Raw rows behind any client-report card. Gated: signed-in clients and admins only. */
export async function GET(req: NextRequest) {
  const isClient = await verifyClientCookieValue(req.cookies.get(CLIENT_COOKIE_NAME)?.value)
  const isAdmin = !isClient && await verifyAdminCookieValue(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!isClient && !isAdmin) {
    return NextResponse.json({ ok: false, error: 'Sign in first.' }, { status: 401 })
  }

  const p = req.nextUrl.searchParams
  const kind = p.get('kind')
  if (!['jobs', 'placements', 'candidates', 'applications', 'locations'].includes(kind ?? '')) {
    return NextResponse.json({ ok: false, error: 'Unknown drill kind.' }, { status: 400 })
  }
  const outcome = p.get('outcome')
  const stage = p.get('stage')
  const params: DrillParams = {
    kind: kind as DrillParams['kind'],
    open: p.get('open') === '1',
    filled: p.get('filled') === '1',
    unfilled: p.get('unfilled') === '1',
    ytd: p.get('ytd') === '1',
    ytdPair: p.get('ytdPair') === '1',
    active: p.get('active') === '1',
    state: p.get('state') ?? undefined,
    specialty: p.get('specialty') ?? undefined,
    month: p.get('month') ?? undefined,
    fromMonth: p.get('fromMonth') ?? undefined,
    toMonth: p.get('toMonth') ?? undefined,
    fromDate: p.get('fromDate') ?? undefined,
    toDate: p.get('toDate') ?? undefined,
    sinceDays: p.get('sinceDays') ? Number(p.get('sinceDays')) : undefined,
    cityState: p.get('cityState') ?? undefined,
    ageBand: p.get('ageBand') ?? undefined,
    durationBand: p.get('durationBand') ?? undefined,
    outcome: outcome === 'added' || outcome === 'already' || outcome === 'noContact' ? outcome : undefined,
    reach: (['added', 'contacted', 'read', 'spoke', 'forwarded'] as const)
      .find(k => k === p.get('reach')),
    channel: (['text', 'email', 'call'] as const).find(k => k === p.get('channel')),
    basis: p.get('basis') === 'event' ? 'event' : undefined,
    registeredMonth: p.get('registeredMonth') ?? undefined,
    targets: p.get('targets') ?? undefined,
    from: p.get('from') ?? undefined,
    to: p.get('to') ?? undefined,
    activeState: p.get('activeState') ?? undefined,
    client: p.get('client') ?? undefined,
    stage: stage === 'submitted' || stage === 'placed' ? stage : stage === 'all' ? 'all' : undefined,
  }

  try {
    const { rows, stats } = await withDbRetry(() => runDrill(params))
    return NextResponse.json({ ok: true, rows, stats })
  } catch (err) {
    console.error('Drill failed:', err)
    return NextResponse.json({ ok: false, error: 'Could not load the rows.' }, { status: 500 })
  }
}
