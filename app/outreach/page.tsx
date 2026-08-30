import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { getOutreachCompanies, getOutreachSummary, getSendingReadiness,
  type OutreachCompanyRow, type SendingReadiness } from '@/lib/outreachQueries'
import { isOutreachConfigured } from '@/lib/outreachDb'
import OutreachView from '@/components/outreach/OutreachView'
import SendingReadinessPanel from '@/components/outreach/SendingReadinessPanel'

export const dynamic = 'force-dynamic'

/** UZU Autonomous Outbound Engine — single view of the whole pipeline.
 * Reads outreach_* mirror tables (synced from the SQLite working DB on the VPS
 * by /root/projects/internal/outreach_automation/scripts/sync_to_postgres.py).
 * This page is read-only except for LinkedIn profile-match approve/reject,
 * which requires the admin cookie (same gate as Mohamed's claim approvals). */
export default async function OutreachPage() {
  const cookieStore = await cookies()
  const isAdmin = await verifyAdminCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)

  if (!isOutreachConfigured) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <p className="text-sm text-zinc-500">Set DATABASE_URL to show the Outreach pipeline here.</p>
      </main>
    )
  }

  let companies: OutreachCompanyRow[], summary
  let readiness: SendingReadiness | null = null
  let degraded = false
  try {
    ;[companies, summary, readiness] = await Promise.all([
      getOutreachCompanies(), getOutreachSummary(), getSendingReadiness(),
    ])
  } catch (err) {
    console.error('Failed to load outreach data:', err)
    degraded = true
    companies = []
    summary = null
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <header className="mb-6">
          <a href="/" className="text-xs text-zinc-500 transition-colors hover:text-zinc-800 dark:hover:text-zinc-300">
            ← Automation Hub
          </a>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">
            UZU Outbound Engine — Pipeline
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Every prospect, score, draft, sequence, and reply in one place.
            {summary?.last_synced_at && (
              <> Last synced {new Date(summary.last_synced_at).toLocaleString()}.</>
            )}
          </p>
        </header>

        {degraded ? (
          <p className="text-sm text-amber-700 dark:text-amber-300/80">
            Could not load outreach data — the database may be busy. Refresh in a few seconds.
          </p>
        ) : (
          <>
            {readiness && <SendingReadinessPanel readiness={readiness} />}
            <OutreachView companies={companies} summary={summary} isAdmin={isAdmin} />
          </>
        )}
      </div>
    </main>
  )
}
