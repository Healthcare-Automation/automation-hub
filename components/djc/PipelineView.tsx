'use client'

import { useState } from 'react'

import { Card, BarList, SmallLabel } from '@/components/DjcInsightsPanel'
import { PIPELINE_RANGES, type PipelineRange } from '@/lib/djcTypes'
import type { DjcPipelineData, SpecialtyOutcomesByRange } from '@/lib/djcPipeline'
import { ForestPlot } from '@/components/djc/science'
import {
  APPLIED_FACTORS, PLACED_FACTORS, SCIENCE_META, STAGE_VELOCITY, TIME_TO_PLACE,
  SPECIALTY_OUTCOMES, SIGNUP_TO_PLACEMENT, placementProbability,
} from '@/lib/djcScience'

const CYAN = '#0891b2'
const EMERALD = '#059669'
const AMBER = '#d97706'

/** What happens AFTER a candidate lands in Salesforce: stages, placements, momentum, and the
 *  stall points. Mirrored from Salesforce after every hourly run. */
export default function PipelineView({
  data, funnel, range = 'all', outcomes = null,
}: {
  data: DjcPipelineData
  funnel?: { label: string; count: number }[] | null
  range?: PipelineRange
  outcomes?: SpecialtyOutcomesByRange | null
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const stalePct = data.staleContacts.total
    ? Math.round((data.staleContacts.neverApplied / data.staleContacts.total) * 100)
    : 0
  return (
    <div className="space-y-8">
      {/* States the tab's job outright: the Overview answers "how are we doing", this answers
          "why", and without a header saying so it reads as a second Overview. */}
      <header className="max-w-3xl">
        <h1 className="text-[20px] font-semibold text-zinc-900 dark:text-zinc-100">Why candidates do or don&rsquo;t get placed</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          The Overview shows what happened. This is the mechanism underneath it — which candidates
          recruiters work, what actually predicts a hire, what is moving right now, and how long the
          pool takes to convert.
        </p>
      </header>

      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={data.automationEra.applications} label="applications from automation-sourced candidates" accent="text-emerald-700 dark:text-emerald-300" />
        <Stat value={data.automationEra.placedOrExtended} label="of them already placed or extended" accent="text-cyan-700 dark:text-cyan-300" />
        <Stat value={`${data.repeatPlacements.people}`} label="professionals placed more than once" detail={`${data.repeatPlacements.placements} repeat placements — placed people get re-placed`} />
        <Stat value={`${stalePct}%`} label="of Salesforce candidates never got an application" detail={`${data.staleContacts.neverApplied.toLocaleString()} of ${data.staleContacts.total.toLocaleString()} — the funnel's biggest opportunity`} accent="text-amber-700 dark:text-amber-300" />
      </div>

      {/* The actual pipeline */}
      {/* Removed: the Overview owns the funnel. This tab is the application-level detail behind it,
            not a second copy of the same chart. */}

      {/* Placements momentum */}
      {/* Removed: placements by quarter live on the Overview, which compares them year-on-year. */}

      {/* Candidates x outcomes */}
      <Card
        title="Which specialties recruiters actually work"
        sub="The wide bar is how many a recruiter works; the bright bar inside it is how many get placed. Placed people are a subset of worked people, so the bars nest and read straight across."
      >
        <SpecialtyOutcomes outcomes={outcomes} />
      </Card>

      <Card
        title="The database flywheel"
        sub="Placements don't come from fresh signups — they come from the accumulated pool."
      >
        <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          Among placed candidates with a known DJC signup date (n={SIGNUP_TO_PLACEMENT.n}), the median gap
          from <span className="text-zinc-900 dark:text-zinc-100">signing up on DJC to first placement is {Math.round(SIGNUP_TO_PLACEMENT.medianDays / 365 * 10) / 10} years</span>.
          Only {SIGNUP_TO_PLACEMENT.within90d} placed within 90 days of joining; {SIGNUP_TO_PLACEMENT.within1y} within a year.
          The candidate database is a compounding asset — every profile captured today is inventory for the
          next several years, which is exactly what the automation builds every hour.
        </p>
      </Card>

      {/* What predicts a hire */}
      <Card
        title="What actually leads to a hire — the evidence"
        sub="Which candidate traits actually move the odds of being worked, and then placed."
        action={
          <button
            onClick={() => setEvidenceOpen(v => !v)}
            className="rounded-md border border-zinc-200 bg-white dark:border-zinc-700/60 dark:bg-zinc-800/40 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 transition-colors hover:text-zinc-900 dark:hover:text-zinc-200"
          >
            {evidenceOpen ? 'Hide' : 'Show'}
          </button>
        }
      >
        {!evidenceOpen ? (
          <p className="text-[12px] leading-relaxed text-zinc-500">
            {SCIENCE_META.universe.toLocaleString()} linked candidates · {SCIENCE_META.applied} worked
            by recruiters · {SCIENCE_META.placed} placed. Strongest signals:{' '}
            <span className="text-emerald-700 dark:text-emerald-300">General Dentistry</span>,{' '}
            <span className="text-emerald-700 dark:text-emerald-300">open to locums</span> and{' '}
            <span className="text-emerald-700 dark:text-emerald-300">10+ years&rsquo; experience</span> all raise the odds
            of being worked; <span className="text-amber-700 dark:text-amber-300">hygienists and assistants</span> are
            far less likely to be. Open for the full analysis and its caveats.
          </p>
        ) : (
        <>
        <div className="mb-5 rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700/40 dark:bg-zinc-900/40 p-4 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          <p className="mb-1.5 font-medium text-zinc-700 dark:text-zinc-300">How to read this, and how it was computed</p>
          <p>
            Each row is an <span className="text-zinc-700 dark:text-zinc-300">odds ratio</span> with a 95% confidence
            interval. A dot to the right of the dashed line means the trait makes the outcome more
            likely; whiskers crossing the line mean no detectable effect. ✓ marks p&lt;0.05.
          </p>
          <p className="mt-1.5">
            <span className="text-zinc-700 dark:text-zinc-300">Complete-case per trait.</span> A candidate only enters a
            comparison when that trait is actually known for them — several are parsed from résumés
            and known for half the pool. Counting “unknown” as “doesn’t have it” compares different
            populations, and did previously reverse the sign on experience.
          </p>
          <p className="mt-1.5">
            <span className="text-zinc-700 dark:text-zinc-300">Traits deliberately excluded.</span> Job availability
            nearby looked like a strong negative, but 99% of the candidates it is known for were
            added by the automation, and those are worked 4% of the time versus 21% for everyone
            else — it measured how someone was sourced, not their prospects.
          </p>
          <p className="mt-1.5 text-zinc-500">
            Associations, not causation. Univariate, so traits that travel together are not separated
            — specialty and role overlap in particular. Computed {SCIENCE_META.computedOn}.
          </p>
        </div>
        <div className="space-y-6">
          <div>
            <SmallLabel>Stage 1 — who gets recruiter attention (≥1 application)</SmallLabel>
            <ForestPlot factors={APPLIED_FACTORS} />
          </div>
          <div>
            <SmallLabel>Stage 2 — who converts to a placement, once worked</SmallLabel>
            <ForestPlot factors={PLACED_FACTORS} />
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700/40 dark:bg-zinc-900/40 p-4 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            <p className="mb-1.5 font-semibold text-zinc-800 dark:text-zinc-200">What the evidence says, in one breath:</p>
            <p>
              <span className="text-zinc-800 dark:text-zinc-200">Specialty demand drives everything</span> — General Dentists are 3.3× more
              likely to get worked and 3.8× more likely to place once worked.{' '}
              <span className="text-zinc-800 dark:text-zinc-200">Experience gets attention but doesn&apos;t close</span> — 10+ years doubles the
              odds of being worked, yet shows no effect on placing afterward; recruiters may be over-selecting on it.{' '}
              <span className="text-zinc-800 dark:text-zinc-200">Hygienists and assistants are the untapped pool</span> — only 3% ever get an
              application versus 21% of everyone else. Credentials (residency, US training, languages) show no detectable
              effect at current sample sizes.
            </p>
          </div>
        </div>
        </>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Placements per year */}
        {/* Removed: same series as the Overview's placement chart, one aggregation coarser. */}

        {/* Recent placements */}
        <Card
          title="Recent placements"
          sub="⚡ = sourced by the automation. Almost none carry it yet: people placed now typically joined Salesforce ~255 days ago, long before the automation existed."
        >
          <div className="max-h-72 overflow-y-auto overflow-x-auto">
            <table className="w-full min-w-[460px] text-xs">
              <thead className="sticky top-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur">
                <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
                  <th className="py-1.5 pr-3 font-medium">Person</th>
                  <th className="py-1.5 pr-3 font-medium">Job</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Added to Salesforce</th>
                  <th className="py-1.5 text-right font-medium">Placed</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPlacements.map((p, i) => (
                  <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800/70 text-zinc-700 dark:text-zinc-300 first:border-t-0">
                    <td className="whitespace-nowrap py-2 pr-3 font-medium">
                      {p.automationEra && <span title="automation-sourced">⚡ </span>}
                      {p.person ?? '—'}
                    </td>
                    <td className="max-w-56 truncate py-2 pr-3 text-zinc-500">{p.job ?? '—'}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-zinc-500">
                      {p.sfAddedOn ?? '—'}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{p.placedOn ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* In flight now */}
      <Card
        title="In flight right now"
        sub="Applications currently moving through review, submittal, interview, or offer. ⚡ = automation-sourced."
      >
        <div className="max-h-96 overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-[600px] text-xs">
            <thead className="sticky top-0 bg-white dark:bg-zinc-900">
              <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
                <th className="py-1.5 pr-3 font-medium">Candidate</th>
                <th className="py-1.5 pr-3 font-medium">Job</th>
                <th className="py-1.5 pr-3 font-medium">Stage</th>
                <th className="py-1.5 pr-3 text-right font-medium"
                    title="Chance THIS APPLICATION ends in a placement, from the stage it has reached. Different from the candidate score on the Candidates tab, which predicts whether a person gets worked at all.">
                  Chance of placing
                </th>
                <th className="py-1.5 pr-3 text-right font-medium">Added to SF</th>
                <th className="py-1.5 text-right font-medium">Since</th>
              </tr>
            </thead>
            <tbody>
              {data.inFlight.map((f, i) => (
                <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800/70 text-zinc-700 dark:text-zinc-300">
                  <td className="whitespace-nowrap py-2 pr-3 font-medium">
                    {f.automationEra && <span title="automation-sourced">⚡ </span>}
                    {f.person ?? '—'}
                  </td>
                  <td className="max-w-64 truncate py-2 pr-3 text-zinc-500">{f.job ?? '—'}</td>
                  <td className="py-2 pr-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px]"
                      style={{
                        background: f.stage === 'Offer' ? `${EMERALD}22` : f.stage === 'Interview' ? `${CYAN}22` : `${AMBER}18`,
                        color: f.stage === 'Offer' ? '#6ee7b7' : f.stage === 'Interview' ? '#67e8f9' : '#fcd34d',
                      }}
                    >
                      {f.stage}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right">
                    <Probability stage={f.stage} specialty={f.specialty} />
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-zinc-500">{f.sfAddedOn ?? '—'}</td>
                  <td className="whitespace-nowrap py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{f.since ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

    </div>
  )
}

/** Historical placement probability for an in-flight application, with the full reasoning in
 *  the tooltip. Estimates from measured base rates + the one statistically significant candidate
 *  factor — never presented as a promise. */
function Probability({ stage, specialty }: { stage: string | null; specialty: string | null }) {
  const isGD = specialty === null ? null : specialty === 'General Dentistry'
  const est = placementProbability(stage, isGD)
  if (!est) return <span className="text-zinc-500 dark:text-zinc-600">—</span>
  const pct = Math.round(est.p * 100)
  const color = pct >= 60 ? '#6ee7b7' : pct >= 30 ? '#67e8f9' : '#a1a1aa'
  const parts = [
    `Historical estimate — not a guarantee.`,
    `Base: ${Math.round(est.base * 100)}% of the ${est.baseN.toLocaleString()} applications that reached ${stage} eventually placed.`,
    est.tilt === 'up'
      ? `Specialty: General Dentistry converts at 3.8× odds (statistically significant) → adjusted up to ${pct}%.`
      : est.tilt === 'down'
        ? `Specialty: non-GD specialties convert at significantly lower odds → adjusted down to ${pct}%.`
        : `Specialty unknown (not in our candidate data) → base rate used.`,
  ]
  return (
    <span className="cursor-help font-semibold tabular-nums" style={{ color }} title={parts.join('\n')}>
      {pct}%
    </span>
  )
}

function Stat({
  value, label, detail, accent,
}: {
  value: number | string
  label: string
  detail?: string
  accent?: string
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700/50 dark:bg-zinc-800/30 dark:shadow-none p-5">
      <div className={`text-3xl font-semibold leading-none tabular-nums ${accent ?? 'text-zinc-900 dark:text-zinc-100'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="mt-2 text-xs font-medium text-zinc-800 dark:text-zinc-200">{label}</div>
      {detail && <div className="mt-1 text-[11px] leading-snug text-zinc-500">{detail}</div>}
    </div>
  )
}

/**
 * Specialty outcomes as nested bars on a single denominator.
 *
 * Replaces a dumbbell plot that put "share of all candidates" and "share of the worked subset" on
 * one axis. Non-technical readers reasonably read two dots on a shared line as a before/after, and
 * the second dot sometimes sat further right, which made the chart look broken. Nesting placed
 * inside worked inside the full cohort matches how people already picture a pipeline.
 *
 * The unit changes with the window on purpose. Over all time, rates ("23 in every 100") are what
 * make specialties comparable. Over 7 days the whole business places about 5 people, so a rate
 * rounds to 0 everywhere and the chart goes blank — there, real headcount is the honest unit.
 */
function SpecialtyOutcomes({ outcomes }: { outcomes: SpecialtyOutcomesByRange | null }) {
  const [win, setWin] = useState<PipelineRange>('all')
  const [hover, setHover] = useState<string | null>(null)

  // Falls back to the built-in snapshot if the live query failed, so the card still renders.
  const source = outcomes?.[win] ?? (win === 'all' ? SPECIALTY_OUTCOMES : null)
  const asRate = win === 'all'

  const rows = (source ?? [])
    .map(s => ({
      ...s,
      workedPct: (s.worked / s.n) * 100,
      placedPct: (s.placed / s.n) * 100,
    }))
    .sort((a, b) =>
      asRate ? b.placedPct - a.placedPct || b.workedPct - a.workedPct
             : b.placed - a.placed || b.worked - a.worked)

  const max = Math.max(...rows.map(r => (asRate ? r.workedPct : r.worked)), 1)
  const w = (v: number) => `${Math.min((v / max) * 100, 100)}%`
  const totals = rows.reduce((a, r) => ({ w: a.w + r.worked, p: a.p + r.placed }), { w: 0, p: 0 })

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-zinc-500">
          {asRate
            ? 'Out of every 100 candidates we hold in each specialty.'
            : `Recruiter activity in the last ${win === '7d' ? '7 days' : '30 days'} — actual people.`}
        </p>
        <span className="inline-flex rounded-lg border border-zinc-200 bg-zinc-900/[0.04] dark:border-zinc-700/60 dark:bg-zinc-800/40 p-0.5">
          {PIPELINE_RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setWin(r.key)}
              className={
                'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ' +
                (win === r.key
                  ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-white/10 dark:text-zinc-100 dark:shadow-none dark:ring-white/15'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300')
              }
            >
              {r.label}
            </button>
          ))}
        </span>
      </div>

      {source === null ? (
        <p className="py-6 text-center text-[12px] text-amber-700 dark:text-amber-300/80">
          Couldn&rsquo;t load this window. Try all time.
        </p>
      ) : totals.w === 0 ? (
        <p className="py-6 text-center text-[12px] text-zinc-500">
          No recruiter activity on any DJC-sourced candidate in this window.
        </p>
      ) : (
        <div className="space-y-1">
          {rows.map(s => {
            const small = s.n < 50
            const on = hover === s.specialty
            const workedVal = asRate ? Math.round(s.workedPct) : s.worked
            const placedVal = asRate ? Math.round(s.placedPct) : s.placed
            return (
              <div
                key={s.specialty}
                onMouseEnter={() => setHover(s.specialty)}
                onMouseLeave={() => setHover(null)}
                className={`flex items-center gap-3 rounded-md px-2 py-2 transition-colors ${on ? 'bg-zinc-100 dark:bg-zinc-800/40' : ''}`}
              >
                <span className="w-44 shrink-0 truncate text-xs text-zinc-700 dark:text-zinc-300">
                  {s.specialty}
                  {small && (
                    <span className="ml-1.5 text-[10px] text-amber-500/70"
                          title="Fewer than 50 candidates — treat as directional only">few</span>
                  )}
                </span>

                <div className="relative h-7 grow rounded bg-zinc-200/70 dark:bg-zinc-800/30">
                  <div className="absolute inset-y-0 left-0 rounded bg-cyan-500/25 transition-all duration-300"
                       style={{ width: w(asRate ? s.workedPct : s.worked) }} />
                  <div className="absolute inset-y-0 left-0 rounded bg-emerald-400/85 transition-all duration-300"
                       style={{ width: w(asRate ? s.placedPct : s.placed) }} />
                  <div className="absolute inset-y-0 left-0 flex items-center gap-1.5 pl-2 text-[11px] font-medium tabular-nums">
                    {placedVal > 0 && (
                      <>
                        <span className={(asRate ? s.placedPct > 3 : s.placed / max > 0.12)
                          ? 'text-emerald-950' : 'text-emerald-700 dark:text-emerald-300'}>
                          {placedVal} placed
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-600">·</span>
                      </>
                    )}
                    <span className="text-cyan-800 dark:text-cyan-200/90">
                      {workedVal} worked{placedVal === 0 && workedVal > 0 ? ' · none placed' : ''}
                    </span>
                  </div>
                </div>

                <span className="w-40 shrink-0 text-right text-[11px] tabular-nums text-zinc-500">
                  {on && asRate
                    ? `${s.placed} of ${s.worked} worked`
                    : `out of ${s.n.toLocaleString()} sourced`}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-zinc-200 dark:border-zinc-800/70 pt-3 text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-cyan-500/25" /> a recruiter worked them
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-emerald-400/85" /> they got placed
        </span>
        <span className="text-zinc-500 dark:text-zinc-600">
          {asRate ? 'per 100 sourced · hover a row for real numbers' : `${totals.w} worked, ${totals.p} placed in this window`}
        </span>
      </div>

      {asRate && (
        <p className="mt-3 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          General Dentistry is the engine: 23 of every 100 get worked and 5 get placed. Dental
          Hygienists are the opposite — 103 sourced,{' '}
          <span className="text-amber-700 dark:text-amber-300">1 worked, none placed</span>. We are collecting people
          nobody is working.
        </p>
      )}
    </div>
  )
}
