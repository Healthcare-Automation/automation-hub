import Link from 'next/link'
import { getDjcInsights, type InsightsPeriod } from '@/lib/djcInsights'
import DjcInsightsPanel from '@/components/DjcInsightsPanel'

export const dynamic = 'force-dynamic'

/** Full-page DJC candidate analytics. The dashboard's Insights tab links here — the report needs
 *  more width and air than the status page's narrow column can give it. */
export default async function DjcInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: rawPeriod } = await searchParams
  const period: InsightsPeriod = rawPeriod === 'all' ? 'all' : 'quarter'

  let data = null
  try {
    data = await getDjcInsights(period)
  } catch (err) {
    console.error('Failed to load DJC insights:', err)
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
        <header className="mb-8">
          <Link href="/" className="text-xs text-zinc-500 transition-colors hover:text-zinc-300">
            ← Automation Hub
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-white">
            Dentist Job Cafe — Insights
          </h1>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-500">
            Live candidate analytics from the DJC → Salesforce automation. Click any number to see
            the exact candidates behind it.
          </p>
        </header>

        {data ? (
          <DjcInsightsPanel data={data} />
        ) : (
          <p className="text-sm text-zinc-500">Insights unavailable — could not read candidate data.</p>
        )}
      </div>
    </main>
  )
}
