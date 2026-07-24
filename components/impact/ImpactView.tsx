'use client'

import Link from 'next/link'
import { Card, SmallLabel } from '@/components/DjcInsightsPanel'
import { ColumnChart } from '@/components/djc/science'
import {
  DJC_LAG, FLYWHEEL, IMPACT_META, KIM_ERRORS_MONTHLY, KIM_ERROR_RR, KIM_LATENCY, TIME_MODEL,
  type ImpactData,
} from '@/lib/impactScience'

const EMERALD = '#059669'
const AMBER = '#d97706'
const CYAN = '#0891b2'

/** The combined DJC + Kimedics impact story: what the automations replaced, the time they
 *  return, how reliability was engineered to zero failures, and what it means for placements.
 *  Every claim carries its measurement; every model is disclosed in the methodology footer. */
export default function ImpactView({ data }: { data: ImpactData }) {
  const { kim, djc } = data
  const runPct = djc.runs30d ? Math.round((djc.runsOk30d / djc.runs30d) * 100) : null
  return (
    <div className="space-y-10">
      <p className="max-w-3xl text-[13px] leading-relaxed text-zinc-400">
        Two automations now run Proxi&apos;s candidate and job intake end to end: Kimedics job emails
        flow into Salesforce untouched by human hands (live since Apr 9), and Dentist Job Cafe is
        screened for new dental talent every hour (live since Jun 16). This page measures what
        that&apos;s worth — in hours, in speed, in data quality, and in the pipeline.
      </p>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Hero big={`${kim.hoursSaved} hrs`} label="of manual work returned" detail="Kimedics intake since April — full model below" accent="text-emerald-300" />
        <Hero big={djc.observed.toLocaleString()} label="candidates screened" detail={`${djc.created} added to Salesforce, every one deduped first`} accent="text-cyan-300" />
        <Hero big={`${KIM_LATENCY.medianMin} min`} label="from email to Salesforce" detail={`median of ${KIM_LATENCY.n.toLocaleString()} Kimedics emails (90% within ${KIM_LATENCY.p90Min})`} />
        <Hero big="0" label="sync failures this month" detail="down from 49 in May — the drop is engineered, not luck" accent="text-emerald-300" />
      </div>

      {/* 1 · What the automations replaced */}
      <section>
        <ImpactHeader n={1} title="What the automations replaced" sub="The same work used to be keystrokes. Here is the ledger of what no longer gets typed by a person." />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Kimedics → Salesforce" sub="Every job email read, parsed, and synced — creations, updates, closures, worksites.">
            <StatGrid
              items={[
                { v: kim.emails, l: 'emails processed' },
                { v: kim.jobsTracked, l: 'jobs tracked' },
                { v: kim.jobsInSf, l: 'pushed to Salesforce' },
                { v: kim.sfPatches, l: 'field-level corrections' },
                { v: kim.worksitesCreated, l: 'worksites created' },
                { v: kim.autoRetries, l: 'self-healed retries' },
              ]}
            />
          </Card>
          <Card title="Dentist Job Cafe → Salesforce" sub="Every candidate found, checked against Salesforce, enriched, and created only if genuinely new.">
            <StatGrid
              items={[
                { v: djc.observed, l: 'candidates screened' },
                { v: djc.dupesPrevented, l: 'duplicates prevented' },
                { v: djc.created, l: 'net-new contacts created' },
                { v: djc.phonesRecovered, l: 'phone numbers recovered' },
                { v: djc.resumesMined, l: 'resumes mined for career facts' },
                { v: runPct !== null ? `${runPct}%` : '—', l: 'run success, last 30 days' },
              ]}
            />
          </Card>
        </div>
      </section>

      {/* 2 · Time returned */}
      <section>
        <ImpactHeader n={2} title="Time returned to the team" sub="Hours a person did not spend fielding job emails and retyping them into Salesforce." />
        <Card
          title="Manual hours recouped per month — Kimedics"
          sub={`Model: ${TIME_MODEL.minPerOpen} min to enter a new job, ${TIME_MODEL.minPerOther} min per update or closure, ${TIME_MODEL.minPerEmailSwitch} min of interruption per inbound email. Same model as the weekly client report.`}
        >
          <ColumnChart series={kim.monthly.map(m => ({ label: m.month, count: m.hours }))} color={EMERALD} />
          <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
            <span className="font-semibold text-emerald-300">{kim.hoursSaved} hours total</span> — roughly{' '}
            {Math.round(kim.hoursSaved / 8)} full working days since April. The interrupt tax is the
            quiet half of this: ~{kim.emails.toLocaleString()} emails that no longer break anyone&apos;s
            focus, because nobody has to watch the inbox at all.
          </p>
        </Card>
      </section>

      {/* 3 · Reliability */}
      <section>
        <ImpactHeader n={3} title="Reliability, engineered down to zero" sub="Failures didn't fade — specific classes of outage were found and eliminated one by one." />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Failure events per month — Kimedics sync" sub="Every event the pipeline logged as a failure or error, by month.">
            <ColumnChart series={KIM_ERRORS_MONTHLY.map(m => ({ label: m.month, count: m.count }))} color={AMBER} />
            <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
              July&apos;s failure rate is <span className="font-semibold text-zinc-200">~99% lower</span> than
              May&apos;s (rate ratio {KIM_ERROR_RR.rr}, 95% CI {KIM_ERROR_RR.lo}–{KIM_ERROR_RR.hi}). In plain
              terms: if nothing had actually changed, a drop this large has well under a 1-in-1,000
              chance of happening on its own.
            </p>
          </Card>
          <Card title="What got fixed" sub="Each outage class traced to root cause, then removed permanently.">
            <ol className="space-y-3 text-[12px] leading-relaxed text-zinc-300">
              <FixItem date="Jun 23" title="Salesforce logins stopped expiring">
                Auth moved to a credential type that can&apos;t go stale — the outage that used to hit
                roughly monthly is structurally impossible now.
              </FixItem>
              <FixItem date="Jul 13" title="Email intake rebuilt on Google's API">
                The old mailbox connection had a hard cap that other apps kept exhausting. The new
                path has no cap to hit.
              </FixItem>
              <FixItem date="Jul 23" title="DJC given a fixed network address">
                DJC locks accounts that log in from too many places in a day. The automation now
                always arrives from one address — {runPct !== null ? `${runPct}%` : '—'} of the last
                30 days&apos; hourly runs succeeded.
              </FixItem>
            </ol>
          </Card>
        </div>
      </section>

      {/* 4 · Speed & freshness */}
      <section>
        <ImpactHeader n={4} title="Speed and freshness" sub="Records aren't just created — they're kept correct, continuously." />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="How fast a job email becomes a Salesforce record">
            <div className="flex flex-wrap items-end gap-8 py-2">
              <BigPair v={`${KIM_LATENCY.medianMin} min`} l="typical (median)" accent="text-cyan-300" />
              <BigPair v={`${KIM_LATENCY.p90Min} min`} l="90% land within" />
              <BigPair v="hourly" l="DJC screened for new talent" />
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
              A recruiter opening Salesforce is looking at the same reality Kimedics sees, minutes
              later — not whenever someone last caught up on the inbox.
            </p>
          </Card>
          <Card
            title="Field corrections applied per month"
            sub="Salesforce records silently drift from source. The automation re-checks every job and patches what changed."
          >
            <ColumnChart series={kim.patchesMonthly.map(m => ({ label: m.month, count: m.count }))} color={CYAN} />
            <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
              Rising, not falling — as the tracked-job base grows, so does the invisible upkeep a
              person would otherwise owe.
            </p>
          </Card>
        </div>
      </section>

      {/* 5 · Placements */}
      <section>
        <ImpactHeader n={5} title="And placements?" sub="The honest read: placements lag sourcing by design. Here is what's measurable now, and the leading indicators that predict what's next." />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Placements per week" sub="Last 16 weeks. DJC sourcing automation went live Jun 16; profile-view budget was exhausted Jul 22 (refills Aug 15).">
            <ColumnChart series={djc.weeklyPlacements.map(w => ({ label: w.week, count: w.count }))} color={EMERALD} />
          </Card>
          <Card title="The leading indicators" sub="Placements compound from a candidate pool over years — these are the numbers that move first.">
            <ul className="space-y-3 text-[12px] leading-relaxed text-zinc-300">
              <li>
                <span className="font-semibold text-emerald-300">{djc.autoApps} applications and {djc.autoPlaced} placement</span>{' '}
                already involve automation-sourced candidates — the first placement landed within
                weeks of go-live. Historically the median placed candidate converted{' '}
                <span className="font-semibold text-zinc-200">{FLYWHEEL.medianYears} years</span> after
                joining DJC (n={FLYWHEEL.n}), and only {FLYWHEEL.within1yPct}% converted within their
                first year — a sourcing engine is an asset that appreciates.
              </li>
              <li>
                <span className="font-semibold text-cyan-300">{djc.phonesRecovered} candidates became reachable</span>{' '}
                who weren&apos;t before: their phone numbers existed only inside resume files nobody had
                read. Reach is the first constraint on placements.
              </li>
              <li>
                <span className="font-semibold text-zinc-200">{djc.dupesPrevented.toLocaleString()} duplicates prevented</span>{' '}
                means every recruiter search and every outreach list stays clean — no double-calls,
                no split histories.
              </li>
            </ul>
            <Link href="/djc/pipeline" className="mt-3 inline-block text-[11px] text-cyan-400 hover:underline">
              Full pipeline & what statistically drives hires →
            </Link>
          </Card>
        </div>
      </section>

      {/* Methodology */}
      <section>
        <ImpactHeader n={6} title="How every number is computed" sub="No black boxes. If a figure is a model, the model is stated; if it's a measurement, so is the sample size." />
        <Card title="Methodology & honest caveats">
          <ul className="list-disc space-y-2 pl-4 text-[12px] leading-relaxed text-zinc-400">
            <li>
              <span className="text-zinc-300">Hours returned</span> uses the disclosed per-action model
              ({TIME_MODEL.minPerOpen} / {TIME_MODEL.minPerOther} / {TIME_MODEL.minPerEmailSwitch} min), applied to
              actual logged action counts — not estimates of volume.
            </li>
            <li>
              <span className="text-zinc-300">The failure-rate comparison</span> is a Poisson rate ratio
              with a 95% confidence interval (May: 49 events / 31 days vs July: 0 / 24 days) — the
              standard test for &quot;did the rate really change?&quot;
            </li>
            <li>
              <span className="text-zinc-300">Latency</span> is measured per email: time from the email&apos;s
              own timestamp to the record landing in our system, median over {KIM_LATENCY.n.toLocaleString()} emails,
              outlier-window bounded.
            </li>
            <li>
              <span className="text-zinc-300">What we don&apos;t claim:</span> Q2 2026&apos;s record placement
              quarter predates the DJC automation — it belongs to the team. Placement attribution
              needs quarters of data; the flywheel math above ({FLYWHEEL.medianYears}-year median from
              signup to placement, n={FLYWHEEL.n}) is exactly why we track applications and
              reachability as the early signals instead. And the &quot;registered → in Salesforce&quot;
              speed comparison is reported honestly: for 2025+ signups the team&apos;s bulk imports were
              already prompt (~{DJC_LAG.bothEras2025Plus.medianDays} day both eras); the automation&apos;s edge
              there is consistency and enrichment, not raw speed.
            </li>
            <li>
              Live counts refresh with each page load; pinned statistics computed {IMPACT_META.computedOn} (reproducible
              via <code className="text-[11px] text-zinc-500">scripts/impact_analysis.py</code>).
            </li>
          </ul>
        </Card>
      </section>
    </div>
  )
}

function Hero({ big, label, detail, accent }: { big: string; label: string; detail: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-4 sm:p-5">
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
        <h2 className="text-[15px] font-semibold text-zinc-100">{title}</h2>
      </div>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-500">{sub}</p>
    </div>
  )
}

function StatGrid({ items }: { items: { v: number | string; l: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
      {items.map(i => (
        <div key={i.l}>
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
    <div>
      <div className={`text-2xl font-semibold tabular-nums ${accent ?? 'text-zinc-100'}`}>{v}</div>
      <div className="mt-0.5 text-[11px] text-zinc-500">{l}</div>
    </div>
  )
}

function FixItem({ date, title, children }: { date: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="w-12 shrink-0 pt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">{date}</span>
      <div>
        <p className="font-semibold text-zinc-200">{title}</p>
        <p className="mt-0.5 text-zinc-400">{children}</p>
      </div>
    </li>
  )
}
