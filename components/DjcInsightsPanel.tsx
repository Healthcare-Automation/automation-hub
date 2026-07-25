'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { DjcInsights, DrillRow, InsightBucket } from '@/lib/djcInsights'

/**
 * DJC Insights — full-page candidate analytics (/djc/insights).
 *
 * Layout contract: the page opens with THE question ("where did this quarter's views go") under
 * an explicit period filter; the all-time candidate-pool sections follow, clearly labeled. Any
 * clickable number opens the underlying candidates in a right-hand slide-over, never a table
 * pinned to the page bottom.
 *
 * Chart colors (validated for the dark surface + color-vision safety):
 * categorical order cyan → violet → emerald → amber; neutral zinc for "absence" buckets.
 */
const C = {
  cyan: '#0891b2',
  violet: '#8b5cf6',
  emerald: '#059669',
  amber: '#d97706',
  neutral: '#52525b',
}

const SOURCE_COLOR: Record<string, string> = {
  profile: C.cyan,
  cv: C.violet,
  'profile+cv': C.emerald,
  none: C.neutral,
}

interface Drill {
  dim: string
  value: string
  label: string
}

/** Sticky-nav sections, in page order. Conditional ones are filtered at render. */
const NAV_BY_VIEW: Record<'candidates' | 'acquisition', { id: string; label: string }[]> = {
  acquisition: [
    { id: 'views', label: 'Views' },
    { id: 'conserve', label: 'Conserve' },
    { id: 'funnel', label: 'Funnel' },
    { id: 'health', label: 'Site health' },
    { id: 'rules', label: 'How it works' },
  ],
  candidates: [
    { id: 'talent', label: 'Talent' },
    { id: 'specialties', label: 'Specialties' },
    { id: 'locations', label: 'Locations' },
    { id: 'experience', label: 'Experience' },
    { id: 'rating', label: 'Rating' },
  ],
}

