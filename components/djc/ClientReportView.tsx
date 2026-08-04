'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
// Light-theme chart fills — the shared CHART tokens are tuned for the dark internal tabs.
// Same pastel family, one step deeper so bars hold their own on white.
const LTRACK = 'bg-zinc-200/60'
const LREF = 'bg-slate-300'
const LGOOD = 'bg-teal-400/90'
const LWARN = 'bg-orange-300'
const LPRIMARY = 'bg-cyan-500/70'
const LNEUTRAL = 'bg-slate-400/70'
const LACCENT = 'bg-violet-400/80'
const LRENEW = 'bg-violet-300'
import type { ClientReport } from '@/lib/clientReport'

/**
 * The client-facing report — the full Notion spec, condensed to one scrolling page.
 *
 * Three sections mirroring the doc: Operational, DJC, Kimedics. Every stacked bar carries a hover
 * card with its exact breakdown, and any card that summarises jobs can be clicked to open the raw
 * rows behind it (with Salesforce links) in a side panel — the number on screen and the list behind
 * it always come from the same query.
 */
const monthLabel = (m: string) =>
  new Date(m + '-02').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

/** "Jul 2026" — for pickers where the year has to be unambiguous. */
const monthLabelFull = (m: string) =>
  new Date(m + '-02').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })

/** Sample size behind the median-sync figure, quoted in the ⓘ so the number is auditable. */
const KIM_SYNC_N = '2,348 syncs'

const SF_BASE = 'https://proxi.my.salesforce.com/'
const SHOW_SUPPLY = false

type Drill = { title: string; sub?: string; params: Record<string, string> } | null

/** Proxi's own placement targets, entered from the report itself. */
type GoalSet = {
  year: number | null
  quarters: (number | null)[]
  months: (number | null)[]
}
const EMPTY_GOALS: GoalSet = { year: null, quarters: [null, null, null, null], months: Array(12).fill(null) }

