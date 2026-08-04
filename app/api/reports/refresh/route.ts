import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import djcSql from '@/lib/djcDb'
import { withDbRetry } from '@/lib/dbRetry'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { CLIENT_COOKIE_NAME, verifyClientCookieValue } from '@/lib/portalAuth'

/**
 * Refresh the report — and, when the mirror is stale, re-pull Salesforce first.
 *
 * Two different things used to hide behind one button: rebuilding the cached snapshot (fast, local)
 * and re-syncing the Salesforce mirror the snapshot reads from (a Modal job). Pressing Refresh now
 * does both, so "refresh" means what a reader assumes it means.
 *
 * The sync is Salesforce READS ONLY — it opens no DentistJobCafe page and cannot spend a Profile
 * View. A cooldown keeps repeated presses from queueing duplicate syncs: inside the window the
 * button still rebuilds the snapshot, it just does not re-trigger the job.
 */
const COOLDOWN_MINUTES = 10

/** Derived from the impact endpoint's URL so no new environment variable is needed. */
function syncUrl(): string | null {
  const impact = process.env.MODAL_DJC_IMPACT_URL
  if (!impact) return null
  return impact.replace('djc-impact-endpoint', 'djc-sync-endpoint')
}

export async function POST(req: NextRequest) {
  const isClient = await verifyClientCookieValue(req.cookies.get(CLIENT_COOKIE_NAME)?.value)
  const isAdmin = !isClient && await verifyAdminCookieValue(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!isClient && !isAdmin) {
    return NextResponse.json({ ok: false, error: 'Sign in first.' }, { status: 401 })
  }

  let syncedMinutesAgo: number | null = null
  try {
    const [row] = await withDbRetry(() => djcSql!<{ mins: number | null }[]>`
      select extract(epoch from (now() - max(synced_at))) / 60 as mins from djc_jobs`)
    syncedMinutesAgo = row?.mins === null || row?.mins === undefined ? null : Number(row.mins)
  } catch (err) {
    console.error('Refresh: could not read the mirror age:', err)
  }

  const url = syncUrl()
  const token = process.env.MODAL_DJC_IMPACT_TOKEN
  const stale = syncedMinutesAgo === null || syncedMinutesAgo >= COOLDOWN_MINUTES
  let triggered = false
  let note = 'Rebuilt from the last Salesforce sync.'

  if (url && token && stale) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, refresh_matches: true }),
        signal: AbortSignal.timeout(15_000),
      })
      triggered = res.ok
      note = res.ok
        ? 'Pulling fresh data from Salesforce — it lands in a minute or two.'
        : 'Rebuilt locally; the Salesforce sync could not be reached.'
      if (!res.ok) console.error('Refresh: sync endpoint returned', res.status)
    } catch (err) {
      console.error('Refresh: sync trigger failed:', err)
      note = 'Rebuilt locally; the Salesforce sync could not be reached.'
    }
  } else if (!stale) {
    note = `Salesforce was synced ${Math.round(syncedMinutesAgo ?? 0)} min ago — rebuilt from that.`
  }

  revalidateTag('client-report', { expire: 0 })
  return NextResponse.json({ ok: true, triggered, note, syncedMinutesAgo })
}