export default function DjcInsightsPanel({ data, view }: { data: DjcInsights; view: 'candidates' | 'acquisition' }) {
  const showAcq = view === 'acquisition'
  const showCand = view === 'candidates'
  const [drill, setDrill] = useState<Drill | null>(null)
  const [activeSection, setActiveSection] = useState(view === 'acquisition' ? 'views' : 'talent')
  const [query, setQuery] = useState('')
  const [showTop, setShowTop] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const e of entries) if (e.isIntersecting) setActiveSection(e.target.id)
      },
      { rootMargin: '-90px 0px -70% 0px' },
    )
    for (const item of NAV_BY_VIEW[view]) {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    }
    const onScroll = () => setShowTop(window.scrollY > 900)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
    }
  }, [view])

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
  const factsPct = pct(data.totals.factsCoverage, data.totals.observed)
  const backfilling = factsPct < 95
  // Experience only exists on opened profile pages (partial by design until views allow more).
  const expPct = pct(data.totals.experienceCoverage, data.totals.observed)
  const expPartial = expPct < 95
  const conserveActive = data.conserveSkips.activeLast7d > 0
  const historyYoung =
    !data.sightingsSince ||
    (Date.now() - new Date(data.sightingsSince).getTime()) / 86400000 < 14

  const L = data.viewsLedger

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-10">
      {/* Sticky navigator: section pills + candidate search */}
      <nav className="sticky top-0 z-30 -mx-4 border-b border-zinc-800/70 bg-zinc-950/85 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex grow gap-1 overflow-x-auto">
            {NAV_BY_VIEW[view].filter(i => i.id !== 'conserve' || conserveActive || data.conserveSkips.total > 0).map(i => (
              <button
                key={i.id}
                onClick={() => jump(i.id)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
                  activeSection === i.id
                    ? 'bg-cyan-600/20 text-cyan-200'
                    : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-200',
                )}
              >
                {i.label}
              </button>
            ))}
          </div>
          <form
            onSubmit={e => {
              e.preventDefault()
              if (query.trim().length >= 2)
                setDrill({ dim: 'search', value: query.trim(), label: `Search: “${query.trim()}”` })
            }}
            className="shrink-0"
          >
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Find a candidate…"
              className="w-40 rounded-full border border-zinc-700/60 bg-zinc-900 px-3 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 outline-none transition-all focus:w-56 focus:border-cyan-700"
            />
          </form>
        </div>
      </nav>

      {/* ── Zone 1: the views question, period-scoped (Acquisition) ───────────────── */}
      {showAcq && (
      <section id="views" className="scroll-mt-16">
        <ZoneHeader
          title="Profile Views — where they went"
          description={
            L
              ? `The DJC subscription includes ${L.total.toLocaleString()} profile views per quarter. A view's outcome is only knowable after it's spent — DJC hides contact info until a profile is opened, so discovering that someone is already in Salesforce, or has no contact info at all, costs the same view as finding a great new candidate.`
              : 'No view snapshots recorded yet.'
          }
          filter={<PeriodFilter period={data.period} />}
        />

        {L && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <BigStat
                value={L.used}
                label="views used"
                detail={`of ${L.total.toLocaleString()} · since ${fmtDay(L.quarterStart)}`}
              />
              <BigStat
                value={L.outcomes.netNew}
                label="net-new candidates"
                detail={`${perView(L.outcomes.netNew, L.used)} — the win`}
                accent="text-cyan-300"
                onClick={() => setDrill({ dim: 'opened_outcome', value: 'net_new', label: 'Net-new candidates from this quarter’s views' })}
              />
              <BigStat
                value={L.outcomes.duplicates}
                label="already in Salesforce"
                detail="only detectable after opening"
                accent="text-violet-300"
                onClick={() => setDrill({ dim: 'opened_outcome', value: 'duplicates', label: 'Opened this quarter — turned out to already be in Salesforce' })}
              />
              <BigStat
                value={L.outcomes.uncontactable}
                label="no contact found"
                detail="nothing on profile or resume"
                accent="text-amber-300"
                onClick={() => setDrill({ dim: 'opened_outcome', value: 'uncontactable', label: 'Opened this quarter — no contact info anywhere' })}
              />
              <BigStat
                value={L.manualOrOther}
                label="manual / other use"
                detail="counter movement not from the automation"
              />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card title="Budget burn-down" sub="Views used per day against the quarterly allowance.">
                <ViewsChart days={data.viewsBurndown} />
              </Card>
              <Card title="Day-by-day ledger" sub="Click a day to see exactly which profiles were opened.">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-zinc-900">
                      <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
                        <th className="py-1.5 font-medium">Day</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Views</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Opened</th>
                        <th className="py-1.5 pr-3 text-right font-medium text-cyan-400">Net new</th>
                        <th className="py-1.5 pr-3 text-right font-medium text-violet-400">In SF</th>
                        <th className="py-1.5 text-right font-medium text-amber-400">No contact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {L.days.map(d => (
                        <tr
                          key={d.day}
                          onClick={() => setDrill({ dim: 'opened_day', value: d.day, label: `Profiles opened on ${fmtDay(d.day)}` })}
                          className="cursor-pointer border-t border-zinc-800 text-zinc-300 hover:bg-zinc-800/50"
                        >
                          <td className="py-2 tabular-nums text-zinc-400">{fmtDay(d.day)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums font-medium">{d.viewsUsed}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-zinc-400">{d.opens}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-cyan-300">{d.netNew}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-violet-300">{d.duplicates}</td>
                          <td className="py-2 text-right tabular-nums text-amber-300">{d.uncontactable}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        )}
      </section>
      )}

      {/* Conserve mode — the audit trail for pre-view skips ("the losses") */}
      {showAcq && (conserveActive || data.conserveSkips.total > 0) && (
        <section id="conserve" className="mt-6 scroll-mt-16">
          <Card
            title="Conserve mode — skipped before spending a view"
            tag={
              conserveActive ? (
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-cyan-300">
                  active · reverts Aug 15
                </span>
              ) : undefined
            }
            sub={`While views are scarce, candidates whose full name already matches a Salesforce contact are set aside WITHOUT paying for their profile. Historically this rule catches 84% of would-be wasted views and wrongly holds back roughly 1 in 70. Every skip is listed here with the matched contact — nothing is silently lost, and all of them can be processed after the Aug 15 refill.`}
          >
            {data.conserveSkips.rows.length === 0 ? (
              <p className="text-xs text-zinc-500">No candidates skipped yet.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-900">
                    <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
                      <th className="py-1.5 pr-3 font-medium">Candidate (DJC)</th>
                      <th className="py-1.5 pr-3 font-medium">Specialty</th>
                      <th className="py-1.5 pr-3 font-medium">Location</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Signed up</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Skipped</th>
                      <th className="py-1.5 font-medium">Matched contact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.conserveSkips.rows.map(r => (
                      <tr key={r.candidateId} className="border-t border-zinc-800/70 text-zinc-300">
                        <td className="max-w-40 truncate py-2 pr-3">
                          <a href={`https://www.dentistjobcafe.com/company/candidate/${r.candidateId}`} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">
                            {r.name ?? r.candidateId}
                          </a>
                        </td>
                        <td className="max-w-32 truncate py-2 pr-3 text-zinc-400">{r.target ?? '—'}</td>
                        <td className="max-w-32 truncate py-2 pr-3 text-zinc-400">{r.location ?? '—'}</td>
                        <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{r.registeredOn ?? '—'}</td>
                        <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{r.skippedOn ?? '—'}</td>
                        <td className="py-2">
                          {r.sfContactId ? (
                            <a href={sfContactUrl(r.sfContactId)} target="_blank" rel="noreferrer" className="whitespace-nowrap text-emerald-400 hover:underline">
                              open in Salesforce ↗
                            </a>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      )}

      {/* ── Zone 2: the funnel for the selected period (Acquisition) ──────────────── */}
      {showAcq && (
      <section id="funnel" className="scroll-mt-16">
        <ZoneHeader
          title={data.period === 'quarter' ? 'Sourcing funnel — this quarter' : 'Sourcing funnel — all time'}
          description="Each stage is clickable — see exactly who advanced and who dropped, and why."
        />
        <Card>
          <div className="space-y-4">
            {data.funnel.map((s, i) => (
              <button key={s.key} onClick={() => setDrill(funnelDrill(s.key, s.label, data.periodStart))} className="group block w-full text-left">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-medium text-zinc-200 group-hover:text-white">{s.label}</span>
                  <span className="text-[13px] tabular-nums text-zinc-300">
                    {s.count.toLocaleString()}
                    <span className="ml-2 text-zinc-600">{pct(s.count, data.funnel[0].count)}%</span>
                  </span>
                </div>
                <div className="mt-1.5 h-3 rounded-sm bg-zinc-800">
                  <div
                    className="h-3 rounded-sm transition-all group-hover:brightness-125"
                    style={{
                      width: `${Math.max(pct(s.count, data.funnel[0].count), 1)}%`,
                      background: C.cyan,
                      opacity: 1 - i * 0.13,
                    }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">{s.note}</p>
              </button>
            ))}
          </div>
        </Card>
      </section>
      )}

      {/* Site health (Acquisition) */}
      {showAcq && (
      <section className="scroll-mt-16">
          <Card
            id="health"
            title="How good is DJC as a source?"
            tag={
              backfilling || historyYoung ? (
                <GrowingTag>
                  {backfilling && historyYoung
                    ? 'signup data + daily history filling in'
                    : backfilling
                      ? 'signup data filling in'
                      : 'daily history accumulating'}
                </GrowingTag>
              ) : undefined
            }
            sub="Supply freshness: how fast new profiles arrive and how long people stay active after signing up."
          >
            <div className="space-y-6">
              {data.registeredCohorts.length > 0 && (() => {
                const total = data.registeredCohorts.reduce((a, c) => a + c.total, 0)
                const thisYear = new Date().getFullYear()
                const recent = data.registeredCohorts
                  .filter(c => Number(c.cohort) >= thisYear - 1)
                  .reduce((a, c) => a + c.total, 0)
                return (
                  <div>
                    <p className="mb-3 text-xs text-zinc-300">
                      <span className="font-semibold tabular-nums text-cyan-300">{Math.round((recent / Math.max(total, 1)) * 100)}%</span>{' '}
                      of the candidate pool signed up in {thisYear - 1}–{thisYear} — the rest is older inventory
                      resurfacing in searches.
                    </p>
                    <SmallLabel>Profile signups by year · solid = still active in the last 90 days</SmallLabel>
                    <YearBars
                      cohorts={data.registeredCohorts}
                      onClick={c => setDrill({ dim: 'registered_year', value: c.cohort, label: `Signed up in ${c.cohort}` })}
                    />
                    {data.monthlyInflow.length > 0 && (
                      <div className="mt-5">
                        <SmallLabel>Fresh supply: new DJC signups per month, last 12 months</SmallLabel>
                        <BarList
                          items={data.monthlyInflow.map(m => ({
                            key: m.month,
                            label: new Date(m.month + '-02').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                            count: m.count,
                            color: C.emerald,
                          }))}
                          total={Math.max(...data.monthlyInflow.map(m => m.count), 1)}
                          relative
                        />
                      </div>
                    )}
                  </div>
                )
              })()}
              {data.dropoff.some(b => b.count > 0) && (() => {
                const dropTotal = data.dropoff.reduce((a, b) => a + b.count, 0)
                return (
                  <div>
                    <SmallLabel>Lifespan: gap between signing up and their last activity</SmallLabel>
                    <p className="mb-2 text-[11px] leading-relaxed text-zinc-500">
                      &ldquo;2y+&rdquo; is the good end — people still active years after joining. &ldquo;&lt;1mo&rdquo; means
                      they signed up and went quiet within a month.
                    </p>
                    <BarList
                      items={data.dropoff.map(b => ({ ...b, color: C.amber }))}
                      total={Math.max(...data.dropoff.map(b => b.count), 1)}
                      relative
                      extra={data.dropoff.map(b => `${Math.round((b.count / Math.max(dropTotal, 1)) * 100)}%`)}
                      onClick={b => setDrill({ dim: 'dropoff', value: b.key, label: `Active for ${b.label} after signup` })}
                    />
                  </div>
                )
              })()}
              <p className="text-[11px] leading-relaxed text-zinc-500">
                {data.sightingsSince
                  ? `Day-by-day appearance tracking started ${fmtDay(data.sightingsSince)} — recurrence and return-rate charts sharpen as history accumulates.`
                  : 'Day-by-day appearance tracking starts with the next scheduled run.'}
              </p>
            </div>
          </Card>
      </section>
      )}

      {/* ── Zone 3: the candidate pool (Candidates) ───────────────────────────────── */}
      {showCand && (
      <section>
        <ZoneHeader
          title="Candidate pool — everyone we've observed"
          description={`All ${data.totals.observed.toLocaleString()} candidates our scans have ever seen, regardless of period. ${data.totals.phoneFromResumeOnly.toLocaleString()} phone numbers exist only because resumes were parsed.`}
        />

        <div className="space-y-6">
          <SectionHeader
            title="Who they are"
            sub="Training, career stage, languages, and how we recovered their contact info."
          />
          <Card
            title="How contact info was recovered"
            sub={`Of the ${data.totals.opened.toLocaleString()} profiles opened so far.`}
          >
            <BarList
              items={data.contactSources.map(b => ({ ...b, color: SOURCE_COLOR[b.key] ?? C.neutral }))}
              total={data.totals.opened}
              onClick={b => setDrill({ dim: 'contact_source', value: b.key, label: b.label })}
            />
          </Card>

          <Card
            id="talent"
            title="Who these candidates are"
            tag={<GrowingTag>resume-mined · covers ~{pct(data.totals.experienceCoverage, data.totals.observed) > 45 ? 'half' : `${pct(data.totals.experienceCoverage, data.totals.observed)}%`} of the pool</GrowingTag>}
            sub="Career facts extracted from the resumes stored in Salesforce — no DJC views spent. Every number opens its people."
          >
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <BigStat
                value={data.totals.newGrads}
                label="new grads"
                detail="graduated 2025 or later"
                accent="text-emerald-300"
                onClick={() => setDrill({ dim: 'new_grads', value: 'yes', label: 'New grads (graduated 2025+)' })}
              />
              <BigStat
                value={data.talent.residencyTrained}
                label="residency / specialty trained"
                detail="GPR, AEGD, or specialty programs"
                accent="text-cyan-300"
                onClick={() => setDrill({ dim: 'residency', value: 'yes', label: 'Residency / specialty-trained candidates' })}
              />
              <BigStat
                value={data.talent.trainingOrigin.us}
                label="US-trained"
                detail="first dental degree in the US"
                onClick={() => setDrill({ dim: 'training_origin', value: 'US-trained', label: 'US-trained candidates' })}
              />
              <BigStat
                value={data.talent.trainingOrigin.foreign}
                label="foreign-trained"
                detail="often need state licensure paths"
                accent="text-violet-300"
                onClick={() => setDrill({ dim: 'training_origin', value: 'foreign-trained', label: 'Foreign-trained candidates' })}
              />
            </div>

            <div className="mb-5">
              <SmallLabel>
                Career stage · median {data.talent.medianExperience ?? '—'} years of experience
              </SmallLabel>
              <SegmentBar
                segments={data.talent.careerStages.map(b => ({
                  key: b.key, label: b.label, count: b.count,
                  color: b.key === 'new_grad' ? C.emerald : b.key === 'unknown' ? '#3f3f46'
                    : b.key === 'early' ? '#22d3ee' : b.key === 'established' ? C.cyan : '#155e75',
                }))}
                onClick={k => {
                  const b = data.talent.careerStages.find(x => x.key === k)
                  if (b) setDrill({ dim: 'career_stage', value: b.key, label: b.label })
                }}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {data.talent.topSchools.length > 0 && (
                <div>
                  <SmallLabel>Top dental schools in the pool</SmallLabel>
                  <BarList
                    items={data.talent.topSchools.map(s => ({ key: s.school, label: s.school, count: s.count, color: C.violet }))}
                    total={Math.max(...data.talent.topSchools.map(s => s.count), 1)}
                    relative
                    onClick={b => setDrill({ dim: 'school', value: b.key, label: `Trained at ${b.label}` })}
                    maxVisible={6}
              />
                </div>
              )}
              {data.talent.languages.length > 0 && (
                <div>
                  <SmallLabel>Languages beyond English (from resumes)</SmallLabel>
                  <BarList
                    items={data.talent.languages.map(l => ({ key: l.language, label: l.language, count: l.count, color: C.emerald }))}
                    total={Math.max(...data.talent.languages.map(l => l.count), 1)}
                    relative
                    onClick={b => setDrill({ dim: 'language', value: b.key, label: `Speaks ${b.label}` })}
                    maxVisible={6}
              />
                </div>
              )}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {data.talent.workEnvironments.length > 0 && (
                <div>
                  <SmallLabel>Preferred work environments (from DJC cards)</SmallLabel>
                  <BarList
                    items={data.talent.workEnvironments.map(b => ({ ...b, color: C.cyan }))}
                    total={Math.max(...data.talent.workEnvironments.map(b => b.count), 1)}
                    relative
                    onClick={b => setDrill({ dim: 'work_env', value: b.key, label: `Prefers: ${b.label}` })}
                    maxVisible={6}
              />
                </div>
              )}
              {data.talent.degrees.length > 0 && (
                <div>
                  <SmallLabel>Degrees (from DJC cards)</SmallLabel>
                  <BarList
                    items={data.talent.degrees.map(b => ({ ...b, color: C.violet }))}
                    total={Math.max(...data.talent.degrees.map(b => b.count), 1)}
                    relative
                    onClick={b => setDrill({ dim: 'degrees', value: b.key, label: `Degree: ${b.label}` })}
                    maxVisible={6}
              />
                </div>
              )}
            </div>
          </Card>

          <SectionHeader
            title="The breakdowns — specialty, location, experience"
            sub="Every number clicks through to its list of candidates."
          />
          <Card
            id="specialties"
            title="Specialty breakdown"
            sub="Click a specialty for its candidates."
            tag={expPartial ? <GrowingTag>avg experience known for {expPct}% of profiles</GrowingTag> : undefined}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
                    <th className="pb-2 font-medium">Specialty</th>
                    <th className="pb-2 pr-4 text-right font-medium">Total</th>
                    <th className="pb-2 pr-4 text-right font-medium">Net new</th>
                    <th className="pb-2 pr-4 text-right font-medium">Contactable</th>
                    <th className="pb-2 pr-4 text-right font-medium">Avg yrs exp</th>
                    <th className="pb-2 text-right font-medium">Avg rating</th>
                  </tr>
                </thead>
                <tbody>
                  {data.specialties.map(s => (
                    <tr
                      key={s.target}
                      onClick={() => setDrill({ dim: 'specialty', value: s.target, label: s.target })}
                      className="cursor-pointer border-t border-zinc-800 text-zinc-300 hover:bg-zinc-800/50"
                    >
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-3">
                          <span className="w-40 shrink-0 truncate sm:w-56">{s.target}</span>
                          <div className="hidden h-2 w-full max-w-52 rounded-sm bg-zinc-800 sm:block">
                            <div
                              className="h-2 rounded-sm"
                              style={{ width: `${pct(s.total, data.specialties[0]?.total || 1)}%`, background: C.cyan }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{s.total.toLocaleString()}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-cyan-300">{s.netNew}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{pct(s.contactable, s.total)}%</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{s.avgExperience ?? '—'}</td>
                      <td className="py-2.5 text-right tabular-nums">{s.avgRating ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card id="locations" title="Location breakdown" sub="By mailing state. Click a state for its candidates.">
              <BarList
                items={data.states.filter(s => s.state !== 'Unknown').map(s => ({ key: s.state, label: s.state, count: s.total, color: C.cyan }))}
                total={Math.max(...data.states.filter(s => s.state !== 'Unknown').map(s => s.total), 1)}
                relative
                extra={data.states.filter(s => s.state !== 'Unknown').map(s => `${s.netNew} new`)}
                onClick={b => setDrill({ dim: 'state', value: b.key, label: `Candidates in ${b.label}` })}
                maxVisible={6}
              />
              {(() => {
                const unknown = data.states.find(s => s.state === 'Unknown')
                return unknown ? (
                  <button
                    onClick={() => setDrill({ dim: 'state', value: 'Unknown', label: 'Candidates without a state on file' })}
                    className="mt-3 text-[11px] text-zinc-500 hover:text-zinc-300"
                  >
                    + {unknown.total.toLocaleString()} without a state on file (mostly never-opened profiles)
                  </button>
                ) : null
              })()}
            </Card>

            <Card
              id="experience"
              title="Experience & education"
              tag={expPartial ? <GrowingTag>known for {expPct}% — needs profile opens to grow</GrowingTag> : undefined}
              sub="Experience is optional on DJC — only ~13% of opened profiles state it, and never-opened candidates can't have it yet. Education end-years cover more (~46% of opened profiles), so grad year is the better new-grad signal."
            >
              <button
                onClick={() => setDrill({ dim: 'new_grads', value: 'yes', label: 'New grads (graduated 2025 or later)' })}
                className="mb-4 block rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-left transition-colors hover:bg-emerald-600/20"
              >
                <span className="text-lg font-semibold tabular-nums text-emerald-300">{data.totals.newGrads}</span>{' '}
                <span className="text-xs text-zinc-300">known new grads</span>
                <span className="ml-1.5 text-[10px] text-zinc-500">graduated 2025–2027 · click for the list</span>
              </button>
              <div className="space-y-5">
                <div>
                  <SmallLabel>Years of experience</SmallLabel>
                  <BarList
                    items={data.experience.map(b => ({ ...b, color: b.key === 'unknown' ? C.neutral : C.cyan }))}
                    total={Math.max(...data.experience.map(b => b.count), 1)}
                    relative
                    onClick={b => setDrill({ dim: 'experience', value: b.key, label: b.label === 'not stated' ? 'Experience not stated' : `${b.label} years of experience` })}
                  />
                </div>
                <div>
                  <SmallLabel>Graduation decade</SmallLabel>
                  {data.gradYears.length ? (
                    <BarList
                      items={data.gradYears.map(b => ({ ...b, color: C.violet }))}
                      total={Math.max(...data.gradYears.map(b => b.count), 1)}
                      relative
                      onClick={b => setDrill({ dim: 'grad_decade', value: b.key, label: `Graduated in the ${b.label}` })}
                    />
                  ) : (
                    <p className="text-xs text-zinc-500">No education data yet — filling in as the backfill runs.</p>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <SectionHeader
            title="Quality & engagement"
            sub="How complete each profile is and how recently candidates were active."
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <Card
              id="rating"
              title="Candidate rating"
              tag={expPartial ? <GrowingTag>experience factor known for {expPct}%</GrowingTag> : undefined}
              sub="Transparent 0–100 score: phone 25 · email 15 · resume 20 · experience up to 20 · recent activity up to 20."
            >
              <div className="flex items-start gap-6">
                <div className="shrink-0 text-center">
                  <div className="text-3xl font-semibold tabular-nums text-cyan-300">{data.rating.avg ?? '—'}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">average</div>
                </div>
                <div className="grow">
                  <BarList
                    items={data.rating.distribution.map(b => ({ ...b, color: C.cyan }))}
                    total={Math.max(...data.rating.distribution.map(b => b.count), 1)}
                    relative
                    onClick={b => setDrill({ dim: 'rating', value: b.key, label: `Rating ${b.label}` })}
                  />
                </div>
              </div>
            </Card>

            <Card
              title="Activity recency"
              sub="When candidates were last active on DJC — all candidates vs the net-new ones."
            >
              <div className="mb-3 flex items-center gap-4 text-[11px] text-zinc-400">
                <LegendSwatch color={C.cyan} label="All candidates" />
                <LegendSwatch color={C.violet} label="Net-new only" />
              </div>
              <PairedBars
                a={data.activity.overall}
                b={data.activity.netNew}
                colorA={C.cyan}
                colorB={C.violet}
                onClick={b => setDrill({ dim: 'activity', value: b.key, label: `Last active: ${b.label}` })}
              />
            </Card>
          </div>

        </div>
      </section>
      )}

      {/* ── Plain-English reference: how the numbers actually work (Acquisition) ──── */}
      {showAcq && (
      <section id="rules" className="scroll-mt-16">
        <ZoneHeader
          title="How this all works — plain English"
          description="The rules of the road behind these numbers, so anyone reading this page knows what's free, what costs money, and why."
        />
        <Card>
          <ul className="space-y-2.5 text-xs leading-relaxed text-zinc-400">
            <li>
              <span className="font-medium text-zinc-200">Opening a candidate's profile costs 1 Profile View.</span>{' '}
              The quarterly allowance is 750. Search-list pages are free — that's where the signup dates,
              degrees, locations, and activity dates on this page come from, refreshed hourly at no cost.
            </li>
            <li>
              <span className="font-medium text-zinc-200">A view's outcome is only knowable after paying.</span>{' '}
              Historically each 100 opens bought ~49 new candidates, ~26 people already in Salesforce, and
              ~25 with no reachable contact info.
            </li>
            <li>
              <span className="font-medium text-zinc-200">"Already viewed" doesn't carry over.</span>{' '}
              DJC only remembers a profile as viewed if its phone-reveal button was clicked, and that memory
              is wiped at every quota refill (~the 15th). Practically: never re-open a profile — the
              automation never does.
            </li>
            <li>
              <span className="font-medium text-zinc-200">Conserve mode (temporary, until Aug 15):</span>{' '}
              with views scarce, candidates whose full name already matches a Salesforce contact are set
              aside before paying. They're all listed in the "Conserve mode" section above with their
              matched contact — reviewable anytime, processable after the refill.
            </li>
            <li>
              <span className="font-medium text-zinc-200">Quota-blocked candidates aren't lost.</span>{' '}
              When views run out, newly found candidates are recorded and automatically eligible for
              processing once views return.
            </li>
            <li>
              <span className="font-medium text-zinc-200">The automation is one fixed "location."</span>{' '}
              DJC locks the shared account for a day when 3+ IP addresses log in; the automation always
              signs in from its dedicated proxy IP, leaving two slots for people. Please keep manual
              logins to one location per day.
            </li>
            <li>
              <span className="font-medium text-zinc-200">Amber "known for X%" badges</span> mark numbers
              still growing as data arrives; they disappear on their own at full coverage. Signup dates are
              ~91% complete (free, from list pages); years-of-experience only exists on paid profile opens,
              so its coverage grows only as views allow.
            </li>
          </ul>
        </Card>
      </section>
      )}

      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-5 right-5 z-30 rounded-full border border-zinc-700 bg-zinc-900/90 px-3 py-2 text-[11px] text-zinc-300 shadow-lg backdrop-blur transition-colors hover:text-white"
          aria-label="Back to top"
        >
          ↑ Top
        </button>
      )}

      <DrillPanel drill={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

function funnelDrill(key: string, label: string, periodStart: string | null): Drill {
  if (key === 'first_seen_since' && periodStart) return { dim: 'first_seen_since', value: periodStart, label }
  if (key.startsWith('opened:')) return { dim: 'opened_outcome', value: key.slice('opened:'.length), label }
  return { dim: 'funnel', value: key, label }
}

function perView(got: number, spent: number): string {
  if (!got || !spent) return ''
  return `≈ ${(spent / got).toFixed(1)} views each`
}

export function fmtDay(day: string): string {
  const d = new Date(day + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── drill slide-over ──────────────────────────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  phone: 'same phone number',
  email: 'same email',
  'name+link': 'same name + DJC link',
  link: 'same DJC profile link',
  sf_duplicate_rule: 'Salesforce duplicate rule',
}

/** SF org from the automation's config — Contact links open in Lightning. */
const SF_BASE = 'https://proxi.lightning.force.com/lightning/r/Contact'
const sfContactUrl = (id: string) => `${SF_BASE}/${id}/view`

function DrillPanel({ drill, onClose }: { drill: Drill | null; onClose: () => void }) {
  const [rows, setRows] = useState<DrillRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!drill) return
    let cancelled = false
    setLoading(true)
    setRows(null)
    fetch(`/api/djc/insights?dim=${encodeURIComponent(drill.dim)}&value=${encodeURIComponent(drill.value)}`)
      .then(r => r.json())
      .then(j => {
        if (!cancelled) setRows(j.rows ?? [])
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [drill])

  useEffect(() => {
    if (!drill) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [drill, onClose])

  if (!drill) return null

  const withReasons = (rows ?? []).filter(r => r.dedupStatus === 'duplicate' && r.dedupReason)
  const reasonCounts = withReasons.reduce<Record<string, number>>((acc, r) => {
    acc[r.dedupReason!] = (acc[r.dedupReason!] ?? 0) + 1
    return acc
  }, {})
  const showReasons = withReasons.length > 0

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-zinc-700/60 bg-zinc-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">{drill.label}</h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {loading
                ? 'Loading candidates…'
                : rows
                  ? `${rows.length}${rows.length === 100 ? '+ (first 100 shown)' : ''} candidate${rows.length === 1 ? '' : 's'} · click a row for its full process trail`
                  : ''}
            </p>
            {showReasons && (
              <div className="mt-2">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(reasonCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([reason, count]) => (
                      <span key={reason} className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-200">
                        {count} × {REASON_LABELS[reason] ?? reason}
                      </span>
                    ))}
                </div>
                <p className="mt-1.5 max-w-md text-[10px] leading-relaxed text-zinc-500">
                  Match rules, in order: same DJC profile link (checked before opening) · then, after
                  the profile is opened and contact revealed: same phone · same email · same last
                  name + DJC link · finally Salesforce&apos;s own duplicate rule on create.
                </p>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>
        <div className="grow overflow-y-auto px-5 pb-2">
          {rows && rows.length === 0 && !loading && <p className="py-6 text-xs text-zinc-500">No candidates match.</p>}
          {rows && rows.length > 0 && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-zinc-900">
                <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Specialty</th>
                  {showReasons ? (
                    <th className="py-2 pr-3 font-medium">Matched on</th>
                  ) : (
                    <th className="py-2 pr-3 font-medium">Location</th>
                  )}
                  <th className="py-2 pr-3 text-right font-medium">Registered</th>
                  <th className="py-2 pr-3 text-right font-medium">Active</th>
                  <th className="py-2 pr-3 text-right font-medium">Rating</th>
                  <th className="py-2 font-medium">In SF</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <DrillRowItem key={r.candidateId} row={r} showReason={showReasons} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </>
  )
}

function DrillRowItem({ row: r, showReason }: { row: DrillRow; showReason: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr
        onClick={() => setOpen(!open)}
        className={cn('cursor-pointer border-t border-zinc-800/70 text-zinc-300 hover:bg-zinc-800/40', open && 'bg-zinc-800/40')}
      >
        <td className="max-w-40 truncate py-2 pr-3">
          <span className={cn('mr-1.5 inline-block text-[9px] text-zinc-600 transition-transform', open && 'rotate-90')}>▶</span>
          {r.profileUrl ? (
            <a href={r.profileUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-cyan-300 hover:underline">
              {r.name ?? r.candidateId}
            </a>
          ) : (
            r.name ?? r.candidateId
          )}
        </td>
        <td className="max-w-32 truncate py-2 pr-3 text-zinc-400">{r.target ?? '—'}</td>
        {showReason ? (
          <td className="py-2 pr-3 text-violet-300">{r.dedupReason ? (REASON_LABELS[r.dedupReason] ?? r.dedupReason) : '—'}</td>
        ) : (
          <td className="max-w-32 truncate py-2 pr-3 text-zinc-400">{[r.city, r.state].filter(Boolean).join(', ') || '—'}</td>
        )}
        <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{r.registeredOn ?? '—'}</td>
        <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{r.lastActivity ?? '—'}</td>
        <td className="py-2 pr-3 text-right tabular-nums">{r.rating ?? '—'}</td>
        <td className="py-2">
          {r.sfContactId ? (
            <a
              href={sfContactUrl(r.sfContactId)}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="whitespace-nowrap text-emerald-400 hover:underline"
            >
              open ↗
            </a>
          ) : (
            <span className="text-zinc-600">no</span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-t border-zinc-800/40 bg-zinc-950/50">
          <td colSpan={7} className="px-2 py-3">
            <CandidateTrail candidateId={r.candidateId} />
          </td>
        </tr>
      )}
    </>
  )
}

/** Human labels for the pipeline's event types — the process trail shown per candidate. */
const EVENT_LABELS: Record<string, string> = {
  candidate_selected: 'Selected from the search list',
  profile_scraped: 'Profile opened & read',
  profile_view_quota_blocked: 'Blocked by the Profile Views quota',
  cv_downloaded: 'Resume downloaded',
  cv_missing: 'No resume on the profile',
  cv_parse_failed: 'Resume parse failed',
  contact_from_profile: 'Contact taken from the profile',
  contact_from_cv: 'Contact recovered from the resume',
  contact_from_profile_and_cv: 'Contact from profile + resume combined',
  candidate_uncontactable: 'No contact info anywhere → set aside',
  dedup_match: 'Matched an existing Salesforce contact',
  dedup_no_match: 'No Salesforce match → net new',
  dedup_query_failed: 'Salesforce dedup lookup failed',
  candidate_validation_warning: 'Data-quality note',
  contact_created: 'Created in Salesforce',
  contact_create_skipped_guard: 'Create skipped (writes were off)',
  contact_create_failed: 'Salesforce create failed',
  cv_uploaded: 'Resume attached to the Salesforce contact',
  match_validated: 'Post-create field check passed',
  match_validation_flagged: 'Post-create field check flagged',
  last_reviewed_failed: 'Last-reviewed stamp failed',
}

function CandidateTrail({ candidateId }: { candidateId: string }) {
  const [events, setEvents] = useState<{ at: string; type: string; level: string; message: string | null; payload: Record<string, unknown> | null }[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/djc/insights?candidate=${encodeURIComponent(candidateId)}`)
      .then(r => r.json())
      .then(j => {
        if (!cancelled) setEvents(j.events ?? [])
      })
      .catch(() => {
        if (!cancelled) setEvents([])
      })
    return () => {
      cancelled = true
    }
  }, [candidateId])

  if (!events) return <p className="px-3 text-[11px] text-zinc-500">Loading process trail…</p>
  if (!events.length) return <p className="px-3 text-[11px] text-zinc-500">No events recorded.</p>

  return (
    <ol className="space-y-1.5 px-3">
      {events.map((e, i) => {
        const p = e.payload ?? {}
        const detail =
          e.type === 'dedup_match'
            ? `${REASON_LABELS[String(p.reason)] ?? p.reason ?? ''}${p.sf_contact_id ? ' → ' : ''}`
            : e.type === 'cv_downloaded' && p.bytes
              ? `${Math.round(Number(p.bytes) / 1024)} KB`
              : e.type === 'dedup_no_match' && p.fetched !== undefined
                ? `${p.fetched} similar record${Number(p.fetched) === 1 ? '' : 's'} checked — none matched`
                : e.message && !EVENT_LABELS[e.type]
                  ? e.message
                  : ''
        return (
          <li key={i} className="flex items-baseline gap-2.5 text-[11px]">
            <span className="shrink-0 tabular-nums text-zinc-600">{e.at.slice(5)}</span>
            <span
              className={cn(
                'h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full',
                e.level === 'error' ? 'bg-red-400' : e.level === 'warn' ? 'bg-amber-400' : 'bg-cyan-600',
              )}
            />
            <span className="text-zinc-300">
              {EVENT_LABELS[e.type] ?? e.type.replaceAll('_', ' ')}
              {detail && <span className="text-zinc-500"> — {detail}</span>}
              {e.type === 'dedup_match' && typeof p.sf_contact_id === 'string' && p.sf_contact_id && (
                <a href={sfContactUrl(p.sf_contact_id)} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                  the matched contact ↗
                </a>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// ── building blocks ───────────────────────────────────────────────────────────────────────────

/** Subordinate divider inside a zone — segments card groups without competing with ZoneHeader. */
function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="pt-2">
      <div className="flex items-center gap-3">
        <h3 className="min-w-0 text-[13px] font-semibold uppercase tracking-wide text-zinc-300">{title}</h3>
        <div className="h-px min-w-6 grow bg-zinc-800" />
      </div>
      {sub && <p className="mt-1 text-[11px] text-zinc-500">{sub}</p>}
    </div>
  )
}

function ZoneHeader({
  title, description, filter,
}: {
  title: string
  description?: string
  filter?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-3xl">
        <h2 className="text-[15px] font-semibold text-zinc-100">{title}</h2>
        {description && <p className="mt-1 text-xs leading-relaxed text-zinc-500">{description}</p>}
      </div>
      {filter}
    </div>
  )
}

function PeriodFilter({ period }: { period: DjcInsights['period'] }) {
  const opt = (active: boolean) =>
    cn(
      'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
      active ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300',
    )
  return (
    <div className="inline-flex shrink-0 rounded-lg border border-zinc-700/50 bg-zinc-800/40 p-0.5">
      <Link href="/djc/acquisition?period=quarter" className={opt(period === 'quarter')}>
        This quarter
      </Link>
      <Link href="/djc/acquisition?period=all" className={opt(period === 'all')}>
        All time
      </Link>
    </div>
  )
}

export function Card({
  title, sub, tag, id, children,
}: {
  title?: string
  sub?: string
  tag?: React.ReactNode
  id?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="min-w-0 scroll-mt-16 rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-5">
      {title && (
        <div className="mb-4">
          <h3 className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-zinc-100">
            {title}
            {tag}
          </h3>
          {sub && <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{sub}</p>}
        </div>
      )}
      {children}
    </section>
  )
}

/** Marks a metric whose numbers will improve as more data arrives (backfill or daily tracking).
 *  Rendered from live coverage, so it disappears by itself once the data is complete. */
export function GrowingTag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-300/90"
      title="This metric is still filling in — numbers will grow as more data is collected. Nothing is wrong; coverage just isn't complete yet."
    >
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
        <circle cx="4" cy="4" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4 4 L4 0.8 A3.2 3.2 0 0 1 7.2 4 Z" fill="currentColor" />
      </svg>
      {children}
    </span>
  )
}

export function BigStat({
  value, label, detail, accent, onClick,
}: {
  value: number
  label: string
  detail?: string
  accent?: string
  onClick?: () => void
}) {
  const inner = (
    <>
      <div className={cn('text-2xl font-semibold leading-none tabular-nums', accent ?? 'text-zinc-100')}>
        {value.toLocaleString()}
      </div>
      <div className="mt-1.5 text-[11px] font-medium text-zinc-300">{label}</div>
      {detail && <div className="mt-0.5 text-[10px] leading-snug text-zinc-500">{detail}</div>}
    </>
  )
  const base = 'rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-4 text-left'
  return onClick ? (
    <button onClick={onClick} className={cn(base, 'transition-colors hover:border-zinc-600 hover:bg-zinc-800/60')}>
      {inner}
    </button>
  ) : (
    <div className={base}>{inner}</div>
  )
}

export function SmallLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[10px] uppercase tracking-wide text-zinc-500">{children}</p>
}

export function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-[2px]" style={{ background: color }} />
      {label}
    </span>
  )
}

export function BarList({
  items, total, relative = false, extra, onClick, maxVisible,
}: {
  items: (InsightBucket & { color: string })[]
  total: number
  /** relative: bar widths scale to the largest item instead of the sum (distribution look). */
  relative?: boolean
  extra?: string[]
  onClick?: (b: InsightBucket) => void
  /** Show only the top N rows with a "show all" toggle — long lists stay scannable. */
  maxVisible?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const denom = relative ? Math.max(...items.map(i => i.count), 1) : Math.max(total, 1)
  const visible = maxVisible && !expanded ? items.slice(0, maxVisible) : items
  return (
    <div className="space-y-2">
      {visible.map((b, i) => (
        <button
          key={b.key}
          onClick={onClick ? () => onClick(b) : undefined}
          disabled={!onClick}
          className={cn('group flex w-full items-center gap-3 text-left', onClick && 'cursor-pointer')}
        >
          <span className="w-44 shrink-0 truncate text-xs text-zinc-400 group-hover:text-zinc-200">{b.label}</span>
          <div className="h-2.5 grow rounded-sm bg-zinc-800">
            <div
              className="h-2.5 rounded-sm transition-all group-hover:brightness-125"
              style={{ width: `${Math.max((b.count / denom) * 100, b.count > 0 ? 1.5 : 0)}%`, background: b.color }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-xs tabular-nums text-zinc-300">
            {b.count.toLocaleString()}
          </span>
          {extra && <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-zinc-500">{extra[i]}</span>}
        </button>
      ))}
      {maxVisible && items.length > maxVisible && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
        >
          {expanded ? '▴ show top ' + maxVisible : `▾ show all ${items.length}`}
        </button>
      )}
    </div>
  )
}

/** One-line segmented composition bar with an inline legend — for reading a whole split at a
 *  glance (career stages, training origin) instead of scanning row lists. */
export function SegmentBar({
  segments, onClick,
}: {
  segments: { key: string; label: string; count: number; color: string }[]
  onClick?: (key: string) => void
}) {
  const total = Math.max(segments.reduce((a, s) => a + s.count, 0), 1)
  return (
    <div>
      <div className="flex h-5 w-full gap-0.5 overflow-hidden rounded-md">
        {segments.filter(s => s.count > 0).map(s => (
          <button
            key={s.key}
            onClick={onClick ? () => onClick(s.key) : undefined}
            className="transition-all hover:brightness-125"
            style={{ width: `${(s.count / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${s.count.toLocaleString()} (${Math.round((s.count / total) * 100)}%)`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map(s => (
          <button
            key={s.key}
            onClick={onClick ? () => onClick(s.key) : undefined}
            className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 transition-colors hover:text-zinc-200"
          >
            <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
            {s.label} <span className="tabular-nums text-zinc-500">{s.count.toLocaleString()} · {Math.round((s.count / total) * 100)}%</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function PairedBars({
  a, b, colorA, colorB, onClick,
}: {
  a: InsightBucket[]
  b: InsightBucket[]
  colorA: string
  colorB: string
  onClick?: (bucket: InsightBucket) => void
}) {
  const denom = Math.max(...a.map(x => x.count), 1)
  const bByKey = new Map(b.map(x => [x.key, x.count]))
  return (
    <div className="space-y-2.5">
      {a.map(bucket => {
        const bCount = bByKey.get(bucket.key) ?? 0
        return (
          <button key={bucket.key} onClick={onClick ? () => onClick(bucket) : undefined} className="group block w-full text-left">
            <div className="flex items-center gap-3">
              <span className="w-36 shrink-0 truncate text-xs text-zinc-400 group-hover:text-zinc-200">{bucket.label}</span>
              <div className="grow space-y-1">
                <div className="h-2 rounded-sm bg-zinc-800">
                  <div className="h-2 rounded-sm" style={{ width: `${(bucket.count / denom) * 100}%`, background: colorA }} />
                </div>
                <div className="h-2 rounded-sm bg-zinc-800">
                  <div className="h-2 rounded-sm" style={{ width: `${(bCount / denom) * 100}%`, background: colorB }} />
                </div>
              </div>
              <span className="w-20 shrink-0 text-right text-xs tabular-nums text-zinc-300">
                {bucket.count.toLocaleString()}
                <span className="text-zinc-600"> / {bCount.toLocaleString()}</span>
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function YearBars({
  cohorts, onClick,
}: {
  cohorts: { cohort: string; total: number; activeLast90: number }[]
  onClick?: (c: { cohort: string }) => void
}) {
  // Fill missing years so the time axis is honest (a gap year renders as an empty slot).
  const years: { cohort: string; total: number; activeLast90: number }[] = []
  const first = Number(cohorts[0].cohort)
  const last = Number(cohorts[cohorts.length - 1].cohort)
  const byYear = new Map(cohorts.map(c => [c.cohort, c]))
  for (let y = first; y <= last; y++) {
    years.push(byYear.get(String(y)) ?? { cohort: String(y), total: 0, activeLast90: 0 })
  }
  const max = Math.max(...years.map(c => c.total), 1)
  const BAR_AREA = 120
  return (
    <div className="overflow-x-auto">
    <div className="flex min-w-[480px] items-end gap-1" style={{ height: BAR_AREA + 40 }}>
      {years.map(c => (
        <button
          key={c.cohort}
          onClick={onClick && c.total > 0 ? () => onClick(c) : undefined}
          disabled={c.total === 0}
          className="group flex h-full flex-1 flex-col justify-end"
          title={`${c.cohort}: ${c.total} signups · ${c.activeLast90} still active in the last 90 days`}
        >
          <span
            className={cn(
              'mb-1 block text-center text-[9px] tabular-nums leading-none',
              c.total === 0 ? 'text-transparent' : 'text-zinc-400 group-hover:text-zinc-200',
            )}
          >
            {c.total || '·'}
          </span>
          <div
            className="relative w-full rounded-t-sm transition-all group-hover:brightness-125"
            style={{
              height: `${Math.max((c.total / max) * BAR_AREA, c.total > 0 ? 3 : 1)}px`,
              background: c.total > 0 ? `${C.cyan}45` : '#27272a',
            }}
          >
            <div
              className="absolute bottom-0 w-full rounded-t-sm"
              style={{ height: `${c.total ? (c.activeLast90 / c.total) * 100 : 0}%`, background: C.cyan }}
            />
          </div>
          <span className="mt-1.5 block text-center text-[9px] leading-tight text-zinc-500 group-hover:text-zinc-300">
            {Number(c.cohort) % 2 === 0 || years.length <= 12 ? c.cohort : ''}
          </span>
        </button>
      ))}
    </div>
    </div>
  )
}

function ViewsChart({ days }: { days: { day: string; used: number; total: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  if (!days.length) return null
  const latest = days[days.length - 1]
  const total = latest.total || 1
  const W = 560
  const H = 120
  const x = (i: number) => (days.length > 1 ? (i / (days.length - 1)) * W : 0)
  const y = (used: number) => H - (used / total) * H
  const line = days.map((d, i) => `${x(i)},${y(d.used)}`).join(' ')
  const h = hover !== null ? days[hover] : null

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-4 text-xs text-zinc-400">
        <span>
          <span className="text-lg font-semibold tabular-nums text-cyan-300">{(latest.total - latest.used).toLocaleString()}</span>{' '}
          views left
        </span>
        <span className="text-zinc-500">
          {latest.used.toLocaleString()} of {latest.total.toLocaleString()} used
        </span>
        {h && (
          <span className="ml-auto tabular-nums text-zinc-400">
            {fmtDay(h.day)}: {h.used} used
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-28 w-full"
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
      >
        <line x1={0} y1={0} x2={W} y2={0} stroke="#3f3f46" strokeWidth={1} strokeDasharray="3 4" />
        <polygon points={`0,${H} ${line} ${W},${H}`} fill={`${C.cyan}22`} />
        <polyline points={line} fill="none" stroke={C.cyan} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {days.map((d, i) => (
          <rect
            key={d.day}
            x={x(i) - W / Math.max(days.length - 1, 1) / 2}
            y={0}
            width={W / Math.max(days.length - 1, 1)}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {h && <circle cx={x(hover!)} cy={y(h.used)} r={4} fill={C.cyan} stroke="#0e0e12" strokeWidth={2} />}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
        <span>{fmtDay(days[0].day)}</span>
        <span>dashed line = quarterly allowance ({total.toLocaleString()})</span>
        <span>{fmtDay(latest.day)}</span>
      </div>
    </div>
  )
}
