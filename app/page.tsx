import { getDailyStatus, getRecentRuns, getWeeklySummary, getPipelineBacklog } from '@/lib/queries'
import { getDjcDailyStatus, getDjcRecentRuns, getDjcSummary } from '@/lib/djcQueries'
import { isDjcConfigured } from '@/lib/djcDb'
import { getCandidateBankBundle } from '@/lib/candidateBankQueries'
import { isCandidateBankConfigured } from '@/lib/candidateBankDb'
import CandidateBankCard from '@/components/CandidateBankCard'
import { getOverallStatus, calculateUptime } from '@/lib/utils'
import type { Phase, OverallStatus } from '@/lib/types'
import StatusHeader from '@/components/StatusHeader'
import AutomationCard from '@/components/AutomationCard'
import DjcAutomationCard from '@/components/DjcAutomationCard'
import { AutomationTabs } from '@/components/AutomationTabs'
import { AutomationView } from '@/components/AutomationView'
import { AiCostPanel } from '@/components/AiCostPanel'
import { ChangelogPanel } from '@/components/ChangelogPanel'
import { getKimedicsAiUsage, getDjcAiUsage } from '@/lib/aiUsage'
import { getOpenAiActualCost, getAnthropicActualCost } from '@/lib/aiBilling'
import { LiveDashboardRefresh } from '@/components/LiveDashboardRefresh'

/** Always read fresh DB state; client also calls router.refresh() on an interval (see LiveDashboardRefresh). */
export const dynamic = 'force-dynamic'

/** First day in production (UTC calendar day). Testing phase ends the prior day. */
const PRODUCTION_GO_LIVE_DATE = '2026-04-09'

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

async function loadDjc() {
  const [dailyStatus, recentRuns, summary] = await Promise.all([
    getDjcDailyStatus(),
    getDjcRecentRuns(20),
    getDjcSummary(),
  ])
  return { dailyStatus, recentRuns, summary }
}

