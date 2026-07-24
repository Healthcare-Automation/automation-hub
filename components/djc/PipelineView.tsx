'use client'

import { Card, BarList, SmallLabel } from '@/components/DjcInsightsPanel'
import type { DjcPipelineData } from '@/lib/djcPipeline'
import { FunnelCascade, ForestPlot, QuarterlyTrend } from '@/components/djc/science'
import {
  APPLIED_FACTORS, PLACED_FACTORS, SCIENCE_META, STAGE_VELOCITY, TIME_TO_PLACE,
  SPECIALTY_OUTCOMES, SIGNUP_TO_PLACEMENT, placementProbability,
} from '@/lib/djcScience'

const CYAN = '#0891b2'
const EMERALD = '#059669'
const AMBER = '#d97706'

/** What happens AFTER a candidate lands in Salesforce: stages, placements, momentum, and the
 *  stall points. Mirrored from Salesforce after every hourly run. */
export default function PipelineView({ data }: { data: DjcPipelineData }) {
  const stalePct = data.staleContacts.total
    ? Math.round((data.staleContacts.neverApplied / data.staleContacts.total) * 100)
    : 0
  const maxStage = Math.max(...data.stages.map(s => s.count), 1)
  return (
    <div className="space-y-8">
      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={data.automationEra.applications} label="applications from automation-sourced candidates" accent="text-emerald-300" />
        <Stat value={data.automationEra.placedOrExtended} label="of them already placed or extended" accent="text-cyan-300" />
        <Stat value={`${data.repeatPlacements.people}`} label="professionals placed more than once" detail={`${data.repeatPlacements.placements} repeat placements — placed people get re-placed`} />
        <Stat value={`${stalePct}%`} label="of Salesforce candidates never got an application" detail={`${data.staleContacts.neverApplied.toLocaleString()} of ${data.staleContacts.total.toLocaleString()} — the funnel's biggest opportunity`} accent="text-amber-300" />
      </div>

      {/* The actual pipeline */}
      <Card
        title="The pipeline — every application's journey"
        sub="Applications that reached each dated stage, conversion between stages, and the median days per hop. Placed can exceed Offer because recruiters often skip stages in data entry — percentages are only shown where the math is clean. Hover a stage to trace its flow."
      >
        <FunnelCascade
          stages={data.reached}
          medianDays={[null, STAGE_VELOCITY.submittalToInterview, STAGE_VELOCITY.interviewToOffer, STAGE_VELOCITY.offerToPlaced]}
        />
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          Once an application is placed, the median journey took just{' '}
          <span className="font-medium text-zinc-300">{STAGE_VELOCITY.applicationToPlaced.median} days</span>{' '}
          (middle half: {STAGE_VELOCITY.applicationToPlaced.p25}–{STAGE_VELOCITY.applicationToPlaced.p75} days) —{' '}
          {TIME_TO_PLACE[0].count} of {TIME_TO_PLACE.reduce((a, t) => a + t.count, 0)} placements landed within 30 days
          of the application. Speed of recruiter follow-up is everything.
        </p>
      </Card>

      {/* Placements momentum */}
      <Card
        title="Placement momentum — quarterly"
        sub="DJC-sourced placements per quarter — 2026 Q2 set the all-time record (72). The final point is the current quarter in progress, not a decline."
      >
        <QuarterlyTrend series={data.quarterly} />
      </Card>

      {/* Candidates x outcomes */}
      <Card
        title="Attention vs conversion, by specialty"
        sub="For each specialty: how often recruiters work the candidates (cyan) and how often worked candidates place (emerald). Gaps between the dots are the strategy map — high conversion + low attention = untapped."
      >
        <div className="space-y-3">
          {SPECIALTY_OUTCOMES.map(sp => (
            <div key={sp.specialty} className="flex items-center gap-3">
              <span className="w-44 shrink-0 truncate text-xs text-zinc-400">{sp.specialty}
                <span className="ml-1 text-[10px] text-zinc-600">n={sp.n}</span>
              </span>
              <div className="relative h-6 grow">
                <div className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-zinc-800" />
                <div
                  className="absolute top-1/2 h-px -translate-y-1/2 bg-zinc-600"
                  style={{ left: `${Math.min(sp.workedPct, sp.placedOfWorkedPct) * 2.2}%`, width: `${Math.abs(sp.workedPct - sp.placedOfWorkedPct) * 2.2}%` }}
                />
                <span className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full" title={`${sp.workedPct}% worked by recruiters`}
                  style={{ left: `calc(${sp.workedPct * 2.2}% - 6px)`, background: '#0891b2' }} />
                <span className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full" title={`${sp.placedOfWorkedPct}% of worked candidates placed`}
                  style={{ left: `calc(${sp.placedOfWorkedPct * 2.2}% - 6px)`, background: '#059669' }} />
              </div>
              <span className="w-28 shrink-0 text-right text-[11px] tabular-nums text-zinc-400">
                {sp.workedPct}% → {sp.placedOfWorkedPct}%
              </span>
            </div>
          ))}
          <div className="flex gap-4 pt-1 text-[10px] text-zinc-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: '#0891b2' }} /> % worked by recruiters</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: '#059669' }} /> % of worked who placed</span>
          </div>
        </div>
      </Card>

      <Card
        title="The database flywheel"
        sub="Placements don't come from fresh signups — they come from the accumulated pool."
      >
        <p className="text-sm leading-relaxed text-zinc-300">
          Among placed candidates with a known DJC signup date (n={SIGNUP_TO_PLACEMENT.n}), the median gap
          from <span className="text-zinc-100">signing up on DJC to first placement is {Math.round(SIGNUP_TO_PLACEMENT.medianDays / 365 * 10) / 10} years</span>.
          Only {SIGNUP_TO_PLACEMENT.within90d} placed within 90 days of joining; {SIGNUP_TO_PLACEMENT.within1y} within a year.
          The candidate database is a compounding asset — every profile captured today is inventory for the
          next several years, which is exactly what the automation builds every hour.
        </p>
      </Card>

      {/* What predicts a hire */}
      <Card
        title="What actually leads to a hire — the evidence"
        sub={`Odds ratios with 95% confidence intervals over ${SCIENCE_META.universe.toLocaleString()} linked candidates (${SCIENCE_META.applied} worked by recruiters, ${SCIENCE_META.placed} placed). A dot right of the dashed line = the trait makes the outcome more likely; whiskers crossing the line = no detectable effect. ✓ = statistically significant (p<0.05). Associations, not causation — computed ${SCIENCE_META.computedOn}.`}
      >
        <div className="space-y-6">
          <div>
            <SmallLabel>Stage 1 — who gets recruiter attention (≥1 application)</SmallLabel>
            <ForestPlot factors={APPLIED_FACTORS} />
          </div>
          <div>
            <SmallLabel>Stage 2 — who converts to a placement, once worked</SmallLabel>
            <ForestPlot factors={PLACED_FACTORS} />
          </div>
          <div className="rounded-lg border border-zinc-700/40 bg-zinc-900/40 p-4 text-xs leading-relaxed text-zinc-400">
            <p className="mb-1.5 font-semibold text-zinc-200">What the evidence says, in one breath:</p>
            <p>
              <span className="text-zinc-200">Specialty demand drives everything</span> — General Dentists are 3.3× more
              likely to get worked and 3.8× more likely to place once worked.{' '}
              <span className="text-zinc-200">Experience gets attention but doesn&apos;t close</span> — 10+ years doubles the
              odds of being worked, yet shows no effect on placing afterward; recruiters may be over-selecting on it.{' '}
              <span className="text-zinc-200">Hygienists and assistants are the untapped pool</span> — only 3% ever get an
              application versus 21% of everyone else. Credentials (residency, US training, languages) show no detectable
              effect at current sample sizes.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Placements per year */}
        <Card title="Placements per year" sub="Momentum: 71 → 107 → 164 → 134 so far this year.">
          <BarList
            items={data.placementsPerYear.slice(-9).map(y => ({ key: y.year, label: y.year, count: y.count, color: CYAN }))}
            total={Math.max(...data.placementsPerYear.map(y => y.count), 1)}
            relative
          />
        </Card>

        {/* Recent placements */}
        <Card title="Recent placements" sub="⚡ = candidate sourced by the automation.">
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <tbody>
                {data.recentPlacements.map((p, i) => (
                  <tr key={i} className="border-t border-zinc-800/70 text-zinc-300 first:border-t-0">
                    <td className="whitespace-nowrap py-2 pr-3 font-medium">
                      {p.automationEra && <span title="automation-sourced">⚡ </span>}
                      {p.person ?? '—'}
                    </td>
                    <td className="max-w-56 truncate py-2 pr-3 text-zinc-500">{p.job ?? '—'}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-zinc-500" title="added to Salesforce">
                      +{p.sfAddedOn ?? '—'}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right tabular-nums text-zinc-400">{p.placedOn ?? '—'}</td>
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
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-zinc-900">
              <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
                <th className="py-1.5 pr-3 font-medium">Candidate</th>
                <th className="py-1.5 pr-3 font-medium">Job</th>
                <th className="py-1.5 pr-3 font-medium">Stage</th>
                <th className="py-1.5 pr-3 text-right font-medium" title="Historical placement probability — hover a value for the reasoning">P(place)</th>
                <th className="py-1.5 pr-3 text-right font-medium">Added to SF</th>
                <th className="py-1.5 text-right font-medium">Since</th>
              </tr>
            </thead>
            <tbody>
              {data.inFlight.map((f, i) => (
                <tr key={i} className="border-t border-zinc-800/70 text-zinc-300">
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
                  <td className="whitespace-nowrap py-2 text-right tabular-nums text-zinc-400">{f.since ?? '—'}</td>
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
  if (!est) return <span className="text-zinc-600">—</span>
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
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-5">
      <div className={`text-3xl font-semibold leading-none tabular-nums ${accent ?? 'text-zinc-100'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="mt-2 text-xs font-medium text-zinc-200">{label}</div>
      {detail && <div className="mt-1 text-[11px] leading-snug text-zinc-500">{detail}</div>}
    </div>
  )
}
