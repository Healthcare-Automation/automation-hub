import { unstable_cache } from 'next/cache'
import { getClientReport } from '@/lib/clientReport'
import { withDbRetry } from '@/lib/dbRetry'
import ClientReportView from '@/components/djc/ClientReportView'

export const revalidate = 300

/** The client portal: only the condensed report, plus a sign-out link. Same cache key as the
 *  admin Client-Facing tab, so both views always show identical numbers. */
const getCached = unstable_cache(() => getClientReport(), ['client-report-v42'], { revalidate: 300 })

export default async function PortalPage() {
  let report = null
  try {
    report = await withDbRetry(() => getCached())
  } catch (err) {
    console.error('Failed to build the client report:', err)
  }
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-widest text-zinc-500">PROXI</p>
        <a href="/api/portal/logout"
           className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300">
          Sign out
        </a>
      </div>
      {report ? (
        <ClientReportView report={report} showSend />
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          The report is busy refreshing right now. Give it a few seconds and reload — nothing is
          wrong with the data.
        </p>
      )}
    </div>
  )
}
