import { unstable_cache } from 'next/cache'
import { getDailyStatus, getRecentRuns, getWeeklySummary, getPipelineBacklog } from '@/lib/queries'
import { getDjcDailyStatus, getDjcRecentRuns, getDjcSummary, getDjcProfileViews, getDjcQuotaBlocked, getDjcViewYield } from '@/lib/djcQueries'
import { isDjcConfigured } from '@/lib/djcDb'
import { isDjcFailedStatus } from '@/lib/djcTypes'
import { getCandidateBankBundle } from '@/lib/candidateBankQueries'
import { isCandidateBankConfigured } from '@/lib/candidateBankDb'
import CandidateBankCard from '@/components/CandidateBankCard'
import { getOverallStatus, calculateUptime } from '@/lib/utils'
import type { Phase, OverallStatus } from '@/lib/types'
import StatusHeader from '@/components/StatusHeader'
import AutomationCard from '@/components/AutomationCard'
import DjcAutomationCard from '@/components/DjcAutomationCard'
import DjcHowItWorks from '@/components/DjcHowItWorks'
import { withDbRetry } from '@/lib/dbRetry'
import { AutomationTabs } from '@/components/AutomationTabs'
import { AutomationView } from '@/components/AutomationView'
import { AiCostPanel } from '@/components/AiCostPanel'
import { getKimedicsAiUsage, getDjcAiUsage } from '@/lib/aiUsage'
import { getOpenAiActualCost, getAnthropicActualCost } from '@/lib/aiBilling'
import { LiveDashboardRefresh } from '@/components/LiveDashboardRefresh'

/** Serve a cached render and revalidate in the background every 30s — the data only moves on
 * run cadence (10 min / hourly), and force-dynamic made every visit AND every 15s client
 * refresh pay the full multi-database render (~2s warm, ~16s cold). */
export const revalidate = 30

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

const EMPTY_PERIOD = { totalRuns: 0, candidatesSeen: 0, contactable: 0, duplicates: 0, wouldCreate: 0, created: 0, errors: 0 }
/** Rendered when the summary query alone fails, so one bad query cannot blank the whole card. */
const EMPTY_SUMMARY = { ...EMPTY_PERIOD, last7: { ...EMPTY_PERIOD }, lastRunAt: null }

const loadDjcCached = unstable_cache(
  () => loadDjcUncached(),
  // Bump on every shape change: a stale entry satisfies the type at compile time and arrives with
  // the new fields undefined — here that silently read every errored run as "recovered".
  ['djc-dashboard-bundle-v3-cohort-landed'],
  { revalidate: 45 },
)

async function loadDjcUncached() {
  // Each query retries past transient pooler saturation and then degrades to an empty result
  // INDEPENDENTLY. Previously one saturated connection rejected the whole Promise.all, which took
  // the entire dashboard down — a busy database rendered as a blank page rather than a slow one.
  const settle = <T,>(p: Promise<T>, fallback: T) =>
    withDbRetry(() => p).catch(err => {
      console.error('DJC query failed:', err)
      return fallback
    })
  const [dailyStatus, recentRuns, summary, profileViews, quotaBlocked, viewYield] = await Promise.all([
    settle(getDjcDailyStatus(), []),
    settle(getDjcRecentRuns(14), []),
    settle(getDjcSummary(), null as Awaited<ReturnType<typeof getDjcSummary>> | null),
    settle(getDjcProfileViews(), null),
    settle(getDjcQuotaBlocked(), []),
    settle(getDjcViewYield(6), []),
  ])
  // A transient pooler failure must not blank the whole card — fall back to an empty summary so
  // the automation still renders, with whatever loaded successfully.
  return { dailyStatus, recentRuns, summary, profileViews, quotaBlocked, viewYield, degraded: !summary }
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

  // Everything below is independent — one parallel wave instead of four sequential ones
  // (each sequential wave was a full round trip to a different Supabase pool or billing API).
  // Per-source catches keep one outage/misconfig from breaking the rest of the page.
  const [backlog, djcData, candidateBank, kimUsage, djcUsage, kimActual, djcActual] =
    await Promise.all([
      // Backlog = accepted-but-undelivered work. Without it the header said "Operational"
      // during the July 2 incident while 19 updates sat stuck.
      getPipelineBacklog().catch(() => null),
      isDjcConfigured
        ? loadDjcCached().catch((err: unknown) => {
            console.error('Failed to load DJC status data:', err)
            return null
          })
        : Promise.resolve(null),
      isCandidateBankConfigured
        ? getCandidateBankBundle().catch(err => {
            console.error('Failed to load Candidate Bank data:', err)
            return null
          })
        : Promise.resolve(null),
      getKimedicsAiUsage().catch(() => null),
      isDjcConfigured ? getDjcAiUsage().catch(() => null) : Promise.resolve(null),
      getOpenAiActualCost().catch(() => undefined),
      isDjcConfigured ? getAnthropicActualCost().catch(() => undefined) : Promise.resolve(undefined),
    ])

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
        if (isDjcFailedStatus(r.status)) return 'outage'
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
        : `${worst.name} ${worst.kind === 'outage' ? 'needs attention' : 'has recent issues'}`,
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-10">

        {/* Top nav */}
        <header className="flex items-center justify-between gap-4">
          <ProxiLogo />
          <nav className="flex rounded-lg border border-zinc-700/60 bg-zinc-900/60 p-1 text-xs">
            <a href="/" className="rounded-md bg-white px-3 py-1.5 font-medium text-zinc-900">Proxi</a>
            <a href="/mohamed" className="rounded-md px-3 py-1.5 text-zinc-400 transition-colors hover:text-white">Mohamed</a>
          </nav>
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
              />
            }
            djc={
              djcData ? (
                <AutomationView
                  operations={
                    <><DjcAutomationCard
                      dailyStatus={djcData.dailyStatus}
                      recentRuns={djcData.recentRuns}
                      summary={djcData.summary ?? EMPTY_SUMMARY}
                      profileViews={djcData.profileViews}
                      viewYield={djcData.viewYield}
                      quotaBlocked={djcData.quotaBlocked}
                    />
                    <div className="mt-3"><DjcHowItWorks /></div></>
                  }
                  cost={
                    djcUsage ? (
                      <AiCostPanel automation="djc" usage={djcUsage} actual={djcActual} accent="cyan" />
                    ) : (
                      <p className="text-xs text-zinc-600">AI cost unavailable — could not read usage data.</p>
                    )
                  }
                />
              ) : (
                <div className="flex items-center gap-2.5 rounded-xl border border-zinc-700/40 px-5 py-4">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
                    <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
                  </svg>
                  <span className="text-xs text-zinc-600">
                    {isDjcConfigured
                      ? 'DJC → Salesforce data is temporarily unavailable (the database was busy). Refresh in a few seconds — the automation itself is unaffected.'
                      : <>DJC → Salesforce automation — set <code className="text-zinc-500">DJC_DATABASE_URL</code> to show it here</>}
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
