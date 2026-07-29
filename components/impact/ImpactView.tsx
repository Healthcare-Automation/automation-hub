'use client'

import Link from 'next/link'
import { Card } from '@/components/DjcInsightsPanel'
import { ColumnChart } from '@/components/djc/science'
import {
  DJC_INFLOW_MONTHLY, DJC_TIME_MODEL, FLYWHEEL, IMPACT_META, KIM_ERRORS_MONTHLY, KIM_ERROR_RR,
  KIM_JOBS_MONTHLY, KIM_JOB_WORK, KIM_LATENCY, PLACEMENT_VERDICT, TIME_MODEL,
  DJC_TIME_TASKS, DJC_WEEKS_LIVE, DJC_BASELINE_HOURS_PER_WEEK, DJC_HOURS_MONTHLY,
  type ImpactData,
} from '@/lib/impactScience'

const EMERALD = '#059669'
const AMBER = '#d97706'
const CYAN = '#0891b2'

/** Sum of the per-task model — computed once so the card and the summary cannot disagree. */
const DJC_HOURS_TOTAL = Math.round(
  DJC_TIME_TASKS.reduce((a, t) => a + (t.count * t.minutes) / 60, 0),
)
const VIOLET = '#8b5cf6'

/** One causal story, told in order: jobs come in faster → candidates come in automatically →
 *  did that produce more placements? (honest answer: not yet, and here's when we'll know) →
 *  what it unambiguously returned today: hours. Every claim carries its measurement. */