export default function ClientReportView({ report, showSend = false }: {
  report: ClientReport
  showSend?: boolean
}) {
  const r = report
  const thisYear = new Date().getUTCFullYear()
  const [drill, setDrill] = useState<Drill>(null)
  const [tab, setTab] = useState<'ops' | 'djc' | 'kim'>('ops')
  const [goals, setGoals] = useState<GoalSet>(EMPTY_GOALS)
  useEffect(() => {
    fetch(`/api/reports/goals?year=${new Date().getUTCFullYear()}`)
      .then(res => res.json())
      .then(j => { if (j.ok && j.goals) setGoals(j.goals) })
      .catch(() => {})
  }, [])
  const opsDelta = r.ops.ytdPlaced - r.ops.priorYtdPlaced
  const opsPct = r.ops.priorYtdPlaced ? Math.round((opsDelta / r.ops.priorYtdPlaced) * 100) : 0
  const over = r.djc.cycleUsed - r.djc.cycleCap
  const maxMonthly = Math.max(...r.ops.monthly.map(m => Math.max(m.placed, m.prior ?? 0)), 1)
  const reachBase = r.djc.reach[0]?.people || 1
  return (
    <div className="space-y-14 rounded-2xl bg-[#f4f6f8] p-5 text-zinc-900 sm:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="text-[20px] font-semibold text-zinc-900">Proxi Performance Report</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-600">
            How the business is doing across placements, candidate sourcing and job fulfillment —
            live from Salesforce and the automations. Click any number for the people or jobs behind
            it.
          </p>
          <Freshness generatedAt={r.generatedAt} syncedAt={r.syncedAt} />
        </div>
        {showSend && <SendPanel activeTab={tab} />}
      </header>

      <nav className="-mt-6 inline-flex rounded-lg border border-zinc-200 bg-white p-0.5">
        {([['ops', '01 · Operations'], ['djc', '02 · Dentist Job Cafe'], ['kim', '03 · Kimedics']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
                  className={cn('whitespace-nowrap rounded-md px-4 py-1.5 text-[12px] font-medium transition-colors',
                    tab === k ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-700')}>
            {label}
          </button>
        ))}
      </nav>

      {/* ════ 01 OPERATIONAL ════════════════════════════════════════════════ */}
      {tab === 'ops' && <section>
        <SectionHead n="01" title="Operational" q="Are we putting more people into jobs than last year?">
          <span className={cn('font-semibold', opsDelta >= 0 ? 'text-teal-700' : 'text-orange-700')}>
            {r.ops.ytdPlaced} placements this year — {opsDelta >= 0 ? 'up' : 'down'} {Math.abs(opsPct)}%
          </span>{' '}
          on the same span of last year ({r.ops.priorYtdPlaced}), at {r.ops.avgPerMonth.toFixed(1)} a month.
        </SectionHead>

        <ScoreboardBlock r={r} goals={goals} onGoals={setGoals} onDrill={setDrill}
                         opsDelta={opsDelta} opsPct={opsPct} />

        <OpsTrendBlock monthly={r.ops.monthly} quarters={r.ops.quarters} goals={goals} onDrill={setDrill} />

        <PipelineBlock pipe={r.ops.pipeline} onDrill={setDrill} />

        <Block title="Where placements happen" source="counted from placement records"
               info={<>Counted from each placement's job state and client account, by the date the
                 placement was recorded. Contract renewals are not counted.
                 "This year" is 1 Jan through today; "last yr" is the identical span a year earlier.
                 Δ is the change between the two — "new" means nothing there last year.</>}
               takeaway="Every state and client we have placed in, this year against last — the % is the change, colored by direction. Click a row for who was placed; the panel splits the history by year.">
          <div className="grid gap-4 lg:grid-cols-2">
            <SideTable title="By state" unit="state" scroll delta rows={r.ops.byState.map(s => ({
              name: s.name, a: s.placed, b: s.prior }))} aLabel="this year" bLabel="last yr"
              onRow={name => setDrill({ title: `Placed in ${name}`,
                sub: `${thisYear - 1} and ${thisYear}, each to today's date — the spans this table compares`,
                params: { kind: 'placements', state: name, ytdPair: '1' } })} />
            <SideTable title="By client" unit="client" scroll delta rows={r.ops.byClient.map(c => ({
              name: c.name, a: c.placed, b: c.prior }))} aLabel="this year" bLabel="last yr"
              onRow={name => setDrill({ title: `Placed with ${name}`,
                sub: `${thisYear - 1} and ${thisYear}, each to today's date — the spans this table compares`,
                params: { kind: 'placements', client: name, ytdPair: '1' } })} />
          </div>
        </Block>

        <SupplyBlock supply={r.ops.supply} onDrill={setDrill} />
      </section>}

      {/* ════ 02 DJC ════════════════════════════════════════════════════════ */}
      {tab === 'djc' && <section>
        <SectionHead n="02" title="Dentist Job Cafe" q="Is the sourcing subscription paying off?">
          {over > 0 ? (
            <span className="font-semibold text-orange-700">
              {r.djc.cycleUsed} of {r.djc.cycleCap} views used this cycle — {over} over the cap.
            </span>
          ) : (
            <span className="font-semibold text-cyan-700">
              {r.djc.cycleUsed} of {r.djc.cycleCap} views used this cycle.
            </span>
          )}{' '}
          The bottleneck is not sourcing — it is what happens after.
        </SectionHead>

        <BudgetBlock djc={r.djc} onDrill={setDrill} />
        <NewAccountsBlock djc={r.djc} onDrill={setDrill} />
        <NewCandidatesBlock djc={r.djc} onDrill={setDrill} />

        <Block title="What happened after"
               info={<>Every step below the first is read from <b>activity logged against the
                 contact in Salesforce</b> — so it shows what recruiters recorded, not necessarily
                 everything they did. "Reached out" counts at least one logged call, text or email
                 of any kind. Note that most rows Salesforce files as a "call" are actually texts
                 (17,614 texts against 2,258 phone calls in this data). "Message was read" counts a
                 text marked read or a tracked email opened — in practice almost all texts, since
                 208 candidates were texted against 12 emailed. "Spoke with a recruiter" is an activity logged with a
                 live-conversation outcome — Connected, Answered, Conversation and the like.
                 <b> Known gap:</b> a few outcomes Proxi uses are not yet mapped ("Answered -
                 Screened", "Connected - Asked for call back"), and inbound replies ("SMS Received")
                 are not counted at all, so the conversation step is a floor rather than an exact
                 figure.</>}
               takeaway="Where people drop out between being added and being put forward — and, for each month's intake, how far that month got. All but one of those put forward had logged outreach first.">
          <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-400">
                From added to put forward — where people stop
              </p>
              <div className="mt-3 space-y-0.5">
                {r.djc.reach.map((s, i) => {
                  const prev = i > 0 ? r.djc.reach[i - 1].people : null
                  const carried = prev ? Math.round((s.people / (prev || 1)) * 100) : 100
                  const lost = prev ? prev - s.people : 0
                  const share = reachBase ? (s.people / reachBase) * 100 : 0
                  // Widths are the real proportions — no minimum. A step that keeps 4% of the
                  // intake has to LOOK like 4%, which is the entire point of a funnel.
                  const worst = i > 0 && r.djc.reach.every((o, j) =>
                    j === 0 || j === i || (r.djc.reach[j - 1].people - o.people) <= lost)
                  return (
                    <div key={s.label}>
                      {i > 0 && (
                        <div className="flex items-center gap-2 py-1 pl-[168px]">
                          <span className={cn('text-[10px] tabular-nums',
                            worst ? 'font-medium text-orange-700' : 'text-zinc-400')}>
                            ↓ {carried}% carry on · {lost} stop here
                          </span>
                        </div>
                      )}
                      <Hover block tip={<>
                        <b className="text-zinc-900">{s.people}</b> of {reachBase} added
                        ({Math.round(share)}%) got this far<br />{s.note}<br />
                        <span className="text-zinc-400">click for the people</span>
                      </>}>
                        <button
                          onClick={() => setDrill({ title: s.label, sub: s.note,
                            params: { kind: 'candidates', reach: REACH_KEYS[i] ?? 'added' } })}
                          className="flex w-full cursor-pointer items-center gap-3 rounded px-1 py-0.5 -mx-1 text-left transition-colors hover:bg-zinc-100">
                          <span className="w-40 shrink-0 text-right text-[12px] text-zinc-700">
                            {s.label}
                          </span>
                          <span className="relative block h-7 grow rounded bg-zinc-100">
                            <span className={cn('absolute inset-y-0 left-0 rounded',
                              i === r.djc.reach.length - 1 ? LGOOD : i === 0 ? LPRIMARY : 'bg-cyan-400/60')}
                                  style={{ width: `${Math.max(share, 0.6)}%` }} />
                          </span>
                          <span className="w-12 shrink-0 text-right text-[13px] font-semibold tabular-nums text-zinc-900">
                            {s.people}
                          </span>
                        </button>
                      </Hover>
                    </div>
                  )
                })}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                Bar length is the share of everyone added who reached that step, so the shrinking is
                real. The orange drop is where the process leaks worst.
              </p>

            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-400">Follow-through by month added</p>
              <div className="mt-2 space-y-1.5">
                {r.djc.outreachMonthly.map(m => (
                  <p key={m.month} className="text-[12px] leading-relaxed text-zinc-600">
                    <span className="text-zinc-800">{monthLabel(m.month)}:</span>{' '}
                    {m.contacted} of {m.sourced} contacted →{' '}
                    <span className="text-cyan-700">{m.putForward} put forward</span>
                    {m.putForward > 0 && (
                      <> → {m.submitted} submitted → <span className="text-teal-700">{m.placed} placed</span></>
                    )}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {r.djc.channels.length > 0 && (() => {
            const live = r.djc.channels.filter(c => c.contacted > 0)
            const per100 = (c: typeof live[number]) => (c.forwarded / (c.contacted || 1)) * 100
            const MIN_SAMPLE = 30
            const ranked = [...live].filter(c => c.contacted >= MIN_SAMPLE)
              .sort((a, b) => per100(b) - per100(a))
            const thin = live.filter(c => c.contacted > 0 && c.contacted < MIN_SAMPLE)
            const best = ranked[0]
            const worst = ranked[ranked.length - 1]
            const TONES: Record<string, string> = { call: LGOOD, text: LPRIMARY, email: LACCENT }
            return (
              <div className="mt-6 border-t border-zinc-200 pt-4">
                <p className="text-[10px] uppercase tracking-wide text-zinc-400">
                  Which channel actually works
                </p>
                <p className="mt-1 text-[12px] text-zinc-600">
                  Every bar is the same 100 people reached — only the fill changes. The longer the
                  fill, the more of them ended up put forward for a job.
                </p>

                <div className="mt-3 space-y-2.5">
                  {live.map(c => {
                    const rate = per100(c)
                    return (
                      <button key={c.key}
                              onClick={() => setDrill({ title: `Reached by ${c.label.toLowerCase()}`,
                                sub: `${c.contacted} people · ${c.engaged} ${c.engagedWord} · ${c.forwarded} later put forward`,
                                params: { kind: 'candidates', channel: c.key } })}
                              className="flex w-full cursor-pointer items-center gap-3 rounded px-1 py-1 -mx-1 text-left transition-colors hover:bg-zinc-100">
                        <span className="flex w-24 shrink-0 items-center gap-1.5 text-[12px] text-zinc-700">
                          <span className={cn('h-2 w-2 shrink-0 rounded-sm', TONES[c.key])} />
                          {c.label}
                        </span>

                        {/* One track = 100 people reached. Same length for every channel, so the
                            only thing the eye compares is how much of it fills. */}
                        <Hover style={{ flex: '1 1 0%' }} tip={<span className="flex flex-col gap-1">
                          <b className="text-zinc-900">{c.label} — {Math.round(rate)} of every 100
                            reached were put forward</b>
                          <TipRow tone={TONES[c.key]} value={c.forwarded} label="put forward" />
                          <TipRow tone="bg-zinc-100" value={c.contacted - c.forwarded} label="were not" />
                          <span className="text-zinc-500">{c.engaged} {c.engagedWord} along the way</span>
                        </span>}>
                          <span className="relative block h-7 rounded bg-zinc-100">
                            <span className={cn('absolute inset-y-0 left-0 rounded', TONES[c.key])}
                                  style={{ width: `${Math.min(rate, 100)}%` }} />
                          </span>
                        </Hover>

                        <span className={cn('w-32 shrink-0 whitespace-nowrap text-right text-[12px] tabular-nums',
                          c.key === best?.key ? 'text-teal-700' : 'text-zinc-700')}>
                          <b className="text-[16px]">{Math.round(rate)}</b> in every 100
                        </span>
                        <span className="w-36 shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums text-zinc-500">
                          {c.forwarded} from {c.contacted} reached
                        </span>
                      </button>
                    )
                  })}
                </div>

                {best && worst && best.key !== worst.key && (
                  <p className="mt-3 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
                    <b className="text-zinc-700">{best.label} converts{' '}
                    {Math.round(per100(best) / Math.max(per100(worst), 0.1))}× better than{' '}
                    {worst.label.toLowerCase()}</b> per person reached ({best.forwarded} of{' '}
                    {best.contacted} against {worst.forwarded} of {worst.contacted}) — and{' '}
                    {worst.label.toLowerCase()} is used{' '}
                    {Math.round(worst.contacted / Math.max(best.contacted, 1))}× more.
                    {thin.length > 0 && <>{' '}{thin.map(c => c.label.toLowerCase()).join(' and ')} is
                      left out of that comparison — under {MIN_SAMPLE} people is too few to rank on.</>}
                    {' '}Read it as a signal, not a verdict: recruiters choose who to ring, so the
                    call group is pre-selected for promise, and a candidate can be reached on more
                    than one channel, so these overlap.
                  </p>
                )}
              </div>
            )
          })()}
        </Block>

        {r.djc.roleDemand.length > 0 && (() => {
          const rows = r.djc.roleDemand.filter(d => d.sourced > 0)
          const sourced = rows.reduce((a, d) => a + d.sourced, 0)
          const matched = rows.reduce((a, d) => a + d.withMatch, 0)
          const fwd = rows.reduce((a, d) => a + d.forwarded, 0)
          const maxSourced = Math.max(...rows.map(d => d.sourced), 1)
          const maxJobs = Math.max(...rows.map(d => d.openJobs), 1)
          const starved = rows.filter(d => d.openJobs < 5 && d.sourced >= 5)
          const starvedPeople = starved.reduce((a, d) => a + d.sourced, 0)
          return (
            <Block title="Why so few get put forward"
                   info={<>A candidate can only be put forward if there is an open job to put them
                     forward for. "Has a live job match" is Salesforce's own matching — an open job
                     in a state the candidate wants. The jobs column is <b>every open job in
                     Proxi's Salesforce</b>, whatever client or source it came from — not just DJC
                     or Kimedics work. One column is what we source, the other is what there is to
                     fill.</>}
                   takeaway={<>Half the people we add — {sourced - matched} of {sourced} — have no
                     open job to be matched to, and only one of them has ever been put forward. The
                     ones who do have a match convert at{' '}
                     <span className="text-teal-700">
                       {matched ? Math.round((fwd / matched) * 1000) / 10 : 0}%
                     </span>. This is a targeting problem, not an effort problem.</>}>
              <div className="flex items-center gap-3 text-[10px] uppercase tracking-wide text-zinc-300">
                <span className="w-44 shrink-0" />
                <span className="grow">candidates we sourced</span>
                <span className="w-36 shrink-0 text-right">open jobs across all of Proxi</span>
                <span className="w-24 shrink-0 text-right">put forward</span>
              </div>
              <div className="mt-1.5 space-y-1.5">
                {rows.map(d => {
                  const matchPct = d.sourced ? Math.round((d.withMatch / d.sourced) * 100) : 0
                  const thin = d.openJobs < 5 && d.sourced >= 5
                  return (
                    <div key={d.role} className="flex items-center gap-3">
                      <span className={cn('w-44 shrink-0 truncate text-[12px]',
                        thin ? 'text-orange-700' : 'text-zinc-700')} title={d.role}>
                        {d.role}
                      </span>
                      <Hover tip={<span className="flex flex-col gap-1">
                        <b className="text-zinc-900">{d.role}</b>
                        <TipRow tone={LGOOD} value={d.withMatch} label={`have a live job match (${matchPct}%)`} />
                        <TipRow tone="bg-zinc-200" value={d.sourced - d.withMatch} label="have none" />
                        <span className="text-zinc-500">{d.openJobs} open jobs · {d.forwarded} put forward</span>
                        <span className="text-zinc-400">click for the candidates</span>
                      </span>}>
                        <button
                          onClick={() => setDrill({ title: `${d.role} candidates we sourced`,
                            sub: `${d.withMatch} of ${d.sourced} have a live job match`,
                            params: { kind: 'candidates', outcome: 'added', targets: d.role } })}
                          className="relative block h-5 w-full cursor-pointer rounded bg-zinc-100">
                          <span className="absolute inset-y-0 left-0 rounded bg-zinc-200"
                                style={{ width: `${(d.sourced / maxSourced) * 100}%` }} />
                          <span className={cn('absolute inset-y-0 left-0 rounded', LGOOD)}
                                style={{ width: `${(d.withMatch / maxSourced) * 100}%` }} />
                          <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-medium tabular-nums text-zinc-900/70">
                            {d.sourced}
                          </span>
                        </button>
                      </Hover>
                      <button
                        onClick={() => d.openJobs > 0 && setDrill({
                          title: `${d.role} — open jobs right now`,
                          sub: 'Every open job in Salesforce for this role, whatever the client',
                          params: { kind: 'jobs', open: '1', specialty: d.role } })}
                        className={cn('flex w-36 shrink-0 items-center justify-end gap-2',
                          d.openJobs > 0 && 'cursor-pointer')}>
                        <span className="relative block h-2 w-20 rounded-full bg-zinc-100">
                          <span className={cn('absolute inset-y-0 right-0 rounded-full',
                            thin ? LWARN : LPRIMARY)}
                                style={{ width: `${Math.max((d.openJobs / maxJobs) * 100, d.openJobs ? 4 : 0)}%` }} />
                        </span>
                        <span className={cn('w-6 text-right text-[12px] font-semibold tabular-nums',
                          thin ? 'text-orange-700' : 'text-zinc-800')}>{d.openJobs}</span>
                      </button>
                      <button
                        onClick={() => d.forwarded > 0 && setDrill({
                          title: `${d.role} — put forward for a job`,
                          sub: `${d.forwarded} of the ${d.sourced} we sourced in this role`,
                          params: { kind: 'candidates', reach: 'forwarded', targets: d.role } })}
                        className={cn('w-24 shrink-0 text-right text-[12px] font-semibold tabular-nums',
                          d.forwarded > 0 ? 'cursor-pointer text-teal-700' : 'text-zinc-300')}>
                        {d.forwarded}
                      </button>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-500">
                <Key tone={LGOOD} label="Has a live job match" />
                <Key tone="bg-zinc-200" label="No open job to match" />
                <Key tone={LWARN} label="Fewer than 5 jobs open in that role" />
              </div>
              {r.djc.competition && r.djc.competition.openJobs > 0 && (
                <div className="mt-4 rounded-lg bg-zinc-50 px-4 py-3">
                  <p className="text-[12px] leading-relaxed text-zinc-700">
                    <b className="text-zinc-900">And the jobs that do exist are already crowded.</b>{' '}
                    {r.djc.competition.candidatesWaiting.toLocaleString()} candidates are currently
                    matched to {r.djc.competition.openJobs} open jobs. The typical open job already
                    has <b className="text-zinc-900">{r.djc.competition.medianPerJob} candidates</b>{' '}
                    waiting on it; the most contested has {r.djc.competition.mostPerJob}. For the
                    people this automation added, the jobs they match carry{' '}
                    <b className="text-zinc-900">{r.djc.competition.ourAvgRivals} other candidates</b>{' '}
                    on average.
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                    That reframes the whole page: the shortage is jobs, not candidates. More sourcing
                    cannot lift placements while every open role already has a queue — the lever is
                    winning more roles, or working the matches that exist. These queue figures count
                    only candidates <b>this automation</b> sourced; Proxi's candidates from other
                    sources match the same jobs, so the real queue is longer than shown.
                  </p>
                </div>
              )}
              {starved.length > 0 && (
                <p className="mt-3 max-w-3xl text-[12px] leading-relaxed text-zinc-600">
                  <b className="text-zinc-800">{starvedPeople} of the {sourced} were sourced into roles
                  with almost nothing open</b> — {starved.map(d => `${d.role.toLowerCase()} (${d.openJobs} ${d.openJobs === 1 ? 'job' : 'jobs'})`).join(', ')}.
                  Those views buy a contact record and little else. Role is visible on the DJC list
                  card before any view is spent, so weighting the sweep toward what Proxi actually
                  has open costs nothing and would put the same budget where it can convert.
                </p>
              )}
            </Block>
          )
        })()}

        <Block title="Time saved"
               info={<>An estimate, stated as one: each task a person no longer does is costed in
                 minutes (shown at right) and multiplied by the automation's actual volumes. The
                 ~{r.djc.baselineHours}h/week baseline is Proxi's own pre-automation figure.</>}
               takeaway={<>The manual process took ~{r.djc.baselineHours} hours a week. The automation
                 now returns <span className="text-teal-700">{r.djc.hoursPerWeek} hours a week</span> —
                 not by being faster at the same list, but by reviewing far more candidates than anyone
                 did by hand.</>}>
          <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-400">Hours returned per month</p>
              <div className="mt-2 flex max-w-56 items-end gap-2">
                {r.djc.hoursMonthly.map(m => {
                  const max = Math.max(...r.djc.hoursMonthly.map(x => x.hours), 1)
                  return (
                    <div key={m.month} className="flex flex-1 flex-col items-center">
                      <span className="mb-1 text-[11px] font-semibold tabular-nums text-zinc-800">{m.hours}h</span>
                      <div className={cn('w-full rounded-t-[3px]', LGOOD)}
                           style={{ height: Math.max((m.hours / max) * 56, 2) }} />
                      <span className="mt-1 text-[10px] text-zinc-500">{monthLabel(m.month)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-400">
                Broken up by what a view actually costs a person
              </p>
              <div className="mt-2 space-y-1">
                {r.djc.timeTasks.map(t => (
                  <div key={t.label} className="flex items-baseline gap-3 text-[12px]">
                    <span className="min-w-0 truncate text-zinc-700">{t.label}</span>
                    <span className="grow border-b border-dotted border-zinc-200" />
                    <span className="shrink-0 tabular-nums text-zinc-600">{t.count.toLocaleString()} ×</span>
                    <span className="w-14 shrink-0 text-right tabular-nums text-zinc-800">{t.minutes} min</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Block>

      </section>}

      {/* ════ 03 KIMEDICS ═══════════════════════════════════════════════════ */}
      {tab === 'kim' && <section>
        <SectionHead n="03" title="Kimedics" q="Are we filling the roles that come through — and does the intake run itself?">
          <span className="font-semibold text-zinc-900">{r.kim.jobsOpened} roles opened this year</span>
          {' '}({r.kim.priorJobsOpened} by this point last year) — {r.kim.jobsForwardPct}% had a candidate
          put forward and <span className="font-semibold text-teal-700">{r.kim.jobsFilledPct}% were filled</span>.
        </SectionHead>



        <KimJobsBlock kim={r.kim} onDrill={setDrill} />
        <DurationsBlock kim={r.kim} onDrill={setDrill} />

        <Block title="Open right now — where, what, and for how long"
               info={<>Everything with status <b>Open</b> in Salesforce as of the last sync. "Waiting"
                 is how long since the job was opened.</>}
               takeaway={<>{r.kim.jobsOpenNow} jobs are open today.{' '}
                 {r.kim.openStale > 0 && <span className="text-orange-700">{r.kim.openStale} have
                 waited over 3 months — that is where clients lose patience.</span>}{' '}
                 Click any row for the raw jobs with Salesforce links.</>}>
          <div className="grid gap-x-8 gap-y-4 lg:grid-cols-3">
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-wide text-zinc-400">How long open</p>
              <div className="space-y-1">
                {r.kim.openAges.map(a => {
                  const max = Math.max(...r.kim.openAges.map(x => x.jobs), 1)
                  return (
                    <button key={a.label}
                            onClick={() => setDrill({ title: `Open ${a.label.toLowerCase()}`,
                              params: { kind: 'jobs', open: '1', ageBand: a.label } })}
                            className="group flex w-full cursor-pointer items-center gap-3 rounded px-1 py-0.5 -mx-1 transition-colors hover:bg-zinc-100">
                      <span className="w-24 shrink-0 text-left text-[12px] text-zinc-700">{a.label}</span>
                      <span className={cn('relative h-4 grow rounded', LTRACK)}>
                        <span className={cn('absolute inset-y-0 left-0 rounded',
                          a.label === 'Over 3 months' ? LWARN : LPRIMARY)}
                              style={{ width: `${Math.max((a.jobs / max) * 100, 1)}%` }} />
                      </span>
                      <span className="w-8 shrink-0 text-right text-[12px] font-semibold tabular-nums text-zinc-800">
                        {a.jobs}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            <OpenList title="By state" rows={r.kim.openByState}
                      onPick={name => setDrill({ title: `Open in ${name}`, params: { kind: 'jobs', open: '1', state: name } })} />
            <OpenList title="By role" rows={r.kim.openByType}
                      onPick={name => setDrill({ title: `Open ${name}`, params: { kind: 'jobs', open: '1', specialty: name } })} />
          </div>
        </Block>

        <DemandBlock kim={r.kim} onDrill={setDrill} />

        <WorkBlock kim={r.kim} />
      </section>}

      <DrillPanel drill={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

/* ── operational blocks ───────────────────────────────────────────────────── */

/** Four quarters in one slim strip — number, direction, done. The trend detail lives in the
 *  chart below, so this stays a scoreboard row, not another plot. */
const Q_START = ['', 'Jan', 'Apr', 'Jul', 'Oct']

const fmtSpan = () => {
  const now = new Date()
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }
  return `Jan 1 – ${now.toLocaleDateString('en-US', opts)}, ${now.getUTCFullYear()}`
}

/** The delta written the way a reader thinks: absolute first, % second. */
const deltaBits = (value: number, ref: number) => {
  const diff = value - ref
  const pct = ref ? Math.abs(Math.round((diff / ref) * 100)) : null
  return { diff, pct, up: diff >= 0 }
}

function ScoreboardBlock({ r, goals, onGoals, onDrill, opsDelta, opsPct }: {
  r: ClientReport
  goals: GoalSet
  onGoals: (g: GoalSet) => void
  onDrill: (d: Drill) => void
  opsDelta: number
  opsPct: number
}) {
  const now = new Date()
  const monthsElapsed = now.getUTCMonth() + 1
  const yearGoal = goals.year
  // "YTD goal": the yearly target prorated through the end of the current month.
  const ytdGoal = yearGoal ? Math.ceil((yearGoal * monthsElapsed) / 12) : null
  const yearPct = yearGoal ? Math.min(Math.round((r.ops.ytdPlaced / yearGoal) * 100), 100) : null
  const onPace = ytdGoal !== null ? r.ops.ytdPlaced >= ytdGoal : null

  return (
    <Block title="The scoreboard"
           takeaway="The year so far — against last year and against the goals. Each quarter carries its goal; last year sits underneath as the reference."
           info={<>Placements are counted by the <b>date they were placed</b> in Salesforce — the
             day the placement was recorded, not the day the person starts work. Contract renewals
             are not counted. "Year to date"
             is {fmtSpan()}, compared with the identical span last year. The YTD goal is the yearly
             goal spread evenly and taken through the end of the current month. Goals are entered
             here by Proxi with "Set goals".</>}
           right={<GoalsEditor goals={goals} onSaved={onGoals} />}>
      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={() => onDrill({ title: 'Placed this year', params: { kind: 'placements', ytd: '1' } })}
                className="cursor-pointer rounded-lg bg-zinc-100 px-4 py-3 text-left transition-colors hover:bg-zinc-200/70">
          <p className="text-[22px] leading-none font-semibold tabular-nums text-cyan-700">{r.ops.ytdPlaced}</p>
          <p className="mt-1.5 text-[12px] leading-snug font-medium text-zinc-700">Placements this year</p>
          <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{fmtSpan()}</p>
          <p className={cn('mt-1.5 text-[12px] font-medium tabular-nums',
            opsDelta >= 0 ? 'text-teal-700' : 'text-orange-700')}>
            {opsDelta >= 0 ? '▲' : '▼'} {opsDelta >= 0 ? '+' : ''}{opsDelta} vs {r.ops.priorYtdPlaced} last year
            <span className="font-normal opacity-75"> · {opsDelta >= 0 ? '+' : '−'}{Math.abs(opsPct)}%</span>
          </p>
        </button>
        <div className="rounded-lg bg-zinc-100 px-4 py-3">
          <p className="text-[22px] leading-none font-semibold tabular-nums text-zinc-800">{r.ops.avgPerMonth.toFixed(1)}</p>
          <p className="mt-1.5 text-[12px] leading-snug font-medium text-zinc-700">Placements a month</p>
          <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
            Average so far this year · {(r.ops.priorYtdPlaced / monthsElapsed).toFixed(1)} over the same span last year
          </p>
        </div>
      </div>

      {yearGoal ? (
        <div className="mt-3 rounded-lg bg-zinc-100 px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[12px] text-zinc-600">
              Year goal: <b className="tabular-nums text-zinc-800">{r.ops.ytdPlaced} of {yearGoal}</b>
              <span className="text-zinc-500"> · {yearPct}%</span>
            </p>
            {ytdGoal !== null && (
              <p className={cn('text-[12px] font-medium tabular-nums', onPace ? 'text-teal-700' : 'text-orange-700')}>
                YTD goal through {now.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}: {ytdGoal} —{' '}
                {onPace ? `on pace (+${r.ops.ytdPlaced - ytdGoal})` : `behind by ${ytdGoal - r.ops.ytdPlaced}`}
              </p>
            )}
          </div>
          <div className={cn('relative mt-2 h-2.5 rounded-full', LTRACK)}>
            <span className={cn('absolute inset-y-0 left-0 rounded-full', onPace === false ? LWARN : LGOOD)}
                  style={{ width: `${yearPct}%` }} />
            {ytdGoal !== null && yearGoal > 0 && (
              <Hover inline tip={<>where the year goal says we should be by now: {ytdGoal}</>}>
                <span className="absolute inset-y-[-3px] w-[2px] rounded bg-zinc-500"
                      style={{ left: `${Math.min((ytdGoal / yearGoal) * 100, 100)}%` }} />
              </Hover>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-zinc-400">
          No goals set yet — use "Set goals" above to start tracking actuals against targets.
        </p>
      )}

      <QuarterRibbon quarters={r.ops.quarters} goals={goals} onDrill={onDrill} />
    </Block>
  )
}

/** Set-goals popover — a temporary home for targets until they live somewhere official. */
function GoalsEditor({ goals, onSaved }: { goals: GoalSet; onSaved: (g: GoalSet) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<GoalSet>(goals)
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  useEffect(() => { if (!open) setDraft(goals) }, [goals, open])

  const year = new Date().getUTCFullYear()
  const setQ = (i: number, v: string) =>
    setDraft(d => ({ ...d, quarters: d.quarters.map((x, j) => j === i ? (v === '' ? null : Number(v)) : x) }))
  const setM = (i: number, v: string) =>
    setDraft(d => ({ ...d, months: d.months.map((x, j) => j === i ? (v === '' ? null : Number(v)) : x) }))
  const splitYear = () => {
    if (!draft.year) return
    const q = Math.round(draft.year / 4)
    const m = Math.round(draft.year / 12)
    setDraft(d => ({ ...d, quarters: [q, q, q, (d.year ?? 0) - q * 3], months: Array(12).fill(m).map((x, i) => i === 11 ? (d.year ?? 0) - m * 11 : x) }))
  }
  const save = async () => {
    setStatus('saving')
    try {
      const values: Record<string, number | null> = { year: draft.year }
      draft.quarters.forEach((v, i) => { values[`q${i + 1}`] = v })
      draft.months.forEach((v, i) => { values[`m${i + 1}`] = v })
      const res = await fetch('/api/reports/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, values }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error()
      onSaved(draft)
      setStatus('done')
      setTimeout(() => { setStatus('idle'); setOpen(false) }, 1200)
    } catch {
      setStatus('error')
    }
  }
  const inputCls = 'w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-[12px] tabular-nums text-zinc-800 outline-none focus:border-zinc-500'
  const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
              className={cn('rounded-lg border px-3 py-1.5 text-[12px] transition-colors',
                open ? 'border-zinc-400 text-zinc-700'
                  : 'border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700')}>
        ⚑ Set goals
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-2 w-[340px] rounded-xl border border-zinc-200 bg-white p-4 shadow-xl shadow-zinc-400/20">
            <p className="text-[13px] font-semibold text-zinc-800">Placement goals · {year}</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Fill in what you have — year only is fine. "Split evenly" spreads the year across
              quarters and months as a starting point.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <label className="w-24 shrink-0 text-[11px] text-zinc-600">Year goal</label>
              <input type="number" min={0} value={draft.year ?? ''} placeholder="e.g. 360"
                     onChange={e => setDraft(d => ({ ...d, year: e.target.value === '' ? null : Number(e.target.value) }))}
                     className={inputCls} />
              <button onClick={splitYear} disabled={!draft.year}
                      className={cn('shrink-0 rounded-md px-2 py-1 text-[11px] transition-colors',
                        draft.year ? 'text-cyan-700 hover:bg-cyan-600/10' : 'text-zinc-300')}>
                Split evenly
              </button>
            </div>
            <p className="mt-3 text-[10px] uppercase tracking-wide text-zinc-400">Quarterly</p>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {draft.quarters.map((v, i) => (
                <div key={i}>
                  <label className="text-[10px] text-zinc-500">Q{i + 1}</label>
                  <input type="number" min={0} value={v ?? ''} onChange={e => setQ(i, e.target.value)}
                         className={inputCls} />
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] uppercase tracking-wide text-zinc-400">Monthly</p>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {draft.months.map((v, i) => (
                <div key={i}>
                  <label className="text-[10px] text-zinc-500">{MONTH_ABBR[i]}</label>
                  <input type="number" min={0} value={v ?? ''} onChange={e => setM(i, e.target.value)}
                         className={inputCls} />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className={cn('min-w-0 text-[11px]',
                status === 'done' ? 'text-teal-700' : status === 'error' ? 'text-orange-700' : 'text-zinc-400')}>
                {status === 'done' ? 'Saved ✓' : status === 'error' ? 'Could not save — try again.' : 'Saved for everyone who opens the report.'}
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                <button onClick={() => setDraft(EMPTY_GOALS)}
                        title="Clear every goal — takes effect when you save"
                        className="rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
                  Reset
                </button>
                <button onClick={save} disabled={status === 'saving'}
                        className={cn('rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors',
                          status === 'saving' ? 'bg-zinc-100 text-zinc-400' : 'bg-cyan-700 text-white hover:bg-cyan-600')}>
                  {status === 'saving' ? 'Saving…' : 'Save goals'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function QuarterRibbon({ quarters, goals, onDrill }: {
  quarters: ClientReport['ops']['quarters']
  goals: GoalSet
  onDrill: (d: Drill) => void
}) {
  // Always the current year's four quarters — the ones that have not started yet sit greyed out.
  const now = new Date()
  const yy = String(now.getUTCFullYear()).slice(2)
  const currentQ = Math.floor(now.getUTCMonth() / 3) + 1
  const cells = [1, 2, 3, 4].map(n => {
    const label = `Q${n} ${yy}`
    return { label, n, q: quarters.find(x => x.label === label) ?? null,
      goal: goals.quarters[n - 1], future: n > currentQ }
  })
  return (
    <div className="mt-3 flex flex-wrap divide-x divide-zinc-200 overflow-hidden rounded-lg bg-zinc-50">
      {cells.map(c => {
        if (c.future || !c.q) {
          return (
            <div key={c.label} className="min-w-32 flex-1 px-4 py-2.5 opacity-60">
              <p className="text-[10px] text-zinc-500">{c.label}</p>
              <p className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-[19px] leading-none font-semibold text-zinc-400">—</span>
                <span className="text-[11px] text-zinc-400">
                  {c.goal ? `goal ${c.goal} · ` : ''}starts {Q_START[c.n]}
                </span>
              </p>
            </div>
          )
        }
        const q = c.q
        const partial = c.n === currentQ
        // Goals are the primary comparison once they exist; last year moves to the quiet line below.
        const ref = c.goal ?? q.prior
        const refWord = c.goal !== null && c.goal !== undefined ? `goal ${c.goal}` : `${q.prior} last year`
        const d = ref !== null && ref !== undefined ? deltaBits(q.placed, ref) : null
        return (
          <button key={c.label}
                  onClick={() => {
                    const range = quarterRange(q.label)
                    if (range) onDrill({ title: `Placed in ${q.label}`,
                      params: { kind: 'placements', ...range } })
                  }}
                  className="min-w-32 flex-1 cursor-pointer px-4 py-2.5 text-left transition-colors hover:bg-zinc-100">
            <p className="text-[10px] text-zinc-500">
              {c.label}{partial && <span className="text-zinc-400"> · so far</span>}
            </p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-[19px] leading-none font-semibold tabular-nums text-zinc-900">{q.placed}</span>
              {d && (
                <span className={cn('text-[11px] font-medium tabular-nums',
                  partial ? 'text-zinc-500' : d.up ? 'text-teal-700' : 'text-orange-700')}>
                  {d.up ? '▲' : '▼'} {d.up ? '+' : ''}{d.diff} vs {refWord}
                  {d.pct !== null && <span className="font-normal opacity-70"> · {d.pct}%</span>}
                </span>
              )}
            </p>
            {c.goal !== null && c.goal !== undefined && q.prior !== null && (
              <p className="mt-0.5 text-[10px] tabular-nums text-zinc-400">last year {q.prior}</p>
            )}
          </button>
        )
      })}
    </div>
  )
}

function OpsTrendBlock({ monthly, quarters, goals, onDrill }: {
  monthly: ClientReport['ops']['monthly']
  quarters: ClientReport['ops']['quarters']
  goals: GoalSet
  onDrill: (d: Drill) => void
}) {
  const [view, setView] = useState<'monthly' | 'quarterly'>('monthly')
  // No comparison until Proxi has entered goals — then the goal becomes the default reference.
  const [refMode, setRefMode] = useState<'none' | 'lastYear' | 'goal' | null>(null)
  const hasMonthGoals = goals.months.some(m => m !== null)
  const hasQuarterGoals = goals.quarters.some(q => q !== null)
  const goalsAvailable = view === 'monthly' ? hasMonthGoals : hasQuarterGoals
  const mode: 'none' | 'lastYear' | 'goal' =
    refMode !== null ? (refMode === 'goal' && !goalsAvailable ? 'lastYear' : refMode)
      : goalsAvailable ? 'goal' : 'none'

  const cols = view === 'monthly'
    ? monthly.map((m, i, a) => {
        const mi = Number(m.month.slice(5)) - 1
        return {
          key: m.month,
          label: monthLabel(m.month),
          value: m.placed,
          ref: mode === 'goal' ? goals.months[mi] : mode === 'lastYear' ? m.prior : null,
          refWord: mode === 'goal' ? 'goal' : 'last year',
          partial: i === a.length - 1,
          drill: { title: `Placed in ${monthLabel(m.month)}`,
            params: { kind: 'placements', month: m.month } } as NonNullable<Drill>,
        }
      })
    : quarters.map((q, i, a) => {
        const range = quarterRange(q.label)
        const qi = Number(q.label.slice(1, 2)) - 1
        return {
          key: q.label,
          label: q.label,
          value: q.placed,
          ref: mode === 'goal' ? goals.quarters[qi] : mode === 'lastYear' ? q.prior : null,
          refWord: mode === 'goal' ? 'goal' : 'last year',
          partial: i === a.length - 1,
          drill: { title: `Placed in ${q.label}`,
            params: { kind: 'placements', ...(range ?? {}) } } as NonNullable<Drill>,
        }
      })
  const max = Math.max(...cols.map(c => Math.max(c.value, c.ref ?? 0)), 1)

  return (
    <Block title="Placements over time"
           info={<>Each bar counts placements by the month or quarter they were <b>placed</b> —
             recorded in Salesforce, whether or not the person has started yet. Contract renewals
             are not counted.
             The slim grey bar is the reference — the same period last year, or the goal if you
             switch the toggle. Underneath: the gap in actual placements first, then the %.</>}
           takeaway={mode === 'goal'
             ? 'Wide bar = placements, slim grey bar = the goal for that period. Underneath: how far ahead or behind the goal. Click for who was placed.'
             : mode === 'lastYear'
             ? 'Wide bar = this year, slim grey bar = the same period last year. Underneath: the gap in placements, then the %. Click for who was placed.'
             : 'Placements by period. Add a comparison with the toggle — last year, or the goals once they are set. Click for who was placed.'}
           right={<div className="flex items-center gap-2">
             <Chips value={mode} onChange={v => setRefMode(v as 'none' | 'lastYear' | 'goal')} options={[
               { key: 'none', label: 'None' },
               { key: 'lastYear', label: 'vs last year' },
               ...(goalsAvailable ? [{ key: 'goal', label: 'vs goal' }] : []),
             ]} />
             <Chips value={view} onChange={v => setView(v as typeof view)} options={[
               { key: 'monthly', label: 'Monthly' },
               { key: 'quarterly', label: 'Quarterly' },
             ]} />
           </div>}>
      <div className="flex items-end gap-3">
        {cols.map(c => {
          const has = c.ref !== null && c.ref !== undefined
          const d = has ? deltaBits(c.value, c.ref as number) : null
          const tone = c.partial || !d ? 'text-zinc-400' : d.up ? 'text-teal-700' : 'text-orange-700'
          const barTone = mode === 'none' ? LPRIMARY : d && d.up ? LGOOD : d ? LWARN : LNEUTRAL
          return (
            <button key={c.key}
                    onClick={() => onDrill(c.drill)}
                    className="flex flex-1 cursor-pointer flex-col items-center rounded px-0.5 pt-1 transition-colors hover:bg-zinc-100">
              <span className="mb-1.5 text-[12px] font-semibold tabular-nums text-zinc-900">{c.value}</span>
              <div className="flex w-full items-end justify-center gap-1" style={{ height: 88 }}>
                <div className={cn('w-[58%] rounded-t-[3px]',
                  c.partial ? 'border border-dashed !bg-transparent border-slate-400/50' : barTone)}
                     style={{ height: Math.max((c.value / max) * 88, 2) }} />
                {has && (
                  <div className={cn('w-[20%] rounded-t-[3px]', LREF)}
                       style={{ height: Math.max(((c.ref as number) / max) * 88, 2) }} />
                )}
              </div>
              <div className="mt-1 h-px w-full bg-zinc-300" />
              <span className="mt-1.5 text-[10px] text-zinc-500">
                {c.label}{c.partial && <span className="text-zinc-400"> so far</span>}
              </span>
              {mode !== 'none' && (
                <span className={cn('mt-0.5 whitespace-nowrap text-[11px] font-medium tabular-nums', tone)}>
                  {!has ? (mode === 'goal' ? 'no goal set' : '—')
                    : c.ref === 0 ? 'new'
                    : <>{d!.up ? '▲' : '▼'} {d!.up ? '+' : ''}{d!.diff} vs {c.ref}
                      {d!.pct !== null && <span className="font-normal opacity-70"> · {d!.pct}%</span>}</>}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {mode === 'goal' && (
        <p className="mt-2 text-[11px] text-zinc-400">Reference bar = the goal Proxi set for that period.</p>
      )}
    </Block>
  )
}

type PipeView = 'monthly' | 'quarterly' | 'ytd' | 'all' | 'groups'

function PipelineBlock({ pipe, onDrill }: {
  pipe: ClientReport['ops']['pipeline']
  onDrill: (d: Drill) => void
}) {
  const [view, setView] = useState<PipeView>('monthly')
  const neverSubmitted = pipe.pairs ? Math.round(((pipe.pairs - pipe.submitted) / pipe.pairs) * 100) : 0
  const eff = (s: { pairs: number; placed: number }) =>
    s.pairs ? Math.round((s.placed / s.pairs) * 100) : 0
  const [period, setPeriod] = useState<'all' | 'ytd' | 'month'>('all')
  const [gSort, onGSort] = useSort('placed')
  const scoped = (rows: typeof pipe.byState) => sortRows(
    rows.map(r => ({ label: r.label, ...r[period] })).filter(r => r.pairs > 0),
    gSort,
    (r, k) => k === 'label' ? r.label : k === 'eff' ? eff(r) * 1000 + r.pairs
      : r[k as 'pairs' | 'submitted' | 'placed'])
  const stateRows = scoped(pipe.byState)
  const clientRows = scoped(pipe.byClient)
  const now = new Date()
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const periodParams: Record<string, string> =
    period === 'ytd' ? { fromMonth: `${now.getUTCFullYear()}-01` }
      : period === 'month' ? { month: thisMonth } : {}
  const periodLabel = period === 'ytd' ? ' — this year' : period === 'month' ? ' — this month' : ''
  const periodChips = (
    <div className="mb-2 flex justify-end">
      <Chips value={period} onChange={v => setPeriod(v as typeof period)} options={[
        { key: 'all', label: 'All time' },
        { key: 'ytd', label: 'This year' },
        { key: 'month', label: 'This month' },
      ]} />
    </div>
  )

  const bars = (rows: { label: string; n: number; tone: string; stage: string; ytd?: boolean; renewals?: number }[], base: number) => (
    <div className="space-y-1.5">
      {rows.map(s => (
        <button key={s.label}
                onClick={() => onDrill({ title: `${s.label}${s.ytd ? ' — this year' : ''}`,
                  params: { kind: 'applications', stage: s.stage,
                    ...(s.ytd ? { fromMonth: `${new Date().getUTCFullYear()}-01` } : {}) } })}
                className="flex w-full cursor-pointer items-center gap-3 rounded px-1 py-0.5 -mx-1 transition-colors hover:bg-zinc-100">
          <span className="w-40 shrink-0 text-left text-[12px] text-zinc-700">{s.label}</span>
          <span className={cn('relative h-4 grow rounded', LTRACK)}>
            <span className={cn('absolute inset-y-0 left-0 rounded', s.tone)}
                  style={{ width: `${Math.max((s.n / (base || 1)) * 100, 1)}%` }} />
            {/* contract renewals: the tail of the placed bar, in violet */}
            {(s.renewals ?? 0) > 0 && (
              <span className={cn('absolute inset-y-0 rounded-r', LRENEW)}
                    style={{
                      left: `${Math.max(((s.n - (s.renewals ?? 0)) / (base || 1)) * 100, 0)}%`,
                      width: `${((s.renewals ?? 0) / (base || 1)) * 100}%`,
                    }} />
            )}
          </span>
          <span className="w-24 shrink-0 text-right text-[12px] font-semibold tabular-nums text-zinc-900">
            {s.n.toLocaleString()}
            <span className="ml-1 text-[10px] font-normal text-zinc-400">
              {Math.round((s.n / (base || 1)) * 100)}%
            </span>
          </span>
        </button>
      ))}
    </div>
  )

  const periodRows = (slices: typeof pipe.monthly, labelFn: (l: string) => string) => {
    const max = Math.max(...slices.map(s => s.pairs), 1)
    return (
      <div className="space-y-1.5">
        {slices.map(s => (
          <button key={s.label}
                  onClick={() => {
                    const range = quarterRange(s.label)
                    onDrill({ title: `Put forward in ${labelFn(s.label)}`,
                      params: { kind: 'applications', stage: 'all',
                        ...(range ?? { month: s.label }) } })
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 rounded px-1 py-0.5 -mx-1 transition-colors hover:bg-zinc-100">
            <span className="w-16 shrink-0 text-left text-[12px] text-zinc-600">{labelFn(s.label)}</span>
            <Hover tip={<span className="flex flex-col gap-1">
              <b className="text-zinc-900">{labelFn(s.label)} — {eff(s)}% effectiveness</b>
              <TipRow tone="bg-sky-300/50" value={s.pairs} label="put forward" />
              <TipRow tone="bg-cyan-700" value={s.submitted} label="reached submittal" />
              <TipRow tone={LGOOD} value={s.placed} label="placed" />
              {s.renewals > 0 && (
                <TipRow tone={LRENEW} value={s.renewals}
                        label={`contract renewal${s.renewals === 1 ? '' : 's'}`} />
              )}
            </span>}>
              <span className={cn('relative block h-5 rounded', LTRACK)}>
                <span className="absolute inset-y-0 left-0 rounded bg-sky-300/50"
                      style={{ width: `${Math.max((s.pairs / max) * 100, 1)}%` }} />
                <span className={cn('absolute inset-y-1 left-0 rounded-sm', LGOOD)}
                      style={{ width: `${(s.placed / max) * 100}%` }} />
                {s.renewals > 0 && (
                  <span className={cn('absolute inset-y-1 rounded-sm', LRENEW)}
                        style={{ left: `${((s.placed - s.renewals) / max) * 100}%`,
                          width: `${(s.renewals / max) * 100}%` }} />
                )}
                {s.submitted > 0 && (
                  <span className="absolute inset-y-0 w-[2px] rounded-full bg-cyan-700"
                        style={{ left: `${(s.submitted / max) * 100}%` }} />
                )}
              </span>
            </Hover>
            <span className="w-60 shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums text-zinc-500">
              {s.pairs} fwd · {s.submitted} sub ·{' '}
              <span className="text-teal-700">{s.placed} placed</span>
              {s.renewals > 0 && <span className="text-violet-700"> ({s.renewals}R)</span>}{' '}
              <span className={cn('font-medium', eff(s) >= 20 ? 'text-teal-700' : 'text-zinc-500')}>
                · {eff(s)}%
              </span>
            </span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <Block title="The pipeline" source="counted from job applications"
           info={<>Built from <b>job applications</b> in Salesforce. One row = one candidate put
             forward for one specific job, so a busy candidate appears several times.
             "Submitted" = the application reached the submittal step; "placed" = it ended in a
             placement. The violet portion of placed are <b>contract renewals</b> — an existing
             placement re-signed, not a new hire. Effectiveness = placed ÷ put forward.</>}
           takeaway={<>Counted from job applications: {pipe.pairs.toLocaleString()} times a candidate
             was put forward, covering {pipe.people.toLocaleString()} people across{' '}
             {pipe.jobs.toLocaleString()} jobs.{' '}
             <span className="text-orange-700">{neverSubmitted}% never reach submittal</span> —
             matched to a job but never presented to the client — and of those submitted,{' '}
             {pipe.submitted ? Math.round(((pipe.submitted - pipe.placed) / pipe.submitted) * 100) : 0}%
             never convert to a placement.</>}
           right={<Chips value={view} onChange={v => setView(v as PipeView)} options={[
             { key: 'monthly', label: 'Monthly' },
             { key: 'quarterly', label: 'Quarterly' },
             { key: 'ytd', label: 'This year' },
             { key: 'all', label: 'All time' },
             { key: 'groups', label: 'By state & client' },
           ]} />}>
      {pipe.seasonality && pipe.seasonality.yearsAgreeing === pipe.seasonality.years
        && pipe.seasonality.years >= 3 && (
        <p className="mb-3 rounded-lg bg-zinc-50 px-3 py-2 text-[12px] leading-relaxed text-zinc-600">
          <span className="font-medium text-zinc-800">When a candidate goes forward matters.</span>{' '}
          Of everyone put forward in {pipe.seasonality.best.month},{' '}
          <span className="font-medium text-teal-700">{pipe.seasonality.best.pct}% ended up placed</span>;
          in {pipe.seasonality.worst.month} it was {pipe.seasonality.worst.pct}%, against a{' '}
          {pipe.seasonality.avgPct}% average — and {pipe.seasonality.best.month} beat{' '}
          {pipe.seasonality.worst.month} in all {pipe.seasonality.years} years we can measure.
          <InfoDot>Cohorts are grouped by the month the candidate was put forward, from 2023
            onward, and stop three months before today so a young cohort is not counted as a
            failure for simply not having resolved yet. Only months with at least 60 candidates
            qualify. This is about <b>conversion</b>, not demand — the number of jobs and
            placements shows no seasonal pattern worth reporting: the same calendar month varies
            far more between years than months vary from each other.</InfoDot>
        </p>
      )}
      {view === 'all' && (
        <>
          {bars([
            { label: 'Put forward for a job', n: pipe.pairs, tone: LPRIMARY, stage: 'all' },
            { label: 'Reached submittal', n: pipe.submitted, tone: LPRIMARY, stage: 'submitted' },
            { label: 'Placed', n: pipe.placed, tone: LGOOD, stage: 'placed', renewals: pipe.renewals },
          ], pipe.pairs)}
          {pipe.renewals > 0 && (
            <p className="mt-2 text-[11px] text-zinc-500">
              <span className={cn('mr-1 inline-block h-2 w-3 rounded-sm align-middle', LRENEW)} />
              {pipe.renewals} of the {pipe.placed.toLocaleString()} placements are contract renewals —
              an existing placement re-signed, not a new hire.
            </p>
          )}
        </>
      )}

      {view === 'ytd' && (
        <>
          {bars([
            { label: 'Put forward for a job', n: pipe.ytd.pairs, tone: LPRIMARY, stage: 'all', ytd: true },
            { label: 'Reached submittal', n: pipe.ytd.submitted, tone: LPRIMARY, stage: 'submitted', ytd: true },
            { label: 'Placed', n: pipe.ytd.placed, tone: LGOOD, stage: 'placed', ytd: true, renewals: pipe.ytd.renewals },
          ], pipe.ytd.pairs)}
          <p className="mt-2.5 text-[12px] leading-relaxed text-zinc-600">
            Same span last year: {pipe.priorYtd.pairs.toLocaleString()} put forward,{' '}
            {pipe.priorYtd.submitted.toLocaleString()} submitted, {pipe.priorYtd.placed} placed —{' '}
            {(['pairs', 'placed'] as const).map((k, i) => {
              const now = pipe.ytd[k], then = pipe.priorYtd[k]
              const up = now >= then
              return (
                <span key={k}>
                  {i > 0 && ' · '}
                  <span className={up ? 'text-teal-700' : 'text-orange-700'}>
                    {k === 'pairs' ? 'volume' : 'placements'} {up ? 'up' : 'down'}{' '}
                    {then ? Math.abs(Math.round(((now - then) / then) * 100)) : 0}%
                  </span>
                </span>
              )
            })}.
          </p>
        </>
      )}

      {view === 'monthly' && (
        <>
          {periodRows(pipe.monthly, monthLabelSafe)}
          <PipeLegend />
          <p className="mt-1.5 text-[11px] text-zinc-400">
            Recent months understate placements — those pairs are still in flight.
          </p>
        </>
      )}

      {view === 'quarterly' && (
        <>
          {periodRows(pipe.quarterly, l => l)}
          <PipeLegend />
          <p className="mt-1.5 text-[11px] text-zinc-400">
            The % is effectiveness — placed out of everyone put forward that quarter.
          </p>
        </>
      )}

      {view === 'groups' && (
        <>
        {periodChips}
        <div className="grid gap-4 xl:grid-cols-2">
        <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-200">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-400">
                <Th k="label" label="Client" sort={gSort} onSort={onGSort} left />
                <Th k="pairs" label="Put forward" sort={gSort} onSort={onGSort} />
                <Th k="submitted" label="Submitted" sort={gSort} onSort={onGSort} />
                <Th k="placed" label="Placed" sort={gSort} onSort={onGSort} />
                <th className="py-1.5 pr-3 text-right font-medium">
                  <Hover tip={<>Effectiveness: of everyone put forward for this client's jobs, the
                    share that ended up placed. Click to sort.</>}>
                    <button onClick={() => onGSort('eff')}
                            className={cn('cursor-pointer border-b border-dotted border-zinc-400 uppercase tracking-wide',
                              gSort.key === 'eff' ? 'text-zinc-700' : 'text-zinc-400')}>
                      eff.{gSort.key === 'eff' && (gSort.desc ? ' ▼' : ' ▲')}
                    </button>
                  </Hover>
                </th>
              </tr>
            </thead>
            <tbody>
              {clientRows.map(c => (
                <tr key={c.label}
                    className="cursor-pointer border-t border-zinc-200 transition-colors hover:bg-zinc-100"
                    onClick={() => onDrill({ title: `Pipeline — ${c.label}${periodLabel}`,
                      params: { kind: 'applications', stage: 'all', client: c.label, ...periodParams } })}>
                  <td className="max-w-52 truncate px-3 py-1.5 text-zinc-800" title={c.label}>{c.label}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-700">{c.pairs}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-600">{c.submitted}</td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-teal-700">
                    {c.placed}{c.renewals > 0 && <span className="ml-1 font-normal text-violet-700" title="contract renewals">({c.renewals}R)</span>}
                  </td>
                  <td className={cn('py-1.5 pr-3 text-right tabular-nums',
                    eff(c) >= 20 ? 'text-teal-700' : 'text-zinc-500')}>{eff(c)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-200">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-400">
                <Th k="label" label="Job state" sort={gSort} onSort={onGSort} left />
                <Th k="pairs" label="Put forward" sort={gSort} onSort={onGSort} />
                <Th k="submitted" label="Submitted" sort={gSort} onSort={onGSort} />
                <Th k="placed" label="Placed" sort={gSort} onSort={onGSort} />
                <th className="py-1.5 pr-3 text-right font-medium">
                  <Hover tip={<>Effectiveness: of everyone put forward for a job in this state, the
                    share that ended up placed. High volume + low eff. = effort leaking; low volume +
                    high eff. = room to push more candidates there. Click to sort.</>}>
                    <button onClick={() => onGSort('eff')}
                            className={cn('cursor-pointer border-b border-dotted border-zinc-400 uppercase tracking-wide',
                              gSort.key === 'eff' ? 'text-zinc-700' : 'text-zinc-400')}>
                      eff.{gSort.key === 'eff' && (gSort.desc ? ' ▼' : ' ▲')}
                    </button>
                  </Hover>
                </th>
              </tr>
            </thead>
            <tbody>
              {stateRows.map(s => (
                <tr key={s.label}
                    className="cursor-pointer border-t border-zinc-200 transition-colors hover:bg-zinc-100"
                    onClick={() => onDrill({ title: `Pipeline in ${s.label}${periodLabel}`,
                      params: { kind: 'applications', stage: 'all', state: s.label, ...periodParams } })}>
                  <td className="px-3 py-1.5 text-zinc-800">{s.label}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-700">{s.pairs}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-600">{s.submitted}</td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-teal-700">
                    {s.placed}{s.renewals > 0 && <span className="ml-1 font-normal text-violet-700" title="contract renewals">({s.renewals}R)</span>}
                  </td>
                  <td className={cn('py-1.5 pr-3 text-right tabular-nums',
                    eff(s) >= 20 ? 'text-teal-700' : 'text-zinc-500')}>{eff(s)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
        </>
      )}
    </Block>
  )
}

/** "Q2 26" → its first and last month, for period drills. */
const quarterRange = (label: string): { fromMonth: string; toMonth: string } | null => {
  const m = label.match(/^Q([1-4]) (\d{2})$/)
  if (!m) return null
  const q = Number(m[1]); const y = 2000 + Number(m[2])
  return {
    fromMonth: `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}`,
    toMonth: `${y}-${String(q * 3).padStart(2, '0')}`,
  }
}

/** Swatch legend for the pipeline period bars — actual colors, not words about colors. */
function PipeLegend() {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-zinc-500">
      <Key tone="bg-sky-300/50" label="Put forward" />
      <Key tone={LGOOD} label="Placed" />
      <Key tone={LRENEW} label="Contract renewal" />
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-[2px] rounded-full bg-cyan-700" /> reached submittal
      </span>
    </div>
  )
}

const monthLabelSafe = (l: string) =>
  /^\d{4}-\d{2}$/.test(l)
    ? new Date(l + '-02').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
    : l

function SupplyBlock({ supply, onDrill }: {
  supply: ClientReport['ops']['supply']
  onDrill: (d: Drill) => void
}) {
  const [stateView, setStateView] = useState<'map' | 'table'>('map')
  const [supSort, onSupSort] = useSort('openJobs')
  const supplyByName = new Map(supply.byState.map(x => [x.state, x]))
  const maxOpen = Math.max(...supply.byState.map(x => x.openJobs), 1)
  const unmapped = supply.byState.filter(x => !STATE_TILES[x.state] && x.openJobs > 0)
  const fill = (n: number) =>
    n === 0 ? 'bg-zinc-100'
      : n <= maxOpen * 0.2 ? 'bg-cyan-600/25'
      : n <= maxOpen * 0.45 ? 'bg-cyan-500/65'
      : n <= maxOpen * 0.75 ? 'bg-cyan-400/65'
      : 'bg-cyan-300/85'
  return (
    <Block title="Supply vs demand — the open jobs and who we have for them"
           source="live counts, right now"
           info={<>Three different populations, deliberately — and they are not the same universe,
             which matters for reading the verdicts. <b>Open jobs</b> = status Open in Salesforce as
             of the last daily sync, across all of Proxi's clients and sources. <b>Candidates</b> =
             only those <b>this DJC automation has sourced</b>: active on DJC in the last 90 days,
             never placed by Proxi, holding a live Salesforce match to an open job in that state
             (matches follow the candidate's preferred states — not distance). Candidates Proxi has
             from Indeed, LinkedIn, referrals or its legacy book are <b>not</b> counted here, so a
             "sourcing gap" means a gap in what DJC has produced for that state, not necessarily
             that Proxi has nobody. <b>Proxi placements ever</b> = every placement Proxi has made in
             that state across all years and all sources — a track record, not a subset of today's
             pool, which is why it can exceed the candidate count.</>}
           takeaway="Where the open demand sits, and whether there are candidates nearby to meet it. Hover a state for the verdict, click for the raw jobs.">
      <div className="grid grid-cols-2 gap-3">
        <Stat value={String(supply.openNow)}
              label="Jobs open right now"
              sub={`${supply.openUnfilled} still need somebody`} tone="text-cyan-700"
              onClick={() => onDrill({ title: 'Open right now', params: { kind: 'jobs', open: '1' } })} />
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-400">
            Open jobs vs DJC-sourced candidates available in that state
          </p>
          <Chips value={stateView} onChange={v => setStateView(v as typeof stateView)} options={[
            { key: 'map', label: 'Map' },
            { key: 'table', label: 'Table' },
          ]} />
        </div>

        {stateView === 'map' && (
          <>
            <div className="mx-auto grid w-fit gap-1"
                 style={{ gridTemplateColumns: 'repeat(11, minmax(0, 1fr))' }}>
              {Object.entries(STATE_TILES).map(([name, [abbr, col, row]]) => {
                const d = supplyByName.get(name)
                const open = d?.openJobs ?? 0
                const cands = d?.candidates ?? 0
                const placedBefore = d?.everPlaced ?? 0
                const gap = open > 0 && cands === 0
                const thin = open > 0 && cands > 0 && cands < open
                return (
                  <Hover key={abbr} block
                         style={{ gridColumnStart: col + 1, gridRowStart: row + 1 }}
                         tip={<>
                           <b className="text-zinc-900">{name}</b><br />
                           {open === 0 ? 'no open jobs' : <>{open} open job{open === 1 ? '' : 's'} ·{' '}
                             <span className={gap ? 'text-orange-700' : 'text-teal-700'}>{cands} candidate{cands === 1 ? '' : 's'} available</span></>}<br />
                           {placedBefore > 0
                             ? <span className="text-zinc-600">Proxi has made {placedBefore} placement{placedBefore === 1 ? '' : 's'} here over the years</span>
                             : open > 0 && <span className="text-orange-700">Proxi has never placed anyone here</span>}
                           {gap && <><br /><span className="text-orange-700">sourcing gap — jobs but nobody to send</span></>}
                           {thin && <><br /><span className="text-amber-700/90">supply is thin — fewer candidates than jobs</span></>}
                           {open > 0 && !gap && !thin && <><br /><span className="text-teal-700">covered — more candidates than jobs</span></>}
                           {open > 0 && <><br /><span className="text-zinc-500">click for the open jobs</span></>}
                         </>}>
                    <button
                      onClick={() => open > 0 && onDrill({ title: `Open in ${name}`,
                        params: { kind: 'jobs', open: '1', state: name } })}
                      className={cn(
                        'flex h-11 w-11 flex-col items-center justify-center rounded-[5px] border-b-2 transition-transform',
                        fill(open),
                        open > 0 ? 'cursor-pointer hover:scale-110' : 'cursor-default',
                        gap ? 'border-orange-400/80' : thin ? 'border-amber-300/70'
                          : open > 0 ? 'border-teal-300/80' : 'border-transparent',
                      )}>
                      <span className={cn('text-[10px] font-semibold leading-none',
                        open > maxOpen * 0.45 ? 'text-zinc-950' : 'text-zinc-600')}>{abbr}</span>
                      <span className={cn('mt-0.5 text-[11px] font-bold leading-none tabular-nums',
                        open === 0 ? 'text-zinc-400' : open > maxOpen * 0.45 ? 'text-zinc-950' : 'text-zinc-900')}>
                        {open || '·'}
                      </span>
                    </button>
                  </Hover>
                )
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1.5">
                {['bg-zinc-100', 'bg-cyan-600/25', 'bg-cyan-500/65', 'bg-cyan-400/65', 'bg-cyan-300/85'].map(c => (
                  <span key={c} className={cn('h-3 w-3 rounded-sm', c)} />
                ))}
                fewer → more open jobs
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded bg-teal-300/80" /> covered
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded bg-amber-300/70" /> supply thin
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded bg-orange-400/80" /> sourcing gap
              </span>
              {unmapped.length > 0 && (
                <span>+ {unmapped.map(u => `${u.state} (${u.openJobs})`).join(' · ')}</span>
              )}
            </div>
          </>
        )}

        {stateView === 'table' && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-200">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-400">
                <Th k="state" label="State" sort={supSort} onSort={onSupSort} left />
                <Th k="openJobs" label="Open jobs" sort={supSort} onSort={onSupSort} />
                <Th k="candidates" label="Candidates" sort={supSort} onSort={onSupSort} />
                <Th k="everPlaced" label="Proxi placements ever" sort={supSort} onSort={onSupSort}
                    title="All placements Proxi has ever made in this state — any candidate, any year. NOT limited to today's candidate pool, so it can exceed the candidates column." />
              </tr>
            </thead>
            <tbody>
              {sortRows(supply.byState, supSort,
                (r, k) => r[k as keyof typeof r]).map(s => (
                <tr key={s.state} className="cursor-pointer border-t border-zinc-200 transition-colors hover:bg-zinc-100"
                    onClick={() => onDrill({ title: `Open in ${s.state}`, params: { kind: 'jobs', open: '1', state: s.state } })}>
                  <td className="px-3 py-1.5 text-zinc-800">{s.state}</td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-zinc-900">{s.openJobs}</td>
                  <td className={cn('py-1.5 pr-3 text-right tabular-nums',
                    s.candidates === 0 ? 'text-orange-700' : 'text-teal-700 underline decoration-dotted underline-offset-2')}
                      onClick={e => {
                        if (s.candidates === 0) return
                        e.stopPropagation()
                        onDrill({ title: `Available candidates — ${s.state}`,
                          params: { kind: 'candidates', activeState: s.state } })
                      }}>{s.candidates}</td>
                  <td className={cn('py-1.5 pr-3 text-right tabular-nums',
                    s.everPlaced === 0 ? 'text-orange-700' : 'text-zinc-600')}>
                    {s.everPlaced === 0 ? 'never' : s.everPlaced}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        <p className="mt-1.5 text-[11px] text-zinc-400">
          Candidates = active on DJC in the last 90 days, never placed by Proxi, with a live
          Salesforce match to an open job in that state. "Proxi placements ever" is the state's
          all-time track record — any candidate, any year — not a count within today's pool.
        </p>
      </div>
    </Block>
  )
}

/* ── DJC blocks ───────────────────────────────────────────────────────────── */

function BudgetBlock({ djc, onDrill }: {
  djc: ClientReport['djc']
  onDrill: (d: Drill) => void
}) {
  const [scope, setScope] = useState<'cycle' | 'all'>('cycle')
  const currentCycleStart = djc.cycles[djc.cycles.length - 1]?.start
  const cycleParams: Record<string, string> = scope === 'cycle' && currentCycleStart
    ? { from: currentCycleStart, basis: 'event' } : {}
  const scopeLabel = scope === 'cycle' ? 'this cycle' : 'all time'
  const [cycleView, setCycleView] = useState<'chart' | 'table'>('chart')
  const [cSort, onCSort] = useSort('start', false)
  const over = djc.cycleUsed - djc.cycleCap
  const allOver = djc.allTime.viewsUsed - djc.allTime.viewsCap

  const tiles = scope === 'cycle'
    ? {
        used: djc.cycleUsed, cap: djc.cycleCap, over,
        unique: djc.cycleUnique, added: djc.cycleAdded, already: djc.cycleAlready,
        noContact: djc.cycleNoContact, other: djc.cycleOther,
        uniqueLabel: 'Candidates reviewed', uniqueNote: 'This cycle',
      }
    : {
        used: djc.allTime.viewsUsed, cap: djc.allTime.viewsCap, over: allOver,
        unique: djc.allTime.unique, added: djc.allTime.added, already: djc.allTime.already,
        noContact: djc.allTime.noContact, other: djc.allTime.other,
        uniqueLabel: 'Candidates reviewed', uniqueNote: 'Unique people, all time',
      }

  const cycleDate = (s: string) =>
    new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

  // Every band is a named cause. The grey used to be one anonymous block that quietly absorbed
  // our own bulk job and made it look like the client's team was burning the allowance.
  const SEGMENTS = [
    { key: 'added' as const, label: 'views that became a contact', tone: LGOOD },
    { key: 'already' as const, label: 'views spent before we knew it was a duplicate', tone: LPRIMARY },
    { key: 'noContact' as const, label: 'views that found no contact', tone: LWARN },
    { key: 'bulkUnlogged' as const, label: 'one-off facts pass (22 Jul)', tone: LACCENT },
    { key: 'beforeTracking' as const, label: 'spent before tracking began', tone: 'bg-zinc-300' },
    { key: 'other' as const, label: 'unaccounted', tone: LNEUTRAL },
  ]
  const maxCycle = Math.max(...djc.cycles.map(c => Math.max(c.used, c.cap)), 1)
  const COL_H = 132

  return (
    <Block title="The view budget"
           info={<>Views come from DJC's own counter — a 750-view monthly allowance refilling on
             the 15th; each view is one candidate profile opened. The bars split that counter by who
             spent it. The automation's own share is the profiles it opened; within that, "added" =
             a new Salesforce contact, "already in SF" = a duplicate it only discovered after
             opening, "no contact found" = no usable phone or email anywhere. The remainder is
             counter movement the <b>scheduled runs did not log per profile</b>. Most of it is
             accounted for: a one-off pass on 22 July re-opened about 1,270 already-known profiles
             to collect experience and education details, and that job recorded nothing per profile,
             so its spend lands here. Anyone browsing DJC by hand on the shared login would also
             land here — but Salesforce shows only about 2 DJC candidates added by hand in July
             against 270 by the automation, so hand browsing is not what moved this counter.
             Duplicates recognised from the list card or the DJC link cost nothing and are excluded
             entirely.</>}
           takeaway="Where the views went — every view is a candidate profile we paid to open — plus the pace they are being spent at and how each cycle ran against its cap."
           right={<Chips value={scope} onChange={v => setScope(v as 'cycle' | 'all')} options={[
             { key: 'cycle', label: 'This cycle' },
             { key: 'all', label: 'All time' },
           ]} />}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat value={String(tiles.used)}
              label="Profile views used"
              sub={`Out of ${tiles.cap} for the cycle${tiles.over > 0 ? ` — ${tiles.over} over` : ''}`}
              tone={tiles.over > 0 ? 'text-orange-700' : 'text-cyan-700'} />
        <Stat value={tiles.unique.toLocaleString()} label={tiles.uniqueLabel} sub={tiles.uniqueNote}
              tone="text-zinc-800" />
        <Stat value={String(tiles.added)} label="Added to Salesforce" tone="text-teal-700"
              onClick={() => onDrill({ title: `Added to Salesforce — ${scopeLabel}`,
                params: { kind: 'candidates', outcome: 'added', ...cycleParams } })} />
        <Stat value={String(tiles.already)} label="Already in Salesforce"
              sub="Skipped — no view spent" tone="text-cyan-700"
              onClick={() => onDrill({ title: `Already in Salesforce — ${scopeLabel}`,
                params: { kind: 'candidates', outcome: 'already', ...cycleParams } })} />
        <Stat value={String(tiles.noContact)} label="No contact found"
              sub="Skipped — nothing to reach them on" tone="text-orange-700"
              onClick={() => onDrill({ title: `No contact found — ${scopeLabel}`,
                params: { kind: 'candidates', outcome: 'noContact', ...cycleParams } })} />
        <Stat value={String(tiles.other)} label="Views not logged by a run"
              sub="See the note below" tone="text-zinc-700" />
      </div>

      <div className="mt-4">
        <p className="text-[10px] uppercase tracking-wide text-zinc-400">Pace this cycle</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-700">
          {djc.perDay !== null && <>Averaging <b className="text-zinc-900">{djc.perDay}</b> views a day
          ({djc.perWeek} a week). </>}
          {djc.projectedTotal !== null && (
            <>On that pace the cycle ends around{' '}
            <b className={djc.projectedTotal > djc.cycleCap ? 'text-orange-700' : 'text-teal-700'}>
              {djc.projectedTotal}
            </b> of {djc.cycleCap}.</>
          )}
          {djc.byWeekday.length > 0 && (
            <span className="text-zinc-500">
              {' '}By day: {djc.byWeekday.map(d => `${d.day} ${d.views}`).join(' · ')}.
            </span>
          )}
        </p>
      </div>

      <div className="mt-4 border-t border-zinc-200 pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-400">
            Views spent per cycle · broken out by what they became
          </p>
          <Chips value={cycleView} onChange={v => setCycleView(v as 'chart' | 'table')} options={[
            { key: 'chart', label: 'Chart' },
            { key: 'table', label: 'Table' },
          ]} />
        </div>

        {cycleView === 'chart' ? (
          <>
            <div className="mt-3 flex items-end gap-6">
              {djc.cycles.map((c, ci) => {
                const overC = c.used - c.cap
                const next = djc.cycles[ci + 1]?.start
                return (
                  <div key={c.start} className="flex w-24 cursor-pointer flex-col items-center"
                       onClick={() => onDrill({ title: `Added to Salesforce — cycle of ${cycleDate(c.refill)}`,
                         params: { kind: 'candidates', outcome: 'added', basis: 'event',
                           from: c.start, ...(next ? { to: next } : {}) } })}>
                    <span className={cn('mb-1 text-[11px] font-semibold tabular-nums',
                      c.partial ? 'text-zinc-500' : overC > 0 ? 'text-orange-700' : 'text-teal-700')}>
                      {c.partial ? 'partial view' : overC > 0 ? `+${overC} over`
                        : overC === 0 ? 'at cap' : `${-overC} under`}
                    </span>
                    <Hover block tip={<span className="block space-y-0.5">
                      <span className="block">
                        <b className="text-zinc-900">{c.used}</b> views · cap {c.cap}
                        {c.partial && ' · tracked mid-cycle'}
                      </span>
                      {SEGMENTS.map(s => c[s.key] > 0 && (
                        <span key={s.key} className="flex items-center gap-1.5">
                          <span className={cn('h-2 w-2 shrink-0 rounded-sm', s.tone)} />
                          <span className="tabular-nums text-zinc-800">{c[s.key]}</span> {s.label}
                        </span>
                      ))}
                    </span>}>
                      <div className="relative w-full" style={{ height: COL_H }}>
                        <div className="absolute inset-x-0 bottom-0 flex flex-col-reverse overflow-hidden rounded-t-[4px]">
                          {SEGMENTS.map(s => c[s.key] > 0 && (
                            <div key={s.key} className={s.tone}
                                 style={{ height: (c[s.key] / maxCycle) * COL_H }} />
                          ))}
                        </div>
                        {/* the cap line */}
                        <div className="absolute inset-x-[-6px] border-t border-dashed border-zinc-500/70"
                             style={{ bottom: (c.cap / maxCycle) * COL_H }} />
                      </div>
                    </Hover>
                    <span className="mt-1 border-t border-zinc-300 pt-1 text-[11px] text-zinc-500 w-full text-center">
                      {cycleDate(c.refill)}{c.partial && '*'}
                    </span>
                    <span className="text-[11px] font-semibold tabular-nums text-zinc-800">{c.used}</span>
                  </div>
                )
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-500">
              {SEGMENTS.map(s => <Key key={s.key} tone={s.tone} label={s.label} />)}
              <span className="flex items-center gap-1.5">
                <span className="w-3 border-t border-dashed border-zinc-500/70" /> cap
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-zinc-400">
              Cycles are named for the day the allowance refilled — the 15th. * marks the cycle we
              joined mid-way: counter tracking only began on 9 July, so that bar covers 9–14 July of
              a cycle that started on 15 June. Every band is a named cause and they add up to DJC's
              own counter. <b>Spent before tracking began</b> is that partial cycle only — the counter was already part-used when we
              first read it. <b>One-off facts pass</b> is ours: on 22 July a job re-opened roughly
              1,270 already-known profiles to collect experience and education details and logged
              nothing per profile. <b>Unaccounted</b> is what is left once those are removed, and on
              every other day this month it is zero — so nobody is quietly burning the allowance by
              hand. The bars attribute VIEWS: candidates already in Salesforce are skipped before a
              view is spent, so they barely appear here even when hundreds were matched.
            </p>
          </>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-400">
                  <Th k="start" label="Cycle" sort={cSort} onSort={onCSort} left />
                  <Th k="used" label="Views" sort={cSort} onSort={onCSort} />
                  <Th k="cap" label="Cap" sort={cSort} onSort={onCSort} />
                  <Th k="over" label="±" sort={cSort} onSort={onCSort} />
                  <Th k="added" label="Added" sort={cSort} onSort={onCSort} />
                  <Th k="already" label="Already in SF" sort={cSort} onSort={onCSort} />
                  <Th k="noContact" label="No contact" sort={cSort} onSort={onCSort} />
                  <Th k="other" label="Other" sort={cSort} onSort={onCSort} />
                </tr>
              </thead>
              <tbody>
                {sortRows(djc.cycles.map((c0, ci0) => ({ ...c0, ci0 })), cSort,
                  (r, k) => k === 'over' ? r.used - r.cap
                    : r[k as 'start' | 'used' | 'cap' | 'added' | 'already' | 'noContact' | 'other']).map(c => {
                  const overC = c.used - c.cap
                  const next = djc.cycles[c.ci0 + 1]?.start
                  return (
                    <tr key={c.start}
                        className="cursor-pointer border-t border-zinc-200 transition-colors hover:bg-zinc-100"
                        onClick={() => onDrill({ title: `Added to Salesforce — cycle of ${cycleDate(c.refill)}`,
                          params: { kind: 'candidates', outcome: 'added', basis: 'event',
                            from: c.start, ...(next ? { to: next } : {}) } })}>
                      <td className="px-3 py-1.5 text-zinc-800">{cycleDate(c.refill)}</td>
                      <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-zinc-900">{c.used}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-500">{c.cap}</td>
                      <td className={cn('py-1.5 pr-3 text-right font-medium tabular-nums',
                        overC > 0 ? 'text-orange-700' : 'text-teal-700')}>
                        {overC > 0 ? `+${overC}` : overC}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-teal-700">{c.added}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-700">{c.already}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-orange-700">{c.noContact}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-600">{c.other}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Block>
  )
}

const SPECIALTY_TONES = [
  'bg-cyan-500/60', 'bg-violet-400/75', 'bg-teal-400/80', 'bg-amber-400/70',
  'bg-slate-400/75', 'bg-rose-400/70', 'bg-lime-400/70', 'bg-sky-400/75',
]

type NewView = 'all' | 'dentists' | 'hygienists' | 'assistants' | 'table'

/** Stack order, bottom to top — same colours the "who the views brought in" bars use. */
const ROLE_STACK = [
  { key: 'general', label: 'general dentists', tone: LPRIMARY, match: (t: string) => t === 'General Dentistry' },
  { key: 'specialist', label: 'specialists', tone: LACCENT,
    match: (t: string) => !['General Dentistry', 'Dental Hygienist', 'Dental Assistant', 'Unknown'].includes(t) },
  { key: 'hygienist', label: 'hygienists', tone: LGOOD, match: (t: string) => t === 'Dental Hygienist' },
  { key: 'assistant', label: 'assistants', tone: LWARN, match: (t: string) => t === 'Dental Assistant' },
]

/**
 * One line of a hover breakdown: the swatch that matches the chart, the number, the label.
 *
 * Every tooltip that lists parts of a stacked bar uses this, so a reader can map a line back to
 * the band it came from without guessing at the order.
 */
function TipRow({ tone, value, label }: { tone: string; value: number | string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-2 w-2 shrink-0 rounded-sm', tone)} />
      <span className="tabular-nums text-zinc-800">{value}</span> {label}
    </span>
  )
}

/** Ladder steps in order, matching the drill filters in lib/drill.ts. */
const REACH_KEYS = ['added', 'contacted', 'read', 'spoke', 'forwarded'] as const

const DENTIST_SPECIALTY_EXCLUDE = new Set(['General Dentistry', 'Dental Hygienist', 'Dental Assistant', 'Unknown'])

/**
 * Who is arriving on DentistJobCafe — accounts created, by the month they registered.
 *
 * Sits before "who the views brought in" on purpose: this is the pool arriving, the next block is
 * what we pulled out of it. Roles are toggleable, and dentists split again into general practice
 * versus the specialties, because those two behave nothing alike.
 */
function NewAccountsBlock({ djc, onDrill }: {
  djc: ClientReport['djc']
  onDrill: (d: Drill) => void
}) {
  const [role, setRole] = useState<'all' | 'dentists' | 'hygienists' | 'assistants'>('all')
  const [dentistCut, setDentistCut] = useState<'both' | 'general' | 'specialty'>('both')
  const [asTable, setAsTable] = useState(false)

  const rows = djc.newAccounts ?? []
  const months = [...new Set(rows.map(r => r.month))].sort()
    .filter(m => m.startsWith(String(new Date().getUTCFullYear())))

  const keep = (target: string) => {
    if (role === 'hygienists') return target === 'Dental Hygienist'
    if (role === 'assistants') return target === 'Dental Assistant'
    if (role === 'dentists') {
      if (dentistCut === 'general') return target === 'General Dentistry'
      if (dentistCut === 'specialty') return !DENTIST_SPECIALTY_EXCLUDE.has(target)
      return target === 'General Dentistry' || !DENTIST_SPECIALTY_EXCLUDE.has(target)
    }
    return true
  }

  const total = (month: string) =>
    rows.filter(r => r.month === month && keep(r.target)).reduce((s, r) => s + r.n, 0)
  const series = months.map(m => ({ month: m, n: total(m) }))
  const max = Math.max(...series.map(s => s.n), 1)
  const sum = series.reduce((s, m) => s + m.n, 0)
  const latest = series[series.length - 1]
  const prev = series[series.length - 2]

  // Specialties only mean something when the specialty cut is showing.
  const specialties = [...new Set(rows.filter(r => !DENTIST_SPECIALTY_EXCLUDE.has(r.target)).map(r => r.target))]
    .map(t => ({ name: t, n: rows.filter(r => r.target === t && months.includes(r.month))
      .reduce((s, r) => s + r.n, 0) }))
    .filter(t => t.n > 0).sort((a, b) => b.n - a.n)

  // Which DJC scrape targets the active chip covers, so the drill matches what is on screen.
  const targetsForRole = role === 'hygienists' ? 'Dental Hygienist'
    : role === 'assistants' ? 'Dental Assistant'
    : role === 'dentists'
      ? (dentistCut === 'general' ? 'General Dentistry'
        : [...new Set(rows.map(x => x.target))]
            .filter(t => t === 'General Dentistry' || !DENTIST_SPECIALTY_EXCLUDE.has(t))
            .filter(t => dentistCut === 'specialty' ? t !== 'General Dentistry' : true).join(','))
      : ''
  const roleWord = role === 'all' ? 'people' : role === 'hygienists' ? 'hygienists'
    : role === 'assistants' ? 'assistants'
    : dentistCut === 'general' ? 'general dentists' : dentistCut === 'specialty' ? 'specialists' : 'dentists'

  return (
    <Block title="New accounts arriving on Dentist Job Cafe"
           info={<>Counted by the <b>registered date</b> on each candidate's card — the month they
             created their DJC account — over the candidates the automation has surfaced. It is not
             DJC's whole membership, which their site gives no way to count. <b>Coverage note:</b>{' '}
             the sweep only began scraping hygienists and assistants in June 2026, so earlier months
             undercount those two roles badly; dentist coverage runs the whole period.</>}
           takeaway={<>{sum.toLocaleString()} {roleWord} created a DJC account this year
             {latest && <> — {latest.n} in {monthLabel(latest.month)}
               {prev && prev.n > 0 && <>, against {prev.n} the month before</>}</>}. This is the pool
             arriving; the next block is what we pulled out of it.</>}
           right={<div className="flex flex-wrap items-center gap-2">
             <Chips value={role} onChange={v => setRole(v as typeof role)} options={[
               { key: 'all', label: 'All roles' },
               { key: 'dentists', label: 'Dentists' },
               { key: 'hygienists', label: 'Hygienists' },
               { key: 'assistants', label: 'Assistants' },
             ]} />
             <Chips value={asTable ? 'table' : 'chart'} onChange={v => setAsTable(v === 'table')}
                    options={[{ key: 'chart', label: 'Chart' }, { key: 'table', label: 'Table' }]} />
           </div>}>
      {role === 'dentists' && (
        <div className="mb-3">
          <Chips value={dentistCut} onChange={v => setDentistCut(v as typeof dentistCut)} options={[
            { key: 'both', label: 'All dentists' },
            { key: 'general', label: 'General practice' },
            { key: 'specialty', label: 'Specialties' },
          ]} />
        </div>
      )}

      {!asTable && (() => {
        // A stacked area rather than seven stacked columns: with four roles and small early
        // months the columns were mostly slivers and gaps. An area reads as one trend.
        const W = 720, H = 150, PAD_B = 22, PAD_T = 16
        const n = series.length
        const stackMax = Math.max(...series.map(m => m.n), 1)
        const x = (i: number) => n === 1 ? W / 2 : (i / (n - 1)) * W
        const y = (v: number) => PAD_T + (1 - v / stackMax) * (H - PAD_T - PAD_B)

        // Cumulative tops per month, in stack order, so each band sits on the one below.
        const stacks = series.map(m => {
          let run = 0
          return ROLE_STACK.map(r => {
            const v = rows.filter(x2 => x2.month === m.month && r.match(x2.target) && keep(x2.target))
              .reduce((s2, x2) => s2 + x2.n, 0)
            run += v
            return { key: r.key, tone: r.tone, label: r.label, value: v, top: run }
          })
        })
        const line = (pts: [number, number][]) => pts.map((p, i) =>
          `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
        const FILL: Record<string, string> = {
          general: 'fill-cyan-400/70', specialist: 'fill-violet-400/70',
          hygienist: 'fill-teal-400/75', assistant: 'fill-orange-300/80',
        }
        return (
          <>
            <div className="relative">
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}
                   preserveAspectRatio="none">
                {ROLE_STACK.map((r, ri) => {
                  const top = stacks.map((st, i) => [x(i), y(st[ri].top)] as [number, number])
                  const base = stacks.map((st, i) =>
                    [x(i), y(ri === 0 ? 0 : st[ri - 1].top)] as [number, number]).reverse()
                  if (stacks.every(st => st[ri].value === 0)) return null
                  return (
                    <path key={r.key} d={`${line(top)} ${line(base).replace('M', 'L')} Z`}
                          className={FILL[r.key]} />
                  )
                })}
              </svg>
              {/* Totals float at each month's peak. HTML rather than SVG text: the chart stretches
                  with preserveAspectRatio="none", which would squash any text inside it. */}
              <div className="pointer-events-none absolute inset-0">
                {series.map((m, i) => {
                  const leftPct = n === 1 ? 50 : (i / (n - 1)) * 100
                  const topPct = ((y(m.n) - PAD_T) / (H - PAD_T - PAD_B)) * (1 - (PAD_T + PAD_B) / H) * 100
                    + (PAD_T / H) * 100
                  const edge = i === 0 ? 'translate(0, -130%)'
                    : i === series.length - 1 ? 'translate(-100%, -130%)' : 'translate(-50%, -130%)'
                  return (
                    <span key={m.month}
                          className={cn('absolute whitespace-nowrap text-[11px] font-semibold tabular-nums',
                            i === series.length - 1 ? 'text-zinc-900' : 'text-zinc-500')}
                          style={{ left: `${leftPct}%`, top: `${topPct}%`, transform: edge }}>
                      {m.n}
                    </span>
                  )
                })}
              </div>
              {/* One hover target per month. Cells are positioned to straddle each data point
                  rather than laid out as equal flex columns, so the crosshair lands ON the point. */}
              <div className="absolute inset-0">
                {series.map((m, i) => {
                  const step = n === 1 ? 100 : 100 / (n - 1)
                  const left = Math.max(((i - 0.5) * step), 0)
                  const width = Math.min(step * (i === 0 || i === n - 1 ? 0.5 : 1), 100 - left)
                  const lineAt = i === 0 ? 0 : i === n - 1 ? 100 : 50
                  const split = stacks[i].filter(b => b.value > 0)
                  const dotTop = ((y(m.n) / H) * 100)
                  return (
                    <div key={m.month} className="group/pt absolute inset-y-0"
                         style={{ left: `${left}%`, width: `${width}%` }}>
                      <Hover block style={{ height: '100%' }} tip={<span className="flex flex-col gap-1">
                        <b className="text-zinc-900">{monthLabel(m.month)} — {m.n} new{' '}
                          {m.n === 1 ? 'account' : 'accounts'}</b>
                        {split.map(b => <TipRow key={b.key} tone={b.tone} value={b.value} label={b.label} />)}
                        <span className="text-zinc-400">click for the people</span>
                      </span>}>
                        <button
                          onClick={() => onDrill({
                            title: `Joined DJC in ${monthLabel(m.month)}`,
                            sub: `${m.n} new ${roleWord} — of the candidates the automation has surfaced`,
                            params: { kind: 'candidates', registeredMonth: m.month,
                              ...(targetsForRole ? { targets: targetsForRole } : {}) },
                          })}
                          className="block h-full w-full cursor-pointer" />
                      </Hover>
                      <span className="pointer-events-none absolute inset-y-0 w-px bg-zinc-400/60 opacity-0 transition-opacity group-hover/pt:opacity-100"
                            style={{ left: `${lineAt}%` }} />
                      <span className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-zinc-700 opacity-0 transition-opacity group-hover/pt:opacity-100"
                            style={{ left: `${lineAt}%`, top: `${dotTop}%` }} />
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="flex">
              {series.map((m, i) => (
                <span key={m.month}
                      className={cn('flex-1 text-center text-[11px]',
                        i === series.length - 1 ? 'text-zinc-700' : 'text-zinc-500')}>
                  {monthLabel(m.month)}
                </span>
              ))}
            </div>
            {role === 'all' && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-500">
                {ROLE_STACK.map(r => <Key key={r.key} tone={r.tone} label={r.label} />)}
              </div>
            )}
          </>
        )
      })()}

      {asTable && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-400">
                <th className="px-3 py-1.5">Month</th>
                <th className="py-1.5 pr-3 text-right">general</th>
                <th className="py-1.5 pr-3 text-right">specialty</th>
                <th className="py-1.5 pr-3 text-right">hygienists</th>
                <th className="py-1.5 pr-3 text-right">assistants</th>
                <th className="py-1.5 pr-3 text-right">all</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m => {
                const at = (fn: (t: string) => boolean) =>
                  rows.filter(r => r.month === m && fn(r.target)).reduce((s, r) => s + r.n, 0)
                const g = at(t => t === 'General Dentistry')
                const sp = at(t => !DENTIST_SPECIALTY_EXCLUDE.has(t))
                const h = at(t => t === 'Dental Hygienist')
                const a = at(t => t === 'Dental Assistant')
                return (
                  <tr key={m} className="border-t border-zinc-200">
                    <td className="px-3 py-1.5 text-zinc-800">{monthLabel(m)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-700">{g}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-700">{sp}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-700">{h}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-700">{a}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-zinc-900">
                      {g + sp + h + a}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {role === 'dentists' && dentistCut === 'specialty' && specialties.length > 0 && (
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
          Specialties this year:{' '}
          {specialties.map((t, i) => (
            <span key={t.name}>{i > 0 && ' · '}<span className="text-zinc-700">{t.name}</span> {t.n}</span>
          ))}
        </p>
      )}
      <p className="mt-2 text-[10px] text-zinc-400">
        Hygienist and assistant sourcing began in June 2026 — earlier months in those two roles
        reflect what the automation was scraping, not who joined DJC.
      </p>
    </Block>
  )
}

function NewCandidatesBlock({ djc, onDrill }: {
  djc: ClientReport['djc']
  onDrill: (d: Drill) => void
}) {
  const [view, setView] = useState<NewView>('all')
  const [nSort, onNSort] = useSort('month', false)
  const latestNew = djc.newByMonth[djc.newByMonth.length - 1]

  // "Who was last active" follows the role toggle. Dentists means general practice AND the
  // specialties, matching what the bars above call a dentist.
  const ROLES_FOR_VIEW: Record<string, string[] | null> = {
    all: null, table: null,
    dentists: ['general', 'specialist'], hygienists: ['hygienist'], assistants: ['assistant'],
  }
  const wanted = ROLES_FOR_VIEW[view] ?? null
  const roleWord = wanted === null ? 'candidates'
    : view === 'dentists' ? 'dentists' : view === 'hygienists' ? 'hygienists' : 'assistants'
  const roleRows = (djc.activityByRole ?? []).filter(r => !wanted || wanted.includes(r.role))
  const roleActivityTotal = roleRows.reduce((s, r) => s + r.count, 0)
  const roleActivity = (() => {
    const byLabel = new Map<string, { ord: number; count: number }>()
    for (const r of roleRows) {
      const cur = byLabel.get(r.label) ?? { ord: r.ord, count: 0 }
      cur.count += r.count
      byLabel.set(r.label, cur)
    }
    return [...byLabel.entries()].sort((a, b) => a[1].ord - b[1].ord).map(([label, b]) => ({
      label, count: b.count,
      pct: Math.round((b.count / (roleActivityTotal || 1)) * 1000) / 10,
    }))
  })()
  const roleActivityGroups = [
    { label: 'Active in the last 30 days', cls: 'bg-teal-500/85',
      count: roleActivity.slice(0, 2).reduce((s, b) => s + b.count, 0) },
    { label: '1–3 months ago', cls: 'bg-amber-300', count: roleActivity[2]?.count ?? 0 },
    { label: 'Older or unknown', cls: 'bg-zinc-300',
      count: roleActivity.slice(3).reduce((s, b) => s + b.count, 0) },
  ]

  // Dentist specialties per month, from the raw month × target detail.
  const DENTIST_EXCLUDE = new Set(['Dental Assistant', 'Dental Hygienist', 'Unknown'])
  const specialties = [...new Set(
    djc.newDetail.filter(d => !DENTIST_EXCLUDE.has(d.target)).map(d => d.target),
  )].sort((a, b) =>
    djc.newDetail.filter(d => d.target === b).reduce((s, d) => s + d.n, 0)
    - djc.newDetail.filter(d => d.target === a).reduce((s, d) => s + d.n, 0))
  const months = [...new Set(djc.newDetail.map(d => d.month))].sort()
  const cell = (month: string, target: string) =>
    djc.newDetail.filter(d => d.month === month && d.target === target).reduce((s, d) => s + d.n, 0)

  const singleRole = (field: 'hygienist' | 'assistant') => {
    const max = Math.max(...djc.newByMonth.map(m => m[field]), 1)
    return (
      <div className="space-y-1.5">
        {djc.newByMonth.map(m => (
          <div key={m.month} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-[12px] text-zinc-600">{monthLabel(m.month)}</span>
            <span className={cn('relative block h-5 grow rounded', LTRACK)}>
              <span className={cn('absolute inset-y-0 left-0 rounded', LGOOD)}
                    style={{ width: `${Math.max((m[field] / max) * 100, m[field] ? 2 : 0)}%` }} />
            </span>
            <span className="w-14 shrink-0 text-right text-[13px] font-semibold tabular-nums text-zinc-900">
              {m[field]}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <Block title="Who the views brought in"
           info={<>New candidates = Salesforce contacts the automation created, counted by the month
             it first saw them on DJC. The role split comes from their DJC profile.</>}
           takeaway={latestNew
             ? `${latestNew.total} new candidates added in ${monthLabel(latestNew.month)} — hover any bar for the split, or narrow to one role.`
             : 'New candidates by month.'}
           right={<Chips value={view} onChange={v => setView(v as NewView)} options={[
             { key: 'all', label: 'All roles' },
             { key: 'dentists', label: 'Dentists' },
             { key: 'hygienists', label: 'Hygienists' },
             { key: 'assistants', label: 'Assistants' },
             { key: 'table', label: 'Table' },
           ]} />}>
      {view === 'all' && (
        <>
          <div className="space-y-1.5">
            {djc.newByMonth.map(m => {
              const max = Math.max(...djc.newByMonth.map(x => x.total), 1)
              return (
                <div key={m.month} className="flex cursor-pointer items-center gap-3 rounded px-1 -mx-1 transition-colors hover:bg-zinc-100"
                     onClick={() => onDrill({ title: `New candidates added in ${monthLabel(m.month)}`,
                       params: { kind: 'candidates', outcome: 'added', month: m.month } })}>
                  <span className="w-16 shrink-0 text-[12px] text-zinc-600">{monthLabel(m.month)}</span>
                  <Hover tip={<span className="flex flex-col gap-1">
                    <b className="text-zinc-900">{m.total} added in {monthLabel(m.month)}</b>
                    <TipRow tone={LPRIMARY} value={m.general} label="general dentists" />
                    <TipRow tone={LACCENT} value={m.specialist} label="specialists" />
                    <TipRow tone={LGOOD} value={m.hygienist} label="hygienists" />
                    <TipRow tone={LWARN} value={m.assistant} label="assistants" />
                  </span>}>
                    <span className={cn('relative flex h-5 overflow-hidden rounded', LTRACK)}>
                      {[
                        { n: m.general, tone: LPRIMARY },
                        { n: m.specialist, tone: LACCENT },
                        { n: m.hygienist, tone: LGOOD },
                        { n: m.assistant, tone: LWARN },
                      ].map((s, i) => s.n > 0 && (
                        <span key={i} className={s.tone} style={{ width: `${(s.n / max) * 100}%` }} />
                      ))}
                    </span>
                  </Hover>
                  <span className="w-14 shrink-0 text-right text-[13px] font-semibold tabular-nums text-zinc-900">
                    {m.total}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-500">
            <Key tone={LPRIMARY} label="General dentists" />
            <Key tone={LACCENT} label="Specialists" />
            <Key tone={LGOOD} label="Hygienists" />
            <Key tone={LWARN} label="Assistants" />
          </div>
        </>
      )}

      {view === 'dentists' && (
        <>
          <div className="space-y-1.5">
            {months.map(month => {
              const parts = specialties.map((sp, i) => ({
                sp, n: cell(month, sp), tone: SPECIALTY_TONES[i % SPECIALTY_TONES.length],
              })).filter(p => p.n > 0)
              const total = parts.reduce((s, p) => s + p.n, 0)
              const max = Math.max(...months.map(mm =>
                specialties.reduce((s, sp) => s + cell(mm, sp), 0)), 1)
              return (
                <div key={month} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-[12px] text-zinc-600">{monthLabel(month)}</span>
                  <Hover tip={<span className="flex flex-col gap-1">
                    <b className="text-zinc-900">{total} dentists in {monthLabel(month)}</b>
                    {parts.map(p => <TipRow key={p.sp} tone={p.tone} value={p.n} label={p.sp} />)}
                  </span>}>
                    <span className={cn('relative flex h-5 overflow-hidden rounded', LTRACK)}>
                      {parts.map(p => (
                        <span key={p.sp} className={p.tone} style={{ width: `${(p.n / max) * 100}%` }} />
                      ))}
                    </span>
                  </Hover>
                  <span className="w-14 shrink-0 text-right text-[13px] font-semibold tabular-nums text-zinc-900">
                    {total}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-500">
            {specialties.map((sp, i) => (
              <Key key={sp} tone={SPECIALTY_TONES[i % SPECIALTY_TONES.length]} label={sp} />
            ))}
          </div>
        </>
      )}

      {view === 'hygienists' && singleRole('hygienist')}
      {view === 'assistants' && singleRole('assistant')}

      {view === 'table' && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-400">
                <Th k="month" label="Month" sort={nSort} onSort={onNSort} left />
                <Th k="general" label="General" sort={nSort} onSort={onNSort} />
                <Th k="specialist" label="Specialists" sort={nSort} onSort={onNSort} />
                <Th k="hygienist" label="Hygienists" sort={nSort} onSort={onNSort} />
                <Th k="assistant" label="Assistants" sort={nSort} onSort={onNSort} />
                <Th k="total" label="Total" sort={nSort} onSort={onNSort} />
              </tr>
            </thead>
            <tbody>
              {sortRows(djc.newByMonth, nSort,
                (r, k) => r[k as keyof typeof r]).map(m => (
                <tr key={m.month} className="border-t border-zinc-200">
                  <td className="px-3 py-1.5 text-zinc-800">{monthLabel(m.month)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-700">{m.general}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-700">{m.specialist}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-700">{m.hygienist}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-700">{m.assistant}</td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-zinc-900">{m.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 border-t border-zinc-200 pt-4">
        <p className="text-[10px] uppercase tracking-wide text-zinc-400">
          When the {roleActivityTotal.toLocaleString()} {roleWord} we know of were last active on DJC
        </p>
        <div className="mt-2 flex h-6 w-full overflow-hidden rounded-lg">
          {roleActivityGroups.map(g => {
            const pct = Math.round((g.count / (roleActivityTotal || 1)) * 1000) / 10
            return g.count > 0 && (
              <Hover key={g.label} style={{ width: `${pct}%` }}
                     tip={<><b className="text-zinc-900">{g.count.toLocaleString()}</b> {roleWord} —{' '}
                       {g.label.toLowerCase()} ({pct}% of the {roleWord} we know of)</>}>
                <div className={cn('flex h-6 items-center justify-center', g.cls)}>
                  {pct >= 8 && (
                    <span className="px-1 text-[10px] font-semibold tabular-nums text-zinc-950/80">{pct}%</span>
                  )}
                </div>
              </Hover>
            )
          })}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-500">
          {roleActivityGroups.map(g => (
            <span key={g.label} className="flex items-center gap-1.5">
              <span className={cn('h-2 w-3 rounded-sm', g.cls)} />
              {g.label} <span className="tabular-nums text-zinc-600">{g.count.toLocaleString()}</span>
            </span>
          ))}
        </div>
      </div>
    </Block>
  )
}

/* ── Kimedics blocks ──────────────────────────────────────────────────────── */

/**
 * Jobs opened and filled — the scoreboard and the trend in one card, on one filter.
 *
 * They were two cards with two different toggles, which meant the headline number and the chart
 * underneath it could be showing different windows. One grain now drives both: the tiles describe
 * the latest period at that grain, the chart is the series behind them.
 */
function KimJobsBlock({ kim, onDrill }: {
  kim: ClientReport['kim']
  onDrill: (d: Drill) => void
}) {
  const [view, setView] = useState<'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'table'>('monthly')
  const [mSort, onMSort] = useSort('month', false)

  type Bar = {
    key: string; label: string; opened: number; submitted: number; filled: number
    prior: number | null; priorWord: string; partial: boolean; drill: Drill
  }

  const monthBars: Bar[] = kim.months.map((m, i, a) => ({
    key: m.month, label: monthLabel(m.month), opened: m.opened, submitted: m.submitted,
    filled: m.filled, prior: m.prior, priorWord: 'same month last year', partial: i === a.length - 1,
    drill: { title: `Jobs that arrived in ${monthLabel(m.month)}`, params: { kind: 'jobs', month: m.month } },
  }))

  const quarterBars: Bar[] = kim.quarters.map((q, i, a) => ({
    key: q.label, label: q.label, opened: q.opened, submitted: q.submitted, filled: q.filled,
    prior: q.prior, priorWord: 'same quarter last year', partial: i === a.length - 1,
    drill: { title: `Jobs that arrived in ${q.label}`,
      params: { kind: 'jobs', ...(quarterRange(q.label) ?? {}) } },
  }))

  // Weeks run Monday-to-Sunday, matching how the desk actually plans its week.
  const weekBars: Bar[] = kim.weeks.map((w, i, a) => {
    const start = new Date(`${w.weekStart}T00:00:00Z`)
    const end = new Date(start.getTime() + 6 * 864e5)
    const fmt = (d: Date) => `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`
    return {
      key: w.weekStart, label: fmt(start), opened: w.opened, submitted: w.submitted, filled: w.filled,
      prior: null, priorWord: '', partial: i === a.length - 1,
      drill: { title: `Jobs that arrived ${fmt(start)}–${fmt(end)}`,
        params: { kind: 'jobs', fromDate: w.weekStart, toDate: end.toISOString().slice(0, 10) } },
    }
  })

  const yearBars: Bar[] = kim.years.map((y, i, a) => ({
    key: String(y.year), label: String(y.year), opened: y.opened, submitted: y.submitted,
    filled: y.filled, prior: i > 0 ? a[i - 1].opened : null, priorWord: 'the year before',
    partial: i === a.length - 1,
    drill: { title: `Jobs that arrived in ${y.year}`,
      params: { kind: 'jobs', fromMonth: `${y.year}-01`, toMonth: `${y.year}-12` } },
  }))

  const series = view === 'weekly' ? weekBars : view === 'quarterly' ? quarterBars
    : view === 'yearly' ? yearBars : monthBars
  const current = series[series.length - 1]
  const periodWord = view === 'weekly' ? 'this week' : view === 'quarterly' ? 'this quarter'
    : view === 'yearly' ? 'this year' : 'this month'

  // The year tile compares day-of-year aligned ("by this point last year"), which a whole-year
  // count would flatter; every other grain compares like-for-like periods.
  const ytd = kim.scoreboard.ytd
  const tile = view === 'yearly'
    ? { opened: ytd.opened, filled: ytd.filled, submitted: ytd.submitted, prior: ytd.prior,
        priorWord: 'by now last year', drill: current?.drill }
    : { opened: current?.opened ?? 0, filled: current?.filled ?? 0, submitted: current?.submitted ?? 0,
        prior: current?.prior ?? null, priorWord: current?.priorWord ?? '', drill: current?.drill }
  const filledPct = tile.opened ? Math.round((tile.filled / tile.opened) * 100) : 0
  const fwdPct = tile.opened ? Math.round((tile.submitted / tile.opened) * 100) : 0

  const bars = (rows: Bar[], labelWidth = 'w-16') => {
    const max = Math.max(...rows.map(r => r.opened), 1)
    return (
      <div className="space-y-1.5">
        {rows.map(r => {
          const rate = r.opened ? Math.round((r.filled / r.opened) * 100) : 0
          return (
            <button key={r.key} onClick={() => onDrill(r.drill)}
                    className={cn('group flex w-full cursor-pointer items-center gap-3 rounded px-1 py-0.5 -mx-1 transition-colors hover:bg-zinc-100',
                      r.partial && 'opacity-75')}>
              <span className={cn(labelWidth, 'shrink-0 text-left text-[12px] text-zinc-600')}>
                {r.label}{r.partial && <span className="text-zinc-400">*</span>}
              </span>
              <Hover tip={<span className="flex flex-col gap-1">
                <b className="text-zinc-900">{r.label} — {r.opened} arrived</b>
                <TipRow tone="bg-sky-300/50" value={r.opened} label="jobs that arrived" />
                <TipRow tone={LGOOD} value={r.filled} label={`filled (${rate}%)`} />
                <TipRow tone="bg-cyan-700" value={r.submitted} label="someone put forward" />
                {r.prior !== null && (
                  <span className="text-zinc-500">{r.prior} {r.priorWord}</span>
                )}
              </span>}>
                <span className={cn('relative block h-5 rounded', LTRACK)}>
                  <span className="absolute inset-y-0 left-0 rounded bg-sky-300/50"
                        style={{ width: `${Math.max((r.opened / max) * 100, 0.8)}%` }} />
                  <span className={cn('absolute inset-y-1 left-0 rounded-sm', LGOOD)}
                        style={{ width: `${(r.filled / max) * 100}%` }} />
                  {r.submitted > 0 && (
                    <span className="absolute inset-y-0 w-[2px] rounded-full bg-cyan-700"
                          style={{ left: `${(r.submitted / max) * 100}%` }} />
                  )}
                </span>
              </Hover>
              <span className="w-40 shrink-0 text-right text-[11px] tabular-nums text-zinc-500">
                <span className="text-teal-700">{r.filled}</span> of {r.opened} · {rate}%
                {r.prior !== null && <span className="text-zinc-400"> · LY {r.prior}</span>}
              </span>
            </button>
          )
        })}
      </div>
    )
  }

  const partialNote = (word: string, ly?: string) => (
    <p className="mt-1.5 text-[10px] text-zinc-400">
      * current {word}, still filling in.{ly ? ` LY = jobs that arrived the same ${ly} last year.` : ''}
      {' '}Earlier periods undercount — Salesforce keeps only the latest job per location, so history
      erodes; recent ones are the most accurate.
    </p>
  )

  return (
    <Block title="Jobs opened and filled"
           info={<>One window drives the whole card: the three cards describe the latest period at
             the grain you pick, the bars are the series behind them. Jobs are counted by the date
             they <b>opened</b> in Salesforce; a fill is credited to the period the job opened in,
             even if the placement came later. "Open right now" is a live count and ignores the
             window. <b>Known undercount:</b> Salesforce keeps only the latest job per location —
             when a site reopens, the earlier record is overwritten — so past periods lose jobs over
             time and the true rates run higher than shown.</>}
           takeaway="One window for the whole card. Click any card or bar for the raw jobs."
           right={<Chips value={view} onChange={v => setView(v as typeof view)} options={[
             { key: 'weekly', label: 'Weekly' },
             { key: 'monthly', label: 'Monthly' },
             { key: 'quarterly', label: 'Quarterly' },
             { key: 'yearly', label: 'Yearly' },
             { key: 'table', label: 'Table' },
           ]} />}>
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat value={tile.opened.toLocaleString()}
              label={`Jobs opened ${periodWord}`}
              sub={tile.prior !== null ? `${tile.prior} ${tile.priorWord}` : undefined}
              tone="text-cyan-700"
              onClick={() => tile.drill && onDrill(tile.drill)} />
        <Stat value={`${filledPct}%`}
              label={`Filled ${periodWord}`}
              sub={`${fwdPct}% had someone put forward${view === 'yearly' ? '' : ' — still resolving'}`}
              tone="text-teal-700"
              onClick={() => tile.drill && onDrill({ title: `Filled ${periodWord}`,
                params: { ...tile.drill.params, filled: '1' } })} />
        <Stat value={String(kim.jobsOpenNow)} label="Open right now"
              sub={`${kim.openStale} waiting over 3 months`}
              tone={kim.openStale > 0 ? 'text-orange-700' : 'text-zinc-800'}
              onClick={() => onDrill({ title: 'Open right now', params: { kind: 'jobs', open: '1' } })} />
      </div>

      {view === 'weekly' && <>{bars(weekBars)}<KimLegend />{partialNote('week')}</>}
      {view === 'monthly' && <>{bars(monthBars)}<KimLegend />{partialNote('month', 'month')}</>}
      {view === 'quarterly' && <>{bars(quarterBars)}<KimLegend />{partialNote('quarter', 'quarter')}</>}
      {view === 'yearly' && <>{bars(yearBars)}<KimLegend />{partialNote('year')}</>}

      {view === 'table' && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-400">
                <Th k="month" label="Month" sort={mSort} onSort={onMSort} left />
                <Th k="opened" label="Arrived" sort={mSort} onSort={onMSort} />
                <Th k="submitted" label="Put forward" sort={mSort} onSort={onMSort} />
                <Th k="fwdPct" label="Forward %" sort={mSort} onSort={onMSort} />
                <Th k="filled" label="Filled" sort={mSort} onSort={onMSort} />
                <Th k="fillPct" label="Fill %" sort={mSort} onSort={onMSort} />
                <Th k="prior" label="Last yr" sort={mSort} onSort={onMSort} />
              </tr>
            </thead>
            <tbody>
              {sortRows(kim.months, mSort, (r, k) =>
                k === 'fwdPct' ? (r.opened ? r.submitted / r.opened : 0)
                  : k === 'fillPct' ? (r.opened ? r.filled / r.opened : 0)
                  : k === 'prior' ? (r.prior ?? -1)
                  : r[k as 'month' | 'opened' | 'submitted' | 'filled']).map(m => (
                <tr key={m.month} className="cursor-pointer border-t border-zinc-200 transition-colors hover:bg-zinc-100"
                    onClick={() => onDrill({ title: `Jobs that arrived in ${monthLabel(m.month)}`,
                      params: { kind: 'jobs', month: m.month } })}>
                  <td className="px-3 py-1.5 text-zinc-800">{monthLabel(m.month)}</td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-zinc-900">{m.opened}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-700">{m.submitted}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-600">
                    {m.opened ? Math.round((m.submitted / m.opened) * 100) : 0}%
                  </td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-teal-700">{m.filled}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-teal-700">
                    {m.opened ? Math.round((m.filled / m.opened) * 100) : 0}%
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-500">{m.prior ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Block>
  )
}

const BAND_TONES = ['bg-cyan-500/70', 'bg-cyan-400/75', 'bg-teal-400/80', 'bg-amber-400/75']
const BAND_LABELS = ['Under a week', '1-4 weeks', '1-3 months', 'Over 3 months']

/**
 * How long the jobs open right now have been waiting.
 *
 * Open jobs only, deliberately. Salesforce's days-open counter never stops when a job closes — a
 * job closed years ago still reads thousands of days — so for closed jobs it measures how long ago
 * the job was posted, not how long it took to fill. For a job that is still open, days since
 * posting IS the wait, so this is the one honest cut of that field.
 */
function DurationsBlock({ kim, onDrill }: {
  kim: ClientReport['kim']
  onDrill: (d: Drill) => void
}) {
  const [view, setView] = useState<'overall' | 'month' | 'quarter' | 'state' | 'role'>('overall')
  const total = kim.durations.reduce((a, d) => a + d.jobs, 0)

  /**
   * What became of each period's intake. Duration can't be trended (the days-open counter never
   * freezes), but outcomes are recorded per job, so this cut is real.
   */
  const outcomeRows = (rows: ClientReport['kim']['outcomes']['months'], isMonth: boolean) => {
    // Start at January like every other chart here, and keep the series contiguous: filtering thin
    // months out left a hole (May 25 → Feb 26) that read as missing data. A month holding two
    // tracked jobs still can't carry a rate, so it is marked rather than hidden.
    const MIN = 5
    const year = String(new Date().getUTCFullYear())
    const shown = isMonth ? rows.filter(r => r.name.startsWith(year))
      : rows.filter(r => r.name.endsWith(year.slice(2)))
    const thin = shown.filter(r => r.intake < MIN).length
    return (
    <>
      <div className="space-y-1.5">
        {shown.map(r => {
          const label = isMonth ? monthLabel(r.name) : r.name
          const range: Record<string, string> =
            isMonth ? { month: r.name } : (quarterRange(r.name) ?? {})
          const seg = [
            { n: r.filled, tone: LGOOD, word: 'filled', params: { ...range, filled: '1' } },
            { n: r.closedUnfilled, tone: LNEUTRAL, word: 'closed without a fill', params: { ...range, unfilled: '1' } },
            { n: r.openUnfilled, tone: LWARN, word: 'still waiting', params: { ...range, open: '1' } },
          ]
          const pct = r.intake ? Math.round((r.filled / r.intake) * 100) : 0
          return (
            <div key={r.name} className="flex items-center gap-3">
              <span className={cn('w-16 shrink-0 text-left text-[12px]',
                r.intake < MIN ? 'text-zinc-400' : 'text-zinc-600')}>
                {label}{r.intake < MIN && <span className="text-zinc-300">*</span>}
              </span>
              <Hover tip={<span className="flex flex-col gap-1">
                <b className="text-zinc-900">{label} — {r.intake} arrived</b>
                {seg.filter(x => x.n > 0).map(x => (
                  <TipRow key={x.word} tone={x.tone} value={x.n} label={x.word} />
                ))}
                {r.medianAgeOpen !== null && (
                  <span className="text-zinc-500">those still waiting: {r.medianAgeOpen} days so far</span>
                )}
              </span>}>
                <span className="relative flex h-5 overflow-hidden rounded bg-zinc-200/70">
                  {seg.map(x => x.n > 0 && (
                    <button key={x.word} className={cn('cursor-pointer transition-opacity hover:opacity-80', x.tone)}
                            style={{ width: `${(x.n / r.intake) * 100}%` }}
                            onClick={() => onDrill({ title: `${label} — ${x.word}`,
                              params: { kind: 'jobs', ...x.params } })} />
                  ))}
                </span>
              </Hover>
              <span className="w-40 shrink-0 text-right text-[11px] tabular-nums text-zinc-500">
                <span className="text-teal-700">{r.filled} filled</span> · {pct}% of {r.intake}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-500">
        <Key tone={LGOOD} label="Filled" />
        <Key tone={LNEUTRAL} label="Closed without a fill" />
        <Key tone={LWARN} label="Still waiting" />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
        {thin > 0 && <>* Fewer than {MIN} of that period's jobs survive in Salesforce, so its rate
          swings on one or two records — the mirror's history erodes as sites reopen. </>}
        Read this with maturity in mind: a month that only just opened has had no time to clear, so
        its still-waiting share is high by construction — compare a month against months of the same
        age. A true seasonal read (do summer months fill worse?) needs a full year of like-for-like
        history; dense tracking starts around April 2026, so that answer is a few months out.
      </p>
    </>
    )
  }

  const groupedRows = (
    rows: ClientReport['kim']['openAgeBands']['byState'],
    key: 'state' | 'specialty',
  ) => (
    <>
      <div className="space-y-1.5">
        {rows.map(row => (
          <div key={row.name} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-[12px] text-zinc-700" title={row.name}>{row.name}</span>
            <Hover tip={<span className="flex flex-col gap-1">
              <b className="text-zinc-900">{row.name} — {row.total} open
                {row.median !== null && <> · half have waited {row.median}+ days</>}</b>
              {row.bands.map((n, i) => n > 0 && (
                <TipRow key={i} tone={BAND_TONES[i]} value={n} label={BAND_LABELS[i].toLowerCase()} />
              ))}
            </span>}>
              <span className="relative flex h-5 overflow-hidden rounded bg-zinc-200/70">
                {row.bands.map((n, i) => n > 0 && (
                  <button key={i} className={cn('cursor-pointer transition-opacity hover:opacity-80', BAND_TONES[i])}
                          style={{ width: `${(n / row.total) * 100}%` }}
                          onClick={() => onDrill({
                            title: `${row.name} — open ${BAND_LABELS[i].toLowerCase()}`,
                            params: { kind: 'jobs', open: '1', ageBand: BAND_LABELS[i], [key]: row.name },
                          })} />
                ))}
              </span>
            </Hover>
            <span className="w-24 shrink-0 text-right text-[12px] tabular-nums text-zinc-800">
              <span className="font-semibold">{row.total}</span>
              {row.median !== null && <span className="text-zinc-400"> · {row.median}d</span>}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-500">
        {BAND_LABELS.map((l, i) => <Key key={l} tone={BAND_TONES[i]} label={l.toLowerCase()} />)}
      </div>
    </>
  )

  return (
    <Block title="The backlog, and how each month clears"
           info={<>The {total} jobs open <b>right now</b>, by how long each has been open. Closed
             jobs are deliberately left out: Salesforce's days-open counter keeps running after a
             job closes — a job closed years ago still reads thousands of days — so it can only tell
             us how long ago a job was posted, never how long it took to fill. Measuring true
             time-to-fill needs Salesforce to stamp a close date and stop overwriting the job record
             per location.</>}
           takeaway="Overall, by state and by role: what is open now and how long it has waited. Monthly and quarterly: what became of each period's intake. Click anything for the raw jobs."
           right={<Chips value={view} onChange={v => setView(v as typeof view)} options={[
             { key: 'overall', label: 'Overall' },
             { key: 'month', label: 'Monthly' },
             { key: 'quarter', label: 'Quarterly' },
             { key: 'state', label: 'By state' },
             { key: 'role', label: 'By role' },
           ]} />}>
      {view === 'overall' && (
        <>
          <div className="max-w-xl space-y-1">
            {kim.durations.map((d, i) => (
              <button key={d.label}
                      onClick={() => onDrill({ title: `Open ${d.label.toLowerCase()}`,
                        params: { kind: 'jobs', open: '1', ageBand: d.label } })}
                      className="flex w-full cursor-pointer items-baseline gap-3 rounded px-1 py-0.5 -mx-1 text-[12px] transition-colors hover:bg-zinc-100">
                <span className="w-28 shrink-0 text-left text-zinc-700">{d.label}</span>
                <span className="relative h-2 grow overflow-hidden rounded-full bg-zinc-200/70">
                  <span className={cn('absolute inset-y-0 left-0 rounded-full', BAND_TONES[i])}
                        style={{ width: `${d.pct}%` }} />
                </span>
                <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-zinc-800">{d.jobs}</span>
                <span className="w-24 shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums text-zinc-400">
                  {d.pct}% of open
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
            {kim.openAgeMedian !== null && <>Half of what is open has been waiting {kim.openAgeMedian}+ days. </>}
            Counts jobs open today only — Salesforce does not record when a job was filled or closed,
            so how long past jobs took cannot be measured yet.
          </p>
        </>
      )}
      {view === 'month' && outcomeRows(kim.outcomes.months, true)}
      {view === 'quarter' && outcomeRows(kim.outcomes.quarters, false)}
      {view === 'state' && groupedRows(kim.openAgeBands.byState, 'state')}
      {view === 'role' && groupedRows(kim.openAgeBands.byType, 'specialty')}
    </Block>
  )
}

function DemandBlock({ kim, onDrill }: {
  kim: ClientReport['kim']
  onDrill: (d: Drill) => void
}) {
  const [scope, setScope] = useState<'3m' | '12m'>('12m')
  const sinceDays = scope === '3m' ? '90' : '365'
  const pick = (g: ClientReport['kim']['scoped']['byState'][number]) =>
    scope === '3m' ? { opened: g.opened3m, filled: g.filled3m }
      : { opened: g.opened12m, filled: g.filled12m }
  const label = scope === '3m' ? 'Last 3 months' : 'Last 12 months'

  const table = (rows: ClientReport['kim']['scoped']['byState'], unit: string) => (
    <SideTable title={`Jobs opened by ${unit} · ${label.toLowerCase()}`} unit={unit}
               rows={rows.map(g => ({ name: g.name, ...((p => ({ a: p.opened, b: p.filled }))(pick(g))) }))
                 .filter(r => r.a > 0).sort((a, b) => b.a - a.a).slice(0, 8)}
               aLabel="jobs opened" bLabel="filled" bTone="text-teal-700"
               onRow={name => onDrill({ title: `${name} — where the demand sits`,
                 sub: `Towns with jobs opened in the ${label.toLowerCase()}, busiest first`,
                 params: { kind: 'locations', ...(unit === 'state' ? { state: name } : { specialty: name }),
                   sinceDays } })} />
  )

  return (
    <Block title="Where the demand is — jobs opened by state and role"
           info={<>Both tables count <b>jobs</b>, not clients: a practice that opened six roles in
             Texas counts six. "Filled" is how many of those jobs ended in a placement. Click any
             row to see which towns inside that state or role the jobs came from, busiest first.</>}
           takeaway={<>Counting job openings, not practices. Separately: {kim.practicesTotal} practices
             have given us work, but the single largest client is{' '}
             <span className="text-zinc-800">{kim.topPracticeShare}%</span> of everything opened this
             year.</>}
           right={<Chips value={scope} onChange={v => setScope(v as typeof scope)} options={[
             { key: '3m', label: '3 mo' },
             { key: '12m', label: '12 mo' },
           ]} />}>
      <div className="grid gap-4 lg:grid-cols-2">
        {table(kim.scoped.byState, 'state')}
        {table(kim.scoped.byType, 'role')}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-zinc-600">
        Busiest locations:{' '}
        {kim.cities.map((c, i) => (
          <span key={c.name}>
            {i > 0 && ' · '}
            <button onClick={() => onDrill({ title: `Jobs in ${c.name}`,
                      params: { kind: 'jobs', cityState: c.name } })}
                    className="cursor-pointer text-zinc-700 underline decoration-dotted underline-offset-2 hover:text-zinc-900">
              {c.name}
            </button>{' '}
            ({c.opened}{c.everPlaced === 0 && <span className="text-orange-700"> — never placed here</span>})
          </span>
        ))}. A city with steady demand and no placement yet is the next place to focus — state
        alone is too big a unit.
      </p>
    </Block>
  )
}

/**
 * What the automation did — scoped to a window, because Kimedics report monthly.
 *
 * "Monthly" answers "what did it do in June"; a second row of chips picks the month. "Last 12
 * months" and "All time" answer the cumulative version. Median sync stays fixed across all three:
 * it comes from a latency study over thousands of syncs, not from a month's counter.
 */
function WorkBlock({ kim }: { kim: ClientReport['kim'] }) {
  const months = kim.workMonthly
  const [scope, setScope] = useState<'month' | 'last12' | 'all'>('month')
  const [pick, setPick] = useState<string>(months[months.length - 1]?.month ?? '')
  const selected = months.find(m => m.month === pick) ?? months[months.length - 1]

  const sum = (rows: typeof months) => rows.reduce((a, m) => ({
    emails: a.emails + m.emails, jobsTracked: a.jobsTracked + m.jobsTracked, inSf: a.inSf + m.inSf,
    updated: a.updated + m.updated, closed: a.closed + m.closed, patches: a.patches + m.patches,
    worksites: a.worksites + m.worksites, retries: a.retries + m.retries, hours: a.hours + m.hours,
  }), { emails: 0, jobsTracked: 0, inSf: 0, updated: 0, closed: 0, patches: 0, worksites: 0,
        retries: 0, hours: 0 })

  const last12 = sum(months.slice(-12))
  // All-time totals come from the snapshot queries, which count everything ever logged — including
  // anything that predates the per-month breakdown.
  const allTime = {
    emails: kim.emails, jobsTracked: kim.jobsTracked, inSf: 0, updated: kim.updated,
    closed: kim.closed, patches: kim.fieldPatches, worksites: kim.worksites,
    retries: kim.selfHealed, hours: kim.hoursSaved,
  }
  const w = scope === 'all' ? allTime : scope === 'last12' ? last12 : (selected ?? last12)
  const capture = scope === 'all' ? kim.capturePct
    : w.jobsTracked ? Math.round((w.inSf / w.jobsTracked) * 1000) / 10 : 0
  const weeks = Math.round(w.hours / 40)
  const windowWord = scope === 'all' ? 'since the automation went live'
    : scope === 'last12' ? `across the last ${Math.min(months.length, 12)} months`
    : selected ? `in ${monthLabelFull(selected.month)}` : ''

  const tiles = [
    { label: 'Emails processed', value: w.emails.toLocaleString(), sub: 'every Kimedics job email', tone: 'text-cyan-700' },
    { label: 'Jobs tracked', value: w.jobsTracked.toLocaleString(), sub: 'end to end, intake to close', tone: 'text-cyan-700' },
    { label: 'Fields written', value: w.patches.toLocaleString(), sub: 'corrections nobody had to type', tone: 'text-teal-700' },
    { label: 'Jobs updated', value: w.updated.toLocaleString(), sub: 'change syncs pushed', tone: 'text-zinc-800' },
    { label: 'Jobs closed', value: w.closed.toLocaleString(), sub: 'lifecycles completed', tone: 'text-zinc-800' },
    { label: 'Capture rate', value: `${capture}%`, sub: 'of tracked jobs reached Salesforce', tone: 'text-teal-700' },
    { label: 'Median sync', value: `${kim.syncMinutes} min`, sub: 'email → Salesforce, all time', tone: 'text-cyan-700' },
    { label: 'Worksites created', value: w.worksites.toLocaleString(), sub: 'set up automatically', tone: 'text-zinc-800' },
    { label: 'Self-healed', value: w.retries.toLocaleString(), sub: 'failures fixed without a human', tone: 'text-teal-700' },
  ]

  return (
    <Block title="The work the automation does"
           info={<>The counters come from the automation's own logs — every email processed and
             field written is recorded as it happens. Jobs are counted in the month they were
             <b> first seen</b>, so months add up without counting the same job twice. Median sync
             is measured across every sync ever made ({KIM_SYNC_N}), not per month, so it does not
             move with the window. The hours figure is an estimate: per-item minutes × actual
             volumes.</>}
           takeaway="Every number here is work nobody at Proxi had to do by hand."
           right={<Chips value={scope} onChange={v => setScope(v as typeof scope)} options={[
             { key: 'month', label: 'Monthly' },
             { key: 'last12', label: 'Last 12 months' },
             { key: 'all', label: 'All time' },
           ]} />}>
      {scope === 'month' && months.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1">
          {months.slice(-12).map(m => (
            <button key={m.month} onClick={() => setPick(m.month)}
                    className={cn('rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                      m.month === (selected?.month ?? '')
                        ? 'bg-zinc-900 text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200')}>
              {monthLabelFull(m.month)}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[40px] leading-none font-semibold tabular-nums text-teal-700">
            {w.hours}<span className="ml-1 text-[20px] text-teal-700/70">hours</span>
          </p>
          <p className="mt-1.5 text-[12px] text-zinc-600">
            of manual work returned {windowWord} — roughly{' '}
            <b className="text-zinc-800">{weeks} working {weeks === 1 ? 'week' : 'weeks'}</b> of a
            person's time, across {kim.statesActive} states.
          </p>
        </div>
        <div className="flex items-end gap-2">
          {months.slice(-6).map(m => {
            const max = Math.max(...months.slice(-6).map(x => x.hours), 1)
            const on = scope !== 'month' || m.month === (selected?.month ?? '')
            return (
              <button key={m.month} onClick={() => { setScope('month'); setPick(m.month) }}
                      className="flex w-10 cursor-pointer flex-col items-center">
                <span className={cn('mb-1 text-[10px] font-semibold tabular-nums',
                  on ? 'text-zinc-700' : 'text-zinc-400')}>{m.hours}</span>
                <div className={cn('w-full rounded-t-[3px]', on ? LGOOD : 'bg-teal-200/60')}
                     style={{ height: Math.max((m.hours / max) * 44, 2) }} />
                <span className="mt-1 text-[9px] text-zinc-500">{monthLabel(m.month)}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(t => (
          <div key={t.label}
               className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 transition-colors hover:border-zinc-300">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{t.label}</p>
            <p className={cn('mt-1.5 text-[24px] leading-none font-semibold tabular-nums', t.tone)}>{t.value}</p>
            <p className="mt-1 text-[10px] text-zinc-500">{t.sub}</p>
          </div>
        ))}
      </div>
    </Block>
  )
}

/** Swatch legend for the Kimedics intake bars. */
function KimLegend() {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-zinc-500">
      <Key tone="bg-sky-300/50" label="Jobs that arrived" />
      <Key tone={LGOOD} label="Filled" />
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-[2px] rounded-full bg-cyan-700" /> someone put forward
      </span>
    </div>
  )
}

function OpenList({ title, rows, onPick }: {
  title: string
  rows: { name: string; jobs: number; stale: number }[]
  onPick: (name: string) => void
}) {
  return (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-wide text-zinc-400">{title}</p>
      <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
        {rows.map(g => (
          <button key={g.name} onClick={() => onPick(g.name)}
                  className="flex w-full cursor-pointer items-baseline gap-2 rounded px-1 py-0.5 -mx-1 text-[12px] transition-colors hover:bg-zinc-100">
            <span className="min-w-0 truncate text-left text-zinc-700" title={g.name}>{g.name}</span>
            <span className="grow border-b border-dotted border-zinc-200" />
            <span className="shrink-0 font-semibold tabular-nums text-zinc-900">{g.jobs}</span>
            {g.stale > 0 && (
              <span className="shrink-0 text-[10px] tabular-nums text-orange-700">{g.stale} &gt;3mo</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── raw-data side panel ──────────────────────────────────────────────────── */

type PanelRow = {
  sfId: string | null
  title: string
  badge: string | null
  badgeTone: 'open' | 'good' | 'warn' | 'muted' | 'accent'
  sub: string
  metaLead: string | null
  leadTone: 'good' | 'warn' | 'info' | 'muted'
  meta: string
}

type PanelStat = { label: string; value: string; tone: 'good' | 'warn' | 'info' | 'muted' }

const STAT_TONE: Record<PanelStat['tone'], string> = {
  good: 'text-teal-700', warn: 'text-orange-700', info: 'text-cyan-700', muted: 'text-zinc-800',
}
const LEAD_TONE: Record<PanelRow['leadTone'], string> = {
  good: 'text-teal-700', warn: 'text-orange-700', info: 'text-cyan-700/90', muted: 'text-zinc-600',
}

const BADGE_CLS: Record<PanelRow['badgeTone'], string> = {
  open: 'bg-cyan-600/10 text-cyan-700',
  good: 'bg-teal-600/10 text-teal-700',
  warn: 'bg-orange-600/10 text-orange-700',
  muted: 'bg-zinc-100 text-zinc-600',
  accent: 'bg-violet-600/10 text-violet-700',
}

function DrillPanel({ drill, onClose }: { drill: Drill; onClose: () => void }) {
  const [rows, setRows] = useState<PanelRow[] | null>(null)
  const [stats, setStats] = useState<PanelStat[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!drill) return
    setRows(null); setStats([]); setError(null)
    const qs = new URLSearchParams(drill.params).toString()
    fetch(`/api/reports/drill?${qs}`)
      .then(res => res.json())
      .then(j => {
        if (j.ok) { setRows(j.rows); setStats(j.stats ?? []) }
        else setError(j.error || 'Failed to load.')
      })
      .catch(() => setError('Failed to load.'))
  }, [drill])

  useEffect(() => {
    if (!drill) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    // Lock the page while the panel is open — background scroll exposed the area beneath the
    // shell and read as a broken band at the bottom of the screen.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [drill, onClose])

  if (!drill) return null
  const noun = drill.params.kind === 'jobs' ? 'job'
    : drill.params.kind === 'placements' ? 'placement'
    : drill.params.kind === 'locations' ? 'location'
    : drill.params.kind === 'applications' ? 'pairing' : 'candidate'
  // Portaled to <body>: inside the report container the fixed overlay can be trapped by a
  // stacking context and fail to cover the whole viewport.
  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/25" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-zinc-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-zinc-900">{drill.title}</h3>
            {drill.sub && <p className="mt-0.5 text-[11px] text-zinc-500">{drill.sub}</p>}
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {rows === null && !error ? 'Loading…'
                : rows ? `${rows.length === 300 ? `first 300 ${noun}s` : `${rows.length} ${noun}${rows.length === 1 ? '' : 's'}`}${drill.params.kind === 'locations' ? '' : ' · rows with a link open Salesforce'}` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="close"
                  className="rounded-md px-2 py-1 text-[14px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800">×</button>
        </div>
        {stats.length > 0 && (
          <div className="grid grid-cols-2 gap-2 border-b border-zinc-200 px-5 py-3 sm:grid-cols-4">
            {stats.map(st => (
              <div key={st.label} className="flex h-full flex-col rounded-lg bg-zinc-50 px-3 py-2">
                <p className={cn('text-[19px] leading-none font-semibold tabular-nums whitespace-nowrap',
                  STAT_TONE[st.tone])}>{st.value}</p>
                <p className="mt-1 text-[10px] leading-tight text-zinc-500">{st.label}</p>
              </div>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {error && <p className="text-[12px] text-orange-700">{error}</p>}
          {rows !== null && rows.length === 0 && (
            <p className="text-[12px] text-zinc-500">Nothing matches this slice.</p>
          )}
          <div className="space-y-2">
            {(rows ?? []).map((j, i) => {
              const inner = (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="min-w-0 truncate text-[13px] font-medium text-zinc-900">
                      {j.title} {j.sfId && <span className="text-zinc-400">↗</span>}
                    </p>
                    {j.badge && (
                      <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', BADGE_CLS[j.badgeTone])}>
                        {j.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-zinc-500">{j.sub}</p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-zinc-400">
                    {j.metaLead && <span className={cn('font-medium', LEAD_TONE[j.leadTone])}>{j.metaLead}</span>}
                    {j.metaLead && j.meta && ' · '}
                    {j.meta}
                  </p>
                </>
              )
              const cls = 'block rounded-lg border border-zinc-200 px-3.5 py-2.5'
              return j.sfId ? (
                <a key={`${j.sfId}-${i}`} href={`${SF_BASE}${j.sfId}`} target="_blank" rel="noopener noreferrer"
                   className={cn(cls, 'transition-colors hover:border-zinc-400 hover:bg-zinc-50')}>
                  {inner}
                </a>
              ) : (
                <div key={i} className={cls}>{inner}</div>
              )
            })}
          </div>
        </div>
      </aside>
    </>,
    document.body,
  )
}

/* ── placements map ───────────────────────────────────────────────────────── */

// NPR-style tile grid: every state as a square roughly where it sits on the map.
const STATE_TILES: Record<string, [string, number, number]> = {
  Alaska: ['AK', 0, 0], Maine: ['ME', 10, 0],
  Vermont: ['VT', 9, 1], 'New Hampshire': ['NH', 10, 1],
  Washington: ['WA', 0, 2], Idaho: ['ID', 1, 2], Montana: ['MT', 2, 2], 'North Dakota': ['ND', 3, 2],
  Minnesota: ['MN', 4, 2], Illinois: ['IL', 5, 2], Wisconsin: ['WI', 6, 2], Michigan: ['MI', 7, 2],
  'New York': ['NY', 8, 2], 'Rhode Island': ['RI', 9, 2], Massachusetts: ['MA', 10, 2],
  Oregon: ['OR', 0, 3], Nevada: ['NV', 1, 3], Wyoming: ['WY', 2, 3], 'South Dakota': ['SD', 3, 3],
  Iowa: ['IA', 4, 3], Indiana: ['IN', 5, 3], Ohio: ['OH', 6, 3], Pennsylvania: ['PA', 7, 3],
  'New Jersey': ['NJ', 8, 3], Connecticut: ['CT', 9, 3],
  California: ['CA', 0, 4], Utah: ['UT', 1, 4], Colorado: ['CO', 2, 4], Nebraska: ['NE', 3, 4],
  Missouri: ['MO', 4, 4], Kentucky: ['KY', 5, 4], 'West Virginia': ['WV', 6, 4], Virginia: ['VA', 7, 4],
  Maryland: ['MD', 8, 4], Delaware: ['DE', 9, 4],
  Arizona: ['AZ', 1, 5], 'New Mexico': ['NM', 2, 5], Kansas: ['KS', 3, 5], Arkansas: ['AR', 4, 5],
  Tennessee: ['TN', 5, 5], 'North Carolina': ['NC', 6, 5], 'South Carolina': ['SC', 7, 5],
  'District of Columbia': ['DC', 8, 5],
  Oklahoma: ['OK', 3, 6], Louisiana: ['LA', 4, 6], Mississippi: ['MS', 5, 6], Alabama: ['AL', 6, 6],
  Georgia: ['GA', 7, 6],
  Hawaii: ['HI', 0, 7], Texas: ['TX', 3, 7], Florida: ['FL', 8, 7],
}

/* ── send widget ──────────────────────────────────────────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
type Status = 'idle' | 'sending' | 'done' | 'error'

type SendSection = 'ops' | 'djc' | 'kim' | 'all'

function SendPanel({ activeTab }: { activeTab: 'ops' | 'djc' | 'kim' }) {
  const [open, setOpen] = useState(false)
  const [emails, setEmails] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [section, setSection] = useState<SendSection>(activeTab)

  // Follow the tab the user is looking at until they pick a section explicitly.
  useEffect(() => { if (!open) setSection(activeTab) }, [activeTab, open])

  const add = (raw: string) => {
    const parts = raw.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
    const valid = parts.filter(p => EMAIL_RE.test(p) && !emails.includes(p))
    if (valid.length) setEmails(e => [...e, ...valid])
    setDraft(parts.every(p => EMAIL_RE.test(p)) ? '' : parts.filter(p => !EMAIL_RE.test(p)).join(' '))
  }

  const send = async () => {
    const list = draft.trim() && EMAIL_RE.test(draft.trim()) ? [...emails, draft.trim()] : emails
    if (!list.length) { setError('Add an email first.'); setStatus('error'); return }
    setStatus('sending'); setError('')
    try {
      const res = await fetch('/api/reports/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: list, section }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || `Send failed (${res.status}).`)
      setStatus('done'); setEmails([]); setDraft('')
      setTimeout(() => { setStatus('idle'); setOpen(false) }, 2500)
    } catch (e) {
      setStatus('error'); setError(e instanceof Error ? e.message : 'Send failed.')
    }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
              className={cn('rounded-lg border px-3 py-1.5 text-[12px] transition-colors',
                open ? 'border-zinc-400 text-zinc-700'
                  : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700')}>
        ✉ Email this report
      </button>
      {open && (
        <>
          {/* click-away layer */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-2 w-[22rem] rounded-xl border border-zinc-200 bg-white p-3 shadow-xl shadow-zinc-400/20">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wide text-zinc-400">Send report</span>
              <Chips value={section} onChange={v => setSection(v as typeof section)} options={[
                { key: 'all', label: 'Everything' },
                { key: 'ops', label: 'Operations' },
                { key: 'djc', label: 'DJC' },
                { key: 'kim', label: 'Kimedics' },
              ]} />
            </div>
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 focus-within:border-zinc-500">
              {emails.map(e => (
                <span key={e} className="inline-flex items-center gap-1 rounded bg-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-700">
                  {e}
                  <button onClick={() => setEmails(x => x.filter(y => y !== e))}
                          className="text-zinc-500 hover:text-zinc-800" aria-label={`remove ${e}`}>×</button>
                </span>
              ))}
              <input
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft) }
                  if (e.key === 'Escape') setOpen(false)
                }}
                onBlur={() => draft.trim() && add(draft)}
                placeholder={emails.length ? '' : 'name@company.com'}
                className="min-w-24 flex-1 bg-transparent py-0.5 text-[12px] text-zinc-700 placeholder-zinc-400 outline-none"
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className={cn('min-h-4 text-[11px]',
                status === 'done' ? 'text-teal-700' : status === 'error' ? 'text-orange-700' : 'text-zinc-400')}>
                {status === 'done' ? 'Sent ✓' : status === 'error' ? error
                  : 'Enter to add more than one.'}
              </p>
              <button onClick={send} disabled={status === 'sending'}
                      className={cn('shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors',
                        status === 'sending' ? 'bg-zinc-200/70 text-zinc-400'
                          : 'bg-cyan-600/10 text-cyan-700 hover:bg-cyan-600/20')}>
                {status === 'sending' ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ── bits ─────────────────────────────────────────────────────────────────── */

/** Hover card for stacked bars — a styled tooltip with the exact breakdown. */
/**
 * Tooltip that always lands on screen.
 *
 * Portaled to <body> and positioned with fixed coordinates: a CSS-only bubble anchored above its
 * trigger gets clipped by the top of the window (and by any scrolling ancestor) exactly when the
 * block is near the top of the viewport, which is where the ⓘ dots live. It measures the bubble,
 * puts it above when there is room and below when there is not, and clamps both axes to the window.
 */
function Hover({ tip, children, block, inline, style }: {
  tip: React.ReactNode
  children: React.ReactNode
  block?: boolean
  inline?: boolean
  style?: React.CSSProperties
}) {
  const anchor = useRef<HTMLSpanElement>(null)
  const bubble = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) { setPos(null); return }
    const place = () => {
      const a = anchor.current?.getBoundingClientRect()
      const b = bubble.current?.getBoundingClientRect()
      if (!a || !b) return
      const M = 8   // keep this much clear of every window edge
      const above = a.top - b.height - 6
      const top = above >= M ? above : Math.min(a.bottom + 6, window.innerHeight - b.height - M)
      const left = Math.min(Math.max(a.left + a.width / 2 - b.width / 2, M),
        Math.max(window.innerWidth - b.width - M, M))
      setPos({ top: Math.max(top, M), left })
    }
    place()
    // Scrolling moves the trigger out from under a fixed bubble — close rather than drift.
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <span ref={anchor}
          className={cn('relative', inline ? 'inline-flex' : block ? 'block w-full' : 'block min-w-0 grow')}
          style={style}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}>
      {children}
      {open && createPortal(
        <span ref={bubble}
              className="pointer-events-none fixed z-[60] w-60 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-left text-[11px] leading-relaxed text-zinc-600 shadow-xl shadow-zinc-400/25"
              style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}>
          {tip}
        </span>,
        document.body,
      )}
    </span>
  )
}

function SectionHead({ n, title, q, children }: {
  n: string; title: string; q: string; children?: React.ReactNode
}) {
  return (
    <div className="mb-5">
      <p className="text-[11px] font-semibold tracking-widest text-zinc-400">{n}</p>
      <h2 className="mt-0.5 text-[17px] font-semibold text-zinc-900">{title}</h2>
      <p className="mt-0.5 text-[13px] text-zinc-500">{q}</p>
      {children && (
        <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-zinc-700">{children}</p>
      )}
    </div>
  )
}

/** One bounded idea: a readable title, a one-line takeaway, then the chart. */
/** When the numbers were last touched, and a button to rebuild the report right now. */
function Freshness({ generatedAt, syncedAt }: { generatedAt: string; syncedAt: string | null }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const ago = (iso: string) => {
    const mins = Math.max(Math.round((Date.now() - new Date(iso).getTime()) / 60000), 0)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins} min ago`
    const h = Math.round(mins / 60)
    if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
    const d = Math.round(h / 24)
    return `${d} day${d === 1 ? '' : 's'} ago`
  }
  // Refresh does two things now: re-pull Salesforce (when the mirror is stale) and rebuild the
  // report. The Salesforce pull runs in the background, so the page reloads once it is queued and
  // says plainly what is happening rather than implying the numbers are already new.
  const refresh = async () => {
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch('/api/reports/refresh', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setBusy(false); setNote('Could not refresh — try again in a moment.'); return }
      if (body.triggered) {
        // The sync takes a minute or two; reload after it has had time to land.
        setNote(body.note ?? 'Pulling fresh data from Salesforce…')
        setTimeout(() => window.location.reload(), 90_000)
      } else {
        window.location.reload()
      }
    } catch { setBusy(false); setNote('Could not refresh — try again in a moment.') }
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
      <span>
        Salesforce data synced <b className="font-medium text-zinc-600">{syncedAt ? ago(syncedAt) : '—'}</b>
        <span className="text-zinc-400"> (auto-syncs each morning)</span>
        {' · '}report built <b className="font-medium text-zinc-600">{ago(generatedAt)}</b>
      </span>
      <Hover inline tip={<>Re-reads Salesforce for jobs, applications and placements, then rebuilds
        this report. It reads Salesforce only — it never opens DentistJobCafe, so it cannot spend a
        Profile View. If Salesforce was synced in the last few minutes it just rebuilds the page.</>}>
        <button onClick={refresh} disabled={busy}
                className={cn('rounded-md border px-2 py-0.5 text-[11px] transition-colors',
                  busy ? 'border-zinc-200 text-zinc-400'
                    : 'border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-800')}>
          {busy ? 'Refreshing…' : '↻ Refresh data'}
        </button>
      </Hover>
      {note && <span className="text-zinc-500">{note}</span>}
    </div>
  )
}

/** A subtle ⓘ that explains how a number is calculated, for readers who will ask. */
function InfoDot({ children }: { children: React.ReactNode }) {
  return (
    <Hover inline tip={children}>
      <span className="inline-flex h-[15px] w-[15px] cursor-help items-center justify-center rounded-full border border-zinc-300 text-[9px] font-semibold text-zinc-400 transition-colors hover:border-zinc-400 hover:text-zinc-600"
            aria-label="How this is calculated">i</span>
    </Hover>
  )
}

function Block({ title, takeaway, right, info, source, children }: {
  title: string
  takeaway?: React.ReactNode
  right?: React.ReactNode
  info?: React.ReactNode
  source?: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-5 rounded-xl border border-zinc-200 bg-white p-5 first:mt-0">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-zinc-800">
            <span>{title}</span>{info && <InfoDot>{info}</InfoDot>}
            {source && (
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-zinc-500">
                {source}
              </span>
            )}
          </h3>
          {takeaway && (
            <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-zinc-500">{takeaway}</p>
          )}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children}
    </div>
  )
}

function Chips({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { key: string; label: string }[]
}) {
  return (
    <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5">
      {options.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)}
                className={cn('whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                  value === o.key ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-700')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Stat({ value, label, sub, tone, onClick }: {
  value: string; label: string; sub?: React.ReactNode; tone: string; onClick?: () => void
}) {
  const inner = (
    <>
      <p className={cn('text-[22px] leading-none font-semibold tabular-nums whitespace-nowrap', tone)}>
        {value}
      </p>
      <p className="mt-1.5 text-[12px] leading-snug font-medium text-zinc-700">{label}</p>
      {sub ? <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{sub}</p> : null}
    </>
  )
  const box = 'flex h-full flex-col rounded-lg bg-zinc-100 px-4 py-3 text-left'
  if (onClick) {
    return (
      <button onClick={onClick} className={cn(box, 'cursor-pointer transition-colors hover:bg-zinc-200/70')}>
        {inner}
      </button>
    )
  }
  return <div className={box}>{inner}</div>
}

function SideTable({
  title, unit, rows, aLabel, bLabel, bTone = 'text-zinc-600', scroll = false, delta = false, onRow,
}: {
  title: string
  unit: string
  rows: { name: string; a: number; b: number }[]
  aLabel: string
  bLabel: string
  bTone?: string
  scroll?: boolean
  delta?: boolean
  onRow?: (name: string) => void
}) {
  const [sort, onSort] = useSort('a')
  const deltaOf = (r: { a: number; b: number }) =>
    r.b > 0 ? (r.a - r.b) / r.b : r.a > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
  const sorted = sortRows(rows, sort, (r, k) =>
    k === 'name' ? r.name : k === 'a' ? r.a : k === 'b' ? r.b : deltaOf(r))
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200">
      <div className="border-b border-zinc-200 bg-white px-3 py-2">
        <p className="text-[10px] uppercase tracking-wide text-zinc-500">{title}</p>
      </div>
      <div className={cn(scroll && 'max-h-64 overflow-y-auto')}>
        <table className="w-full text-[12px]">
          <thead className={cn(scroll && 'sticky top-0 bg-white')}>
            <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-400">
              <Th k="name" label={<span className="capitalize normal-case">{unit}</span>} sort={sort} onSort={onSort} left />
              <Th k="a" label={aLabel} sort={sort} onSort={onSort} />
              <Th k="b" label={bLabel} sort={sort} onSort={onSort} />
              {delta && <Th k="delta" label="Δ" sort={sort} onSort={onSort} />}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const pct = r.b > 0 ? Math.round(((r.a - r.b) / r.b) * 100) : null
              const up = r.a >= r.b
              return (
                <tr key={r.name}
                    className={cn('border-t border-zinc-200',
                      onRow && 'cursor-pointer transition-colors hover:bg-zinc-100')}
                    onClick={onRow ? () => onRow(r.name) : undefined}>
                  <td className="max-w-44 truncate px-3 py-1.5 text-zinc-800" title={r.name}>{r.name}</td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-zinc-900">{r.a}</td>
                  <td className={cn('py-1.5 pr-3 text-right tabular-nums', bTone)}>{r.b}</td>
                  {delta && (
                    <td className={cn('py-1.5 pr-3 text-right text-[11px] font-medium tabular-nums',
                      r.a === r.b ? 'text-zinc-400' : up ? 'text-teal-700' : 'text-orange-700')}>
                      {pct === null ? (r.a > 0 ? 'new' : '—')
                        : `${pct >= 0 ? '+' : ''}${pct}%`}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type SortState = { key: string; desc: boolean }

function useSort(key: string, desc = true): [SortState, (k: string) => void] {
  const [st, set] = useState<SortState>({ key, desc })
  return [st, (k: string) => set(p => p.key === k ? { key: k, desc: !p.desc } : { key: k, desc: true })]
}

const cmpVals = (a: unknown, b: unknown) =>
  typeof a === 'number' && typeof b === 'number' ? a - b
    : String(a ?? '').localeCompare(String(b ?? ''))

function sortRows<T>(rows: T[], st: SortState, get: (r: T, k: string) => unknown): T[] {
  return [...rows].sort((x, y) => (st.desc ? -1 : 1) * cmpVals(get(x, st.key), get(y, st.key)))
}

/** A sortable column header — click to sort, click again to flip. */
function Th({ k, label, sort, onSort, left, title }: {
  k: string; label: React.ReactNode; sort: SortState; onSort: (k: string) => void
  left?: boolean; title?: string
}) {
  const active = sort.key === k
  return (
    <th className={cn('py-1.5 font-medium', left ? 'px-3 text-left' : 'pr-3 text-right')}>
      <button onClick={() => onSort(k)} title={title ?? 'Click to sort'}
              className={cn('inline-flex cursor-pointer items-center gap-0.5 uppercase tracking-wide transition-colors',
                active ? 'text-zinc-700' : 'text-zinc-400 hover:text-zinc-600')}>
        {label}{active && <span className="text-[8px]">{sort.desc ? '▼' : '▲'}</span>}
      </button>
    </th>
  )
}

function Key({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-2 w-3 rounded-sm', tone)} /> {label}
    </span>
  )
}

function Take({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 max-w-3xl border-t border-zinc-200 pt-3 text-[12px] leading-relaxed text-zinc-600">
      {children}
    </p>
  )
}
