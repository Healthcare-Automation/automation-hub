import { getDailyStatus, getRecentRuns, getWeeklySummary } from '@/lib/queries'
import { getOverallStatus, calculateUptime } from '@/lib/utils'
import type { Phase } from '@/lib/types'
import StatusHeader from '@/components/StatusHeader'
import WeeklySummaryCards from '@/components/WeeklySummary'
import AutomationCard from '@/components/AutomationCard'

export const revalidate = 60

function ProxiLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-7 w-7 rounded-lg bg-white flex items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="#000" />
          <path d="M7 12h10M12 7v10" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <span className="font-semibold text-white tracking-tight">Automation Hub</span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.1em] mb-3">
      {children}
    </p>
  )
}

export default async function Page() {
  let dailyStatus, recentRuns, weeklySummary

  try {
    ;[dailyStatus, recentRuns, weeklySummary] = await Promise.all([
      getDailyStatus(),
      getRecentRuns(20),
      getWeeklySummary(),
    ])
  } catch (err) {
    console.error('Failed to load status data:', err)
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="text-center space-y-3">
          <p className="text-zinc-400 font-medium">Unable to connect to database</p>
          <p className="text-zinc-600 text-sm">Check that DATABASE_URL is configured correctly.</p>
        </div>
      </main>
    )
  }

  // Testing phase: started from the first day we have any run data
  const testingStartDate =
    dailyStatus.find(d => d.totalRuns > 0)?.day ?? dailyStatus[0].day

  // Any no-data day on or after the automation started means the inbox was
  // empty — the script exits early without writing a DB row. Show as idle.
  const enrichedDailyStatus = dailyStatus.map(d =>
    d.status === 'no_data' && d.day >= testingStartDate
      ? { ...d, status: 'idle' as const }
      : d
  )

  const lastRun = recentRuns[0] ?? null
  const overallStatus = getOverallStatus(enrichedDailyStatus, lastRun)
  const uptime = calculateUptime(enrichedDailyStatus)

  const phases: Phase[] = [
    { label: 'Testing', startDate: testingStartDate, kind: 'testing' },
  ]

  return (
    <main className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-10">

        {/* Top nav */}
        <header className="flex items-center justify-between">
          <ProxiLogo />
        </header>

        {/* Overall status + phase combined */}
        <section>
          <SectionLabel>System Status</SectionLabel>
          <StatusHeader overallStatus={overallStatus} lastRun={lastRun} phases={phases} />
        </section>

        {/* Automations + weekly stats combined */}
        <section>
          <SectionLabel>Automations</SectionLabel>
          <div className="bg-zinc-800/20 border border-zinc-700/40 rounded-2xl overflow-hidden">

            {/* Weekly stats strip */}
            <div className="border-b border-zinc-700/40">
              <WeeklySummaryCards summary={weeklySummary} />
            </div>

            {/* Active automation cards */}
            <div className="p-3 space-y-3">
              <AutomationCard
                name="Kimedics → Salesforce Pipeline"
                description="Scrapes Kimedics job emails, enriches via Playwright, and syncs to Salesforce"
                schedule="Runs every 30 min via Modal"
                dailyStatus={enrichedDailyStatus}
                recentRuns={recentRuns}
                uptime={uptime}
                phases={phases}
              />
            </div>

            {/* Coming soon hint */}
            <div className="border-t border-zinc-700/40 px-5 py-3 flex items-center gap-2.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
              </svg>
              <span className="text-xs text-zinc-600">More automations coming soon</span>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-6 border-t border-zinc-800/60">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Automation Hub</span>
            <span>Refreshes every 60 s · Powered by Supabase + Next.js</span>
          </div>
        </footer>

      </div>
    </main>
  )
}
