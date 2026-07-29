import { unstable_cache } from 'next/cache'
import { getClientReport } from '@/lib/clientReport'
import { withDbRetry } from '@/lib/dbRetry'
import ClientReportView from '@/components/djc/ClientReportView'

export const revalidate = 300

/** The condensed client-facing report — one page across Operational, DJC and Kimedics. */
const getCached = unstable_cache(() => getClientReport(), ['client-report-v1'], { revalidate: 300 })

export default async function ClientReportPage() {
  let report = null
  try {
    report = await withDbRetry(() => getCached())
  } catch (err) {
    console.error('Failed to build the client report:', err)
  }
  return report ? (
    <ClientReportView report={report} />
  ) : (
    <p className="text-sm text-zinc-500">
      The database is busy right now. Refresh in a few seconds — nothing is wrong with the data.
    </p>
  )
}
