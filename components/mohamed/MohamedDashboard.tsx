import type { MohamedAutomationRun } from '@/lib/mohamedTypes'
import type { RunLedgerSnapshot } from '@/lib/mohamedLedger'
import type { RunHistoryItem } from '@/lib/mohamedQueries'
import type { RunRequestRow } from '@/lib/mohamedRunRequests'
import { describeFailure, summariseInPlainLanguage } from '@/lib/mohamedLedger'
import { RunTrace } from './RunTrace'
import { RunHistory } from './RunHistory'
import { CsvUploadCard } from './CsvUploadCard'

const stageStyles = {
  passed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  blocked: 'bg-amber-50 text-amber-800 border-amber-200',
  failed: 'bg-red-50 text-red-800 border-red-200',
  not_run: 'bg-zinc-50 text-zinc-500 border-zinc-200',
} as const

const reasonLabels: Record<string, string> = {
  sandata_not_verified: 'Sandata not verified',
  qualifying_coverage_missing: 'Qualifying coverage missing',
  member_id_invalid: 'Member ID invalid',
  units_invalid: 'Units invalid',
  charge_amount_invalid: 'Charge amount invalid',
  service_date_invalid: 'Service date invalid',
  service_code_missing: 'Service code missing',
  procedure_code_missing: 'Procedure code missing',
}

function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.round(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

const statusHero = {
  review_ready: { border: 'border-emerald-200', bg: 'bg-emerald-50', badge: 'bg-emerald-600 text-white', label: 'Working' },
  blocked: { border: 'border-amber-200', bg: 'bg-amber-50', badge: 'bg-amber-500 text-white', label: 'Needs attention' },
  failed: { border: 'border-red-200', bg: 'bg-red-50', badge: 'bg-red-600 text-white', label: 'Stopped' },
} as const

export function MohamedDashboard({
  runs,
  ledger,
  ledgerSource = 'synthetic',
  history = [],
  isAdmin,
  inFlight = null,
}: {
  runs: MohamedAutomationRun[]
  ledger?: RunLedgerSnapshot
  ledgerSource?: 'live' | 'synthetic' | 'unavailable'
  history?: RunHistoryItem[]
  isAdmin: boolean
  inFlight?: RunRequestRow | null
}) {
  const latest = runs[0]
  const ready = latest?.items.filter(item => item.disposition === 'ready_for_review').length ?? 0
  const blocked = latest?.items.filter(item => item.disposition === 'blocked').length ?? 0
  const hero = ledger ? statusHero[ledger.status] : null
  const failureDetail = ledger ? describeFailure(ledger) : null

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-emerald-700">UZU STUDIO</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Mohamed billing automation</h1>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {isAdmin && (
            <nav className="flex rounded-lg border border-zinc-200 bg-white p-1">
              <a href="/" className="rounded-md px-3 py-1.5 text-zinc-500 hover:text-zinc-900">Proxi</a>
              <a href="/mohamed" className="rounded-md bg-zinc-900 px-3 py-1.5 text-white">Mohamed</a>
            </nav>
          )}
          {!isAdmin && (
            <form method="post" action="/api/mohamed/logout">
              <button type="submit" className="text-zinc-500 hover:text-zinc-900">Sign out</button>
            </form>
          )}
        </div>
      </header>

      {/* Status hero: the ONE thing to read if you read nothing else. Plain language,
          no jargon, answers "is this working" before anything else on the page. */}
      {ledger && hero ? (
        <section className={`mt-7 rounded-2xl border p-5 ${hero.border} ${hero.bg}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${hero.badge}`}>{hero.label}</span>
                <span className="text-[11px] text-zinc-500">
                  Last run {timeAgo(ledger.finished_at ?? ledger.started_at)} · Validation mode: no claims are submitted, ever
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-zinc-900">{summariseInPlainLanguage(ledger)}</p>
              {failureDetail && (
                <p className="mt-2 rounded-lg bg-white/60 px-3 py-2 font-mono text-[11px] text-red-800">{failureDetail}</p>
              )}
            </div>
            {isAdmin && (
              <div className="text-right text-[11px] text-zinc-500">
                {inFlight ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                    A run is {inFlight.status} — checking automatically
                  </span>
                ) : (
                  'Upload a CSV below to start a run'
                )}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Validation mode</p>
              <p className="mt-1 text-sm text-emerald-900">No claims are submitted. Every result stays in review.</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-800">Dry run only</span>
          </div>
        </section>
      )}

      {ledger && ledgerSource !== 'live' && (
        <p className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-600">
          {ledgerSource === 'unavailable'
            ? 'The run ledger store is unreachable right now — showing the last synthetic run instead.'
            : 'Showing a synthetic run. Live runs appear here once one has completed.'}
        </p>
      )}

      {isAdmin && <CsvUploadCard hasFile={Boolean(ledger)} />}

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          ['Rows checked', latest?.items.length ?? 0],
          ['Ready for review', ready],
          ['Blocked', blocked],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      {latest && (
        <>
          <section className="mt-7">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Pipeline stages</h2>
                <p className="mt-0.5 text-xs text-zinc-500">{latest.id} · synthetic fixture</p>
              </div>
              <span className="text-xs text-zinc-500">{latest.billingPeriods.map(period => `${period.startDate} to ${period.endDate}`).join(', ')}</span>
            </div>
            <div className="grid gap-2 md:grid-cols-5">
              {latest.stages.map(stage => (
                <div key={stage.name} className={`rounded-xl border p-3 ${stageStyles[stage.status]}`}>
                  <p className="text-xs font-semibold">{stage.name}</p>
                  <p className="mt-1 text-[11px] leading-relaxed opacity-80">{stage.detail}</p>
                </div>
              ))}
            </div>
          </section>

          {ledger && (
            <>
              <RunTrace ledger={ledger} />
              <RunHistory history={history} selectedRunId={ledger.run_id} />
            </>
          )}

          <section className="mt-7 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-5 py-4">
              <h2 className="text-base font-semibold">Billing review</h2>
              <p className="mt-1 text-xs text-zinc-500">Synthetic aliases only until the PHI hosting boundary is approved.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-xs">
                <thead className="bg-zinc-50 text-zinc-500">
                  <tr>
                    {['Member', 'Service date', 'Service', 'Procedure', 'Modifiers', 'Units', 'Charge', 'Status'].map(label => (
                      <th key={label} className="px-4 py-3 font-medium">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {latest.items.map(item => (
                    <tr key={item.sourceRowId}>
                      <td className="px-4 py-3 font-medium">{item.memberRef}</td>
                      <td className="px-4 py-3">{item.serviceDate}</td>
                      <td className="px-4 py-3">{item.serviceCode}</td>
                      <td className="px-4 py-3">{item.procedureCode}</td>
                      <td className="px-4 py-3">{item.modifiers.join(', ') || 'None'}</td>
                      <td className="px-4 py-3">{item.units}</td>
                      <td className="px-4 py-3">{money(item.chargeAmountCents)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 font-medium ${item.disposition === 'ready_for_review' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                          {item.disposition === 'ready_for_review' ? 'Ready for review' : 'Blocked'}
                        </span>
                        {item.reasons.length > 0 && (
                          <p className="mt-1 text-[10px] text-zinc-500">{item.reasons.map(reason => reasonLabels[reason] ?? reason).join(', ')}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <footer className="mt-8 border-t border-zinc-200 pt-4 text-[11px] text-zinc-500">
        Automation Hub · Mohamed workspace · Review-only pilot
      </footer>
    </div>
  )
}