export default async function Page() {
  // Every data dependency is fetched concurrently — the previous four sequential
  // stages (Kimedics → backlog → DJC → AI cost) made first paint pay the SUM of
  // their latencies (~17s) instead of the max. Only the core Kimedics trio is
  // fatal on failure; everything else fails soft to keep the page up.
  const [core, backlog, djcData, kimUsage, djcUsage, kimActual, djcActual, candidateBank] =
    await Promise.all([
      Promise.all([getDailyStatus(), getRecentRuns(20), getWeeklySummary()]).catch((err) => {
        console.error('Failed to load status data:', err)
        return null
      }),
      getPipelineBacklog().catch(() => null),
      isDjcConfigured
        ? loadDjc().catch((err) => {
            console.error('Failed to load DJC status data:', err)
            return null
          })
        : Promise.resolve(null),
      getKimedicsAiUsage().catch(() => null),
      isDjcConfigured ? getDjcAiUsage().catch(() => null) : Promise.resolve(null),
      getOpenAiActualCost().catch(() => undefined),
      isDjcConfigured ? getAnthropicActualCost().catch(() => undefined) : Promise.resolve(undefined),
      isCandidateBankConfigured
        ? getCandidateBankBundle().catch((err) => {
            console.error('Failed to load Candidate Bank data:', err)
            return null
          })
        : Promise.resolve(null),
    ])

  if (!core) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="text-center space-y-3">
          <p className="text-zinc-400 font-medium">Unable to connect to database</p>
          <p className="text-zinc-600 text-sm">Check that DATABASE_URL is configured correctly.</p>
        </div>
      </main>
    )
  }
  const [dailyStatus, recentRuns, weeklySummary] = core

  // Automation clock start: first day we have any run data (for idle / chart context)
  const testingStartDate =
    dailyStatus.find(d => d.totalRuns > 0)?.day ?? dailyStatus[0].day

  const lastTestingDay = (() => {
    const d = new Date(PRODUCTION_GO_LIVE_DATE + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().split('T')[0]
  })()

  // Any no-data day on or after the automation started means the inbox was
  // empty — the script exits early without writing a DB row. Show as idle.
  const enrichedDailyStatus = dailyStatus.map(d =>
    d.status === 'no_data' && d.day >= testingStartDate
      ? { ...d, status: 'idle' as const }
      : d
  )

  const lastRun = recentRuns[0] ?? null
  const overallStatus = getOverallStatus(enrichedDailyStatus, lastRun, backlog)
  const uptime = calculateUptime(enrichedDailyStatus)

  const phases: Phase[] = []
  if (testingStartDate <= lastTestingDay) {
    phases.push({
      label: 'Testing',
      startDate: testingStartDate,
      endDate: lastTestingDay,
      kind: 'testing',
    })
  }
  phases.push({
    label: 'Production',
    startDate: PRODUCTION_GO_LIVE_DATE,
    kind: 'production',
  })

  // Honest, aggregate system status across BOTH automations (was Kimedics-only before).
  const djcKind: OverallStatus['kind'] | null = djcData
    ? (() => {
        const r = djcData.recentRuns[0]
        if (!r) return 'degraded'
        if (r.status === 'error' || r.status === 'session_expired') return 'outage'
        if (r.errorCount > 0) return 'degraded'
        return 'operational'
      })()
    : null
  const RANK = { operational: 1, degraded: 2, outage: 3 } as const
  const health = [
    { name: 'Kimedics', kind: overallStatus.kind },
    ...(djcKind ? [{ name: 'Dentist Job Cafe', kind: djcKind }] : []),
  ]
  const worst = health.reduce((a, b) => (RANK[b.kind] > RANK[a.kind] ? b : a))
  const systemStatus: OverallStatus = {
    kind: worst.kind,
    label:
      worst.kind === 'operational' ? 'All Systems Operational'
      : worst.kind === 'degraded' ? 'Degraded Performance'
      : 'Partial Outage',
    description:
      worst.kind === 'operational'
        ? `${health.length} automation${health.length === 1 ? '' : 's'} running normally`
        : worst.name === 'Kimedics'
          ? `Kimedics — ${overallStatus.description}`
          : `${worst.name} ${worst.kind === 'outage' ? 'needs attention' : 'has recent issues'}`,
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-10">

        {/* Top nav */}
        <header className="flex items-center justify-between">
          <ProxiLogo />
        </header>

        {/* Aggregate health across all automations */}
        <section>
          <SectionLabel>System Status</SectionLabel>
          <StatusHeader overallStatus={systemStatus} lastRun={null} />
        </section>

        {/* Each automation gets its own tab so the views aren't crammed together */}
        <section className="space-y-3">
          <SectionLabel>Automations</SectionLabel>

          <AutomationTabs
            kimedics={
              <AutomationView
                operations={
                  <AutomationCard
                    name="Kimedics → Salesforce Pipeline"
                    description="Scrapes Kimedics job emails, enriches via Playwright, syncs to Salesforce, validates each job (with alert emails on failures), and sends a daily 24h quality digest"
                    schedule="Every 10 min · Modal"
                    dailyStatus={enrichedDailyStatus}
                    recentRuns={recentRuns}
                    uptime={uptime}
                    phases={phases}
                    weeklySummary={weeklySummary}
                    adminHref="/admin/recovery"
                  />
                }
                cost={
                  kimUsage ? (
                    <AiCostPanel automation="kimedics" usage={kimUsage} actual={kimActual} accent="emerald" />
                  ) : (
                    <p className="text-xs text-zinc-600">AI cost unavailable — could not read usage data.</p>
                  )
                }
                changelog={<ChangelogPanel automation="kimedics" />}
              />
            }
            djc={
              djcData ? (
                <AutomationView
                  operations={
                    <DjcAutomationCard
                      dailyStatus={djcData.dailyStatus}
                      recentRuns={djcData.recentRuns}
                      summary={djcData.summary}
                    />
                  }
                  cost={
                    djcUsage ? (
                      <AiCostPanel automation="djc" usage={djcUsage} actual={djcActual} accent="cyan" />
                    ) : (
                      <p className="text-xs text-zinc-600">AI cost unavailable — could not read usage data.</p>
                    )
                  }
                  changelog={<ChangelogPanel automation="djc" />}
                />
              ) : (
                <div className="flex items-center gap-2.5 rounded-xl border border-zinc-700/40 px-5 py-4">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
                    <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
                  </svg>
                  <span className="text-xs text-zinc-600">
                    DJC → Salesforce automation — set <code className="text-zinc-500">DJC_DATABASE_URL</code> to show it here
                  </span>
                </div>
              )
            }
            candidateBank={
              candidateBank ? (
                <CandidateBankCard bundle={candidateBank} />
              ) : isCandidateBankConfigured ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-zinc-700/40 px-5 py-4">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
                    <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
                  </svg>
                  <span className="text-xs text-zinc-600">Candidate Bank — could not load data.</span>
                </div>
              ) : undefined
            }
          />
        </section>

        {/* Footer */}
        <footer className="pt-6 border-t border-zinc-800/60">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Automation Hub</span>
            <span>Auto-refresh ~15s while open · Powered by Supabase + Next.js</span>
          </div>
        </footer>

      </div>
    </main>
  )
}