export default function ImpactView({ data }: { data: ImpactData }) {
  const { kim, djc } = data
  const djcHours = Math.round(
    (djc.observed * DJC_TIME_MODEL.minPerScreen +
      djc.created * DJC_TIME_MODEL.minPerCreate +
      djc.resumesMined * DJC_TIME_MODEL.minPerResume) / 60,
  )
  const totalHours = kim.hoursSaved + djcHours
  const julAutoShare = Math.round((DJC_INFLOW_MONTHLY[6].auto / DJC_INFLOW_MONTHLY[6].total) * 100)
  const v = PLACEMENT_VERDICT

  return (
    <div className="space-y-10">
      <header className="max-w-3xl">
        <h1 className="text-[20px] font-semibold text-zinc-100">What the automations have produced</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
          Both automations, end to end: what changed for jobs, what changed for candidates, whether
          placements moved, and the hours returned regardless. Every claim carries how it was
          measured — including the ones that do not flatter us.
        </p>
      </header>

      {/* The story in one box */}
      <div className="rounded-xl border border-cyan-800/40 bg-gradient-to-br from-cyan-950/30 to-zinc-900/40 p-5">
        <p className="text-[13px] font-semibold text-zinc-100">The whole story, in four sentences</p>
        <ol className="mt-2 max-w-3xl list-decimal space-y-1.5 pl-4 text-[13px] leading-relaxed text-zinc-300">
          <li>
            <span className="text-cyan-300">Jobs arrive faster:</span> every Kimedics job email becomes a
            Salesforce record in a median of {`${KIM_LATENCY.medianMin} minutes`}, around the clock —
            before, it waited on a person&apos;s inbox.
          </li>
          <li>
            <span className="text-emerald-300">Candidate intake runs itself:</span> {julAutoShare}% of all
            DJC candidates entering Salesforce this month came from the automation — same scale the team
            used to sustain by hand, now deduped and resume-enriched on top.
          </li>
          <li>
            <span className="text-amber-300">Placements haven&apos;t risen yet</span> —{' '}
            {`${v.sameWindow.y2026} in the first ${v.postDays} automation days vs ${v.sameWindow.y2025} in the same weeks last year.`}{' '}
            That&apos;s the honest read, and it&apos;s the expected one: sourcing converts on a{' '}
            {`${FLYWHEEL.medianYears}-year`} median. Section 3 shows exactly what to watch.
          </li>
          <li>
            <span className="text-zinc-100">What&apos;s already banked:</span> ~{totalHours} hours of manual
            work returned to the team, at higher data quality and zero sync failures this month.
          </li>
        </ol>
      </div>

      {/* Headline numbers mirror the four sentences, in order */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Hero big={`${KIM_LATENCY.medianMin} min`} label="email → Salesforce job" detail={`median of ${KIM_LATENCY.n.toLocaleString()} emails · 90% within ${KIM_LATENCY.p90Min} min`} accent="text-cyan-300" />
        <Hero big={`${julAutoShare}%`} label="of candidate inflow automated" detail={`${djc.created} contacts created since Jun 16, all deduped`} accent="text-emerald-300" />
        <Hero big={`${v.sameWindow.y2026} vs ${v.sameWindow.y2025}`} label="placements vs same weeks '25" detail="flat so far — see section 3 for the why" accent="text-amber-300" />
        <Hero big={`~${totalHours} hrs`} label="manual work returned" detail={`${kim.hoursSaved} Kimedics + ~${djcHours} DJC — models disclosed below`} />
      </div>

      {/* 1 · Jobs */}
      <section>
        <ImpactHeader
          n={1}
          title="Jobs: kept correct in minutes, dependably"
          sub="The automation does not source jobs — it takes the ones arriving by email and makes sure Salesforce matches them, in minutes, without anyone watching an inbox. The win is speed and accuracy, not volume."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title="Jobs the automation handled each month"
            sub="Only jobs it actually processed — scraped, matched to Salesforce and kept in sync. It went live 31 Mar, so there is nothing before that."
          >
            <ColumnChart series={KIM_JOBS_MONTHLY.map(m => ({ label: m.month, count: m.count }))} color={CYAN} />
            <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
              <BigPair v={`${KIM_LATENCY.medianMin} min`} l="email → record (median)" accent="text-cyan-300" />
              <BigPair v={kim.sfPatches.toLocaleString()} l="silent field corrections applied" />
              <BigPair v={String(kim.autoRetries)} l="failures self-healed" />
            </div>
            {/* Stated outright: the earlier chart counted every job entering Salesforce, which read
                as though the automation had produced all of them. */}
            <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
              Across {KIM_JOB_WORK.processed} jobs it has handled, it created{' '}
              <span className="text-zinc-200">{KIM_JOB_WORK.created}</span> outright and{' '}
              <span className="text-zinc-200">{KIM_JOB_WORK.worksitesCreated}</span> worksites — most
              jobs already exist, and the job is keeping them right. Other jobs reach Salesforce by
              other routes; they are not counted here.
            </p>
            <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
              The before-state can&apos;t be timed precisely — nobody logged when a human got around to an
              email — but it was bounded by inbox attention: hours to days, interrupted by everything
              else. Now it&apos;s {KIM_LATENCY.medianMin} minutes, measured, 24/7.
            </p>
          </Card>
          <Card title="…and the intake stopped breaking" sub="Failure events per month. Each outage class was root-caused and permanently removed (auth that can't expire — Jun 23; capless email API — Jul 13).">
            <ColumnChart series={KIM_ERRORS_MONTHLY.map(m => ({ label: m.month, count: m.count }))} color={AMBER} />
            <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
              July vs May is a ~99% drop in failure rate (rate ratio {KIM_ERROR_RR.rr}, 95% CI{' '}
              {KIM_ERROR_RR.lo}–{KIM_ERROR_RR.hi}) — under a 1-in-1,000 chance of being luck. Dependability
              is what makes the {KIM_LATENCY.medianMin}-minute number matter: a fast pipeline that dies
              monthly still needs a babysitter.
            </p>
          </Card>
        </div>
      </section>

      {/* 2 · Candidates */}
      <section>
        <ImpactHeader
          n={2}
          title="Candidates: the entire intake now runs itself — and each one arrives better"
          sub="The team used to bulk-import DJC candidates by hand. The automation took that workflow over almost completely, at the same scale, and adds what imports never had: dedup, recovered phone numbers, and resume-mined career facts."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title="DJC candidates entering Salesforce per month"
            sub="2026 — green is automation-created (live Jun 16), grey is the manual workflow it replaced. July is throttled: the profile-view budget ran out Jul 22 and refills Aug 15."
          >
            <StackedColumns
              series={DJC_INFLOW_MONTHLY.map(m => ({
                label: m.month,
                a: Math.min(m.auto, m.total),
                b: Math.max(m.total - m.auto, 0),
              }))}
              colorA={EMERALD}
              colorB="#3f3f46"
              legendA="automation"
              legendB="manual"
            />
          </Card>
          <Card title="What every automated candidate gets that imports never had">
            <StatGrid
              items={[
                { v: djc.observed, l: 'candidates screened against Salesforce' },
                { v: djc.dupesPrevented, l: 'duplicates prevented — zero double records' },
                { v: djc.phonesRecovered, l: 'phone numbers recovered from resume files' },
                { v: djc.resumesMined, l: 'resumes mined for grad year & experience' },
                { v: `${djc.runs30d ? Math.round((djc.runsOk30d / djc.runs30d) * 100) : '—'}%`, l: 'hourly-run success, last 30 days' },
                { v: 'hourly', l: 'screening cadence — no catch-up sweeps' },
              ]}
            />
            <p className="mt-4 text-[12px] leading-relaxed text-zinc-400">
              Reach is the point: {djc.phonesRecovered} candidates are callable today whose numbers existed
              only inside unread resume PDFs. A bigger, cleaner, reachable pool is the raw material the
              next section is about.
            </p>
          </Card>
        </div>
      </section>

      {/* 3 · The connection */}
      <section>
        <ImpactHeader
          n={3}
          title="So: faster jobs + automated candidates → more placements?"
          sub="This is the question that matters, so it gets the straight answer."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Moved here from the Overview: the automation's own funnel is the mechanism behind
              the verdict beside it, so the two belong together rather than on separate tabs. */}
          <Card title="Why: the automation's own funnel stalls early"
                sub="Every candidate the automation created, and how far each got.">
            <div className="space-y-2">
              {[
                { label: 'added to Salesforce', n: djc.created, tone: 'bg-cyan-400/70' },
                { label: 'put forward for a job', n: djc.autoApps, tone: 'bg-violet-400/70' },
                { label: 'placed', n: djc.autoPlaced, tone: 'bg-emerald-400/80' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-[12px] text-zinc-300">{s.label}</span>
                  <span className="relative h-5 grow rounded bg-zinc-800/50">
                    <span className={`absolute inset-y-0 left-0 rounded ${s.tone}`}
                          style={{ width: `${Math.max((s.n / (djc.created || 1)) * 100, 0.6)}%` }} />
                  </span>
                  <span className="w-14 shrink-0 text-right text-[12px] font-semibold tabular-nums text-zinc-200">
                    {s.n.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-zinc-400">
              The gap is between sourcing and being worked, not sourcing itself. Until more of these
              candidates are put forward, the automation cannot show up in the placement numbers —
              it is filling a top-of-funnel nobody is drawing from.
            </p>
          </Card>

          <Card title="The honest verdict: not yet">
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <BigPair v={String(v.sameWindow.y2026)} l={`placements, first ${v.postDays} automation days`} accent="text-amber-300" />
              <BigPair v={String(v.sameWindow.y2025)} l="same calendar weeks, 2025" />
              <BigPair v={String(v.sameWindow.y2024)} l="same weeks, 2024" />
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-zinc-400">
              Year-over-year: flat. Against the 8 weeks right before go-live — which included the Q2
              record push — the pace is down (rate ratio {v.rr}, 95% CI {v.lo}–{v.hi}), a difference that
              is <span className="text-zinc-200">not statistically significant</span> and overlaps the
              views-budget outage. There is no evidence of a placement lift yet, and this page will keep
              saying so until the data says otherwise.
            </p>
          </Card>
          <Card title="Why that's the expected result — and what to watch">
            <ul className="space-y-3 text-[12px] leading-relaxed text-zinc-300">
              <li>
                <span className="font-semibold text-zinc-100">The mechanism is slow by nature.</span>{' '}
                Historically, a placed DJC candidate converted a median of{' '}
                <span className="font-semibold">{FLYWHEEL.medianYears} years</span> after joining (n=
                {FLYWHEEL.n}); only {FLYWHEEL.within1yPct}% converted within their first year. Six weeks of
                sourcing cannot move a number with that time constant.
              </li>
              <li>
                <span className="font-semibold text-emerald-300">The early signals are moving:</span>{' '}
                {`${djc.autoApps} applications and ${djc.autoPlaced} placement`} already involve
                automation-sourced candidates — that first placement came within weeks, against a{' '}
                {`${FLYWHEEL.medianYears}-year`} median.
              </li>
              <li>
                <span className="font-semibold text-zinc-100">The scoreboard to watch:</span> quarterly
                conversion of the automation cohort (applications → placements per 100 sourced
                candidates), vs the same rate for manually-imported candidates. That comparison becomes
                meaningful from Q4 2026, and this tab will carry it.
              </li>
            </ul>
            <Link href="/djc/pipeline" className="mt-3 inline-block text-[11px] text-cyan-400 hover:underline">
              What statistically drives hires (odds analysis) →
            </Link>
          </Card>
        </div>
      </section>

      {/* 4 · Hours */}
      <section>
        <ImpactHeader
          n={4}
          title="What's already banked: the hours"
          sub="Whatever placements do later, this part is real today. Both models are conservative and fully disclosed."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title={`Kimedics: ${kim.hoursSaved} hours since April`}
            sub={`${TIME_MODEL.minPerOpen} min per new job entered, ${TIME_MODEL.minPerOther} min per update/closure, ${TIME_MODEL.minPerEmailSwitch} min of interruption per email — same model as the weekly client report, applied to actual logged counts.`}
          >
            <ColumnChart series={kim.monthly.map(m => ({ label: m.month, count: m.hours }))} color={EMERALD} />
            <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
              Roughly {Math.round(kim.hoursSaved / 8)} full working days — and{' '}
              {kim.emails.toLocaleString()} emails that never interrupted anyone.
            </p>
          </Card>
          <Card
            title={`DJC: ~${DJC_HOURS_TOTAL} hours since June 5`}
            sub={`Per-task rates for doing the same work by hand, applied to what the automation actually did. Every rate is at the low end.`}
          >
            <div className="space-y-2">
              {DJC_TIME_TASKS.map(task => {
                const hours = (task.count * task.minutes) / 60
                return (
                  <div key={task.label} className="flex items-center gap-3">
                    <span className="w-48 shrink-0 text-[11px] leading-tight text-zinc-400">
                      {task.label}
                      {'note' in task && task.note && (
                        <span className="block text-[10px] text-zinc-600">{task.note}</span>
                      )}
                    </span>
                    <span className="relative h-4 grow rounded bg-zinc-800/50">
                      <span className="absolute inset-y-0 left-0 rounded bg-cyan-400/60"
                            style={{ width: `${(hours / DJC_HOURS_TOTAL) * 100}%` }} />
                    </span>
                    <span className="w-32 shrink-0 text-right text-[11px] tabular-nums text-zinc-500">
                      {task.count.toLocaleString()} × {task.minutes} min
                    </span>
                    <span className="w-14 shrink-0 text-right text-[12px] font-semibold tabular-nums text-zinc-200">
                      {hours.toFixed(0)}h
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-zinc-400">
              That is{' '}
              <span className="font-semibold text-cyan-300">
                {(DJC_HOURS_TOTAL / DJC_WEEKS_LIVE).toFixed(1)} hours a week
              </span>{' '}
              — against the {DJC_BASELINE_HOURS_PER_WEEK} hours a week Proxi estimated before any of
              this existed. The gap is volume: the automation reviews far more candidates a week than
              anyone was reviewing by hand.
            </p>
            {/* Monthly, because a cumulative-since-launch figure only ever rises and cannot show
                whether the automation is doing more work than it was. */}
            <div className="mt-4 border-t border-zinc-800 pt-3">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-600">Hours returned per month</p>
              <div className="flex items-end gap-2">
                {DJC_HOURS_MONTHLY.map(m => {
                  const max = Math.max(...DJC_HOURS_MONTHLY.map(x => x.hours), 1)
                  return (
                    <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[11px] font-semibold tabular-nums text-zinc-100">{m.hours}h</span>
                      <div className="flex h-16 w-full items-end">
                        <div className="w-full rounded-t bg-cyan-400/50"
                             style={{ height: `${(m.hours / max) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-zinc-600">
                        {new Date(m.month + '-02').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
              Combined with Kimedics:{' '}
              <span className="font-semibold text-zinc-100">~{kim.hoursSaved + Math.round(DJC_HOURS_TOTAL)} hours</span>{' '}
              of manual work returned — about{' '}
              {Math.round((kim.hoursSaved + DJC_HOURS_TOTAL) / 8)} working days.
            </p>
          </Card>
        </div>
      </section>

      {/* Methodology */}
      <section>
        <ImpactHeader n={5} title="How every number is computed" sub="If a figure is a model, the model is stated; if it's a measurement, so is the sample size and the control." />
        <Card title="Methodology & honest caveats">
          <ul className="list-disc space-y-2 pl-4 text-[12px] leading-relaxed text-zinc-400">
            <li>
              <span className="text-zinc-300">Job speed</span>: per-email measurement (email&apos;s own
              timestamp → record in our system), median over {KIM_LATENCY.n.toLocaleString()} emails. The
              manual-era equivalent was never logged, so we bound it qualitatively instead of inventing a
              number.
            </li>
            <li>
              <span className="text-zinc-300">Candidate inflow share</span>: Salesforce contact creations
              with DJC origin, by month, attributed to the automation via its own creation log
              ({julAutoShare}% in July).
            </li>
            <li>
              <span className="text-zinc-300">The placement verdict</span> uses two controls: the same
              calendar window in prior years (seasonality) and the 8 weeks pre-go-live (recent trend),
              with a Poisson rate ratio and 95% CI. We report &quot;no lift yet&quot; because that is what both
              controls show.
            </li>
            <li>
              <span className="text-zinc-300">Hours</span>: disclosed per-action minutes × actual logged
              action counts, both automations. The DJC model is deliberately conservative (screening a
              candidate is priced at {DJC_TIME_MODEL.minPerScreen} minute).
            </li>
            <li>
              <span className="text-zinc-300">What we don&apos;t claim</span>: the Q2 2026 placement record
              predates the DJC automation and belongs to the team. Live counts refresh per page load;
              pinned statistics computed {IMPACT_META.computedOn}, reproducible via{' '}
              <code className="text-[11px] text-zinc-500">scripts/impact_analysis.py</code>.
            </li>
          </ul>
        </Card>
      </section>
    </div>
  )
}

function Hero({ big, label, detail, accent }: { big: string; label: string; detail: string; accent?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-4 sm:p-5">
      <div className={`text-2xl font-semibold leading-none tabular-nums sm:text-3xl ${accent ?? 'text-zinc-100'}`}>{big}</div>
      <div className="mt-2 text-xs font-medium text-zinc-200">{label}</div>
      <div className="mt-1 text-[11px] leading-snug text-zinc-500">{detail}</div>
    </div>
  )
}

function ImpactHeader({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-700/50 bg-cyan-950/40 text-[11px] font-semibold text-cyan-300">
          {n}
        </span>
        <h2 className="min-w-0 text-[15px] font-semibold text-zinc-100">{title}</h2>
      </div>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-500">{sub}</p>
    </div>
  )
}

function StatGrid({ items }: { items: { v: number | string; l: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
      {items.map(i => (
        <div key={i.l} className="min-w-0">
          <div className="text-xl font-semibold tabular-nums text-zinc-100">
            {typeof i.v === 'number' ? i.v.toLocaleString() : i.v}
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-zinc-500">{i.l}</div>
        </div>
      ))}
    </div>
  )
}

function BigPair({ v, l, accent }: { v: string; l: string; accent?: string }) {
  return (
    <div className="min-w-0">
      <div className={`text-2xl font-semibold tabular-nums ${accent ?? 'text-zinc-100'}`}>{v}</div>
      <div className="mt-0.5 text-[11px] text-zinc-500">{l}</div>
    </div>
  )
}

/** Weighted bar per model line: count × minutes = share of the total hours. */
function ModelRow({ n, unit, label, color, frac, max }: {
  n: number; unit: string; label: string; color: string; frac: number; max: number
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="truncate text-zinc-300">{label}</span>
        <span className="shrink-0 tabular-nums text-zinc-500">{n.toLocaleString()} {unit}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-sm bg-zinc-800">
        <div className="h-1.5 rounded-sm" style={{ width: `${Math.min((frac / Math.max(max, 1)) * 100, 100)}%`, background: color }} />
      </div>
    </div>
  )
}

/** Two-tone stacked monthly columns (automation share vs manual share). */
function StackedColumns({ series, colorA, colorB, legendA, legendB }: {
  series: { label: string; a: number; b: number }[]
  colorA: string
  colorB: string
  legendA: string
  legendB: string
}) {
  const W = 560
  const H = 170
  const max = Math.max(...series.map(s => s.a + s.b), 1)
  const colW = (W - 10 * (series.length - 1)) / series.length
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[11px] text-zinc-400">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: colorA }} /> {legendA}</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: colorB }} /> {legendB}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {series.map((s, i) => {
          const total = s.a + s.b
          const hTotal = Math.max((total / max) * (H - 44), 3)
          const hA = total ? (s.a / total) * hTotal : 0
          const x = i * (colW + 10)
          return (
            <g key={s.label}>
              <rect x={x} y={H - 24 - hTotal} width={colW} height={hTotal - hA} rx={3} fill={colorB} />
              <rect x={x} y={H - 24 - hA} width={colW} height={hA} rx={hA > 4 ? 3 : 0} fill={colorA} />
              <text x={x + colW / 2} y={H - 30 - hTotal} textAnchor="middle" fill="#d4d4d8" fontSize={11.5} fontWeight={600}>
                {total}
              </text>
              <text x={x + colW / 2} y={H - 8} textAnchor="middle" fill="#71717a" fontSize={10}>
                {s.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
