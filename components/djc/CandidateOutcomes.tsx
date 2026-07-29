'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { CandidateOutcomes, LocationSupply, OutreachMonth, OutreachDetail } from '@/lib/djcOps'
import { CHART } from '@/lib/chartTokens'

/**
 * Who the automation saw, where the work is, and what happened next.
 *
 * The outcome buckets are people rather than events and are mutually exclusive, so they sum to the
 * total. An earlier version counted events, which let the parts exceed the whole whenever a
 * candidate appeared in more than one run.
 */
export default function CandidateOutcomesView({
  cycle, allTime, locations, outreach, outreachDetail, only,
}: {
  cycle: CandidateOutcomes
  allTime: CandidateOutcomes
  locations: LocationSupply[]
  outreach: OutreachMonth[]
  outreachDetail: OutreachDetail
  only?: 'outcomes' | 'locations' | 'outreach'
}) {
  // The hook runs unconditionally — an early return above a useState breaks the rules of hooks and
  // would crash as soon as `only` changed between renders.
  const [window, setWindow] = useState<'cycle' | 'all'>('cycle')
  const o = window === 'cycle' ? cycle : allTime
  const parts = [
    { label: 'added to Salesforce', n: o.addedToSf, tone: CHART.good, text: 'text-teal-300' },
    { label: 'already in Salesforce', n: o.alreadyInSf, tone: CHART.primary, text: 'text-cyan-300' },
    { label: 'no contact found', n: o.noContact, tone: CHART.warn, text: 'text-orange-300' },
    { label: 'other', n: o.other, tone: CHART.neutral, text: 'text-zinc-400' },
  ].filter(p => p.n > 0)

  if (only === 'locations') return <LocationView rows={locations} />
  if (only === 'outreach') return <OutreachView months={outreach} detail={outreachDetail} />

  return (
    <div className="space-y-10">
      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[13px] font-semibold text-zinc-100">Candidates seen</h3>
            <p className="mt-0.5 text-[12px] text-zinc-500">
              Distinct people, not views — someone seen in three runs counts once.
            </p>
          </div>
          <span className="inline-flex rounded-lg border border-zinc-700/60 bg-zinc-800/40 p-0.5">
            {([['cycle', 'This cycle'], ['all', 'All time']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setWindow(k)}
                      className={cn('rounded-md px-3 py-1 text-[11px] font-medium transition-colors',
                        window === k ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300')}>
                {label}
              </button>
            ))}
          </span>
        </div>

        <p className="mt-4 text-[30px] leading-none font-semibold tabular-nums text-zinc-100">
          {o.unique.toLocaleString()}
          <span className="ml-2 text-[13px] font-normal text-zinc-500">unique candidates</span>
        </p>

        <div className="mt-3 flex h-7 w-full overflow-hidden rounded-lg">
          {parts.map(p => (
            <div key={p.label} className={cn('flex items-center justify-center', p.tone)}
                 style={{ width: `${(p.n / (o.unique || 1)) * 100}%` }} title={`${p.n} ${p.label}`}>
              <span className="px-1 text-[11px] font-semibold tabular-nums text-zinc-950">{p.n}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-zinc-500">
          {parts.map(p => (
            <span key={p.label} className="flex items-center gap-1.5">
              <span className={cn('h-2.5 w-3 rounded-sm', p.tone)} />
              <span className={p.text}>{p.n.toLocaleString()}</span> {p.label}
              <span className="text-zinc-600">({Math.round((p.n / (o.unique || 1)) * 100)}%)</span>
            </span>
          ))}
        </div>
      </section>

      {!only && <LocationView rows={locations} />}
      {!only && <OutreachView months={outreach} detail={outreachDetail} />}
    </div>
  )
}

/* ── Open jobs vs available candidates, per state ─────────────────────────── */

/**
 * Supply per state, as a ratio rather than two raw bars.
 *
 * The previous version drew a jobs bar and a candidates bar per state on a shared scale. Texas has
 * 187 candidates and 6 jobs, so every jobs bar collapsed to a stub with its label spilling out of
 * it, and fourteen states meant twenty-eight bars of near-identical stubs.
 *
 * One row per state, sorted tightest first, because the states where supply barely covers demand
 * are the only ones anyone acts on.
 */
function LocationView({ rows }: { rows: LocationSupply[] }) {
  const shown = rows
    .filter(r => r.openJobs > 0)
    .map(r => ({ ...r, ratio: r.candidates / r.openJobs }))
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 14)
  // Capped so one abundant state does not flatten every other bar; anything past the cap is
  // labelled rather than drawn, since the exact height stops mattering once supply is plentiful.
  const CAP = 15
  const tight = shown.filter(r => r.ratio < 2)

  return (
    <section>
      <h3 className="text-[13px] font-semibold text-zinc-100">Where supply is tightest</h3>
      <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500">
        Candidates on the market for every open job in that state.
        {tight.length > 0 && (
          <span className="text-amber-300">
            {' '}{tight.length} {tight.length === 1 ? 'state has' : 'states have'} fewer than two
            candidates per job.
          </span>
        )}
      </p>

      <div className="mb-1.5 mt-4 flex items-center gap-3 text-[10px] uppercase tracking-wide text-zinc-600">
        <span className="w-32 shrink-0">State</span>
        <span className="grow">Candidates per open job</span>
        <span className="w-16 shrink-0 text-right">Jobs</span>
        <span className="w-20 shrink-0 text-right">Candidates</span>
        <span className="w-24 shrink-0 text-right">Placed here</span>
      </div>

      <div className="space-y-1.5">
        {shown.map(r => {
          const over = r.ratio > CAP
          const tightRow = r.ratio < 2
          return (
            <div key={r.state} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-[12px] text-zinc-300" title={r.state}>
                {r.state}
              </span>
              <span className="relative h-5 grow rounded bg-zinc-800/40">
                <span className={cn('absolute inset-y-0 left-0 rounded',
                  tightRow ? CHART.warn : CHART.good)}
                      style={{ width: `${Math.min((r.ratio / CAP) * 100, 100)}%` }} />
                <span className={cn('absolute inset-y-0 flex items-center px-2 text-[11px] font-medium tabular-nums',
                  tightRow ? 'text-amber-200' : 'text-teal-100')}
                      style={{ left: `${Math.min((r.ratio / CAP) * 100, 100)}%` }}>
                  {r.ratio.toFixed(1)}×{over && '+'}
                </span>
              </span>
              <span className="w-16 shrink-0 text-right text-[12px] tabular-nums text-zinc-400">
                {r.openJobs}
              </span>
              <span className="w-20 shrink-0 text-right text-[12px] tabular-nums text-zinc-400">
                {r.candidates}
              </span>
              {/* Whether we have ever filled a role here — the same ratio reads very differently in
                  a state with a track record than in one we have never cracked. */}
              <span className={cn('w-24 shrink-0 text-right text-[12px] tabular-nums',
                r.everPlaced > 0 ? 'text-teal-300' : 'text-orange-300')}>
                {r.everPlaced > 0 ? r.everPlaced : 'never'}
              </span>
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
        Bars are capped at {CAP}× — past that the exact figure stops mattering. Amber marks under two
        candidates per job, where a single person turning the work down leaves it unfilled.
        &ldquo;Placed here&rdquo; is our all-time track record in that state; a state we have never
        filled is a harder prospect than the ratio alone suggests.
      </p>
    </section>
  )
}

/* ── What happened to each month's intake ─────────────────────────────────── */

/**
 * The intake as a waterfall: what arrives, what is lost at each step, what survives.
 *
 * A table gave every stage equal visual weight, which buried the finding — 96% of everything the
 * automation sources is lost at the very first step. Proportional bars make that drop impossible to
 * miss, and the loss between stages is labelled rather than left to subtraction.
 *
 * Bars are scaled to the intake, so the later stages are genuinely tiny. That is the point, not a
 * rendering fault, and a minimum width keeps them visible.
 */
function OutreachView({ months, detail }: { months: OutreachMonth[]; detail: OutreachDetail }) {
  const tot = months.reduce(
    (a, m) => ({
      sourced: a.sourced + m.sourced,
      contacted: a.contacted + m.contacted,
      putForward: a.putForward + m.putForward,
      submitted: a.submitted + m.submitted,
      placed: a.placed + m.placed,
    }),
    { sourced: 0, contacted: 0, putForward: 0, submitted: 0, placed: 0 },
  )

  // One hue, not four. These stages are the same population getting smaller, so a different colour
  // per stage implied four different things were being measured. Cyan matches the candidate charts
  // above it; the last step lifts to teal because reaching it is the outcome, not another stage.
  const stages = [
    { label: 'Added to Salesforce', n: tot.sourced, tone: CHART.primary,
      note: 'the automation put them on file' },
    // The step that was missing: Salesforce logs every call, text and email against a Contact.
    { label: 'Contacted by a recruiter', n: tot.contacted, tone: CHART.primary,
      note: 'a call, text or email was logged' },
    { label: 'Put forward for a job', n: tot.putForward, tone: CHART.primary,
      note: 'a recruiter matched them to a role' },
    { label: 'Reached submittal', n: tot.submitted, tone: CHART.primary,
      note: 'the client saw them' },
    { label: 'Placed', n: tot.placed, tone: CHART.good,
      note: 'they started work' },
  ]
  const base = tot.sourced || 1

  return (
    <section>
      <h3 className="text-[13px] font-semibold text-zinc-100">Where the pipeline loses them</h3>
      <p className="mt-0.5 text-[12px] text-zinc-500">
        Everyone the automation has created, and where they stop.
      </p>

      <div className="mt-5">
        {stages.map((s, i) => {
          const prev = i === 0 ? null : stages[i - 1]
          const lost = prev ? prev.n - s.n : 0
          const kept = prev && prev.n ? Math.round((s.n / prev.n) * 100) : null
          return (
            <div key={s.label}>
              {/* The loss between stages, called out on its own line. */}
              {prev && (
                <div className="flex items-center gap-3 py-1">
                  <span className="w-36 shrink-0" />
                  <span className="flex grow items-center gap-2">
                    <span className="text-[10px] tabular-nums text-amber-300/60">
                      −{lost.toLocaleString()}
                    </span>
                    <span className="h-px grow bg-zinc-800" />
                    <span className="shrink-0 text-[10px] tabular-nums text-zinc-600">
                      {kept}% continue
                    </span>
                  </span>
                  <span className="w-16 shrink-0" />
                  <span className="w-12 shrink-0" />
                </div>
              )}
              {/* Row shape matches the activity and outcome charts above: same label width, same
                  bar height, same number columns. */}
              <div className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-[12px] leading-tight text-zinc-300">
                  {s.label}
                  <span className="block text-[10px] text-zinc-600">{s.note}</span>
                </span>
                <span className="relative h-5 grow rounded bg-zinc-800/40">
                  <span className={cn('absolute inset-y-0 left-0 rounded', s.tone)}
                        style={{ width: `${Math.max((s.n / base) * 100, 0.8)}%` }} />
                </span>
                <span className="w-16 shrink-0 text-right text-[12px] font-semibold tabular-nums text-zinc-100">
                  {s.n.toLocaleString()}
                </span>
                <span className="w-12 shrink-0 text-right text-[12px] tabular-nums text-zinc-500">
                  {Math.round((s.n / base) * 100)}%
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Detail lives in its own section; this only carries the shape of the drop. */}
      <p className="mt-4 max-w-3xl text-[12px] leading-relaxed text-amber-200/85">
        <span className="font-semibold">
          The biggest single loss is at outreach — {detail.neverContacted} of {tot.sourced} were
          never called at all.
        </span>{' '}
        Of those who were, {detail.contactedNotForward} still never reached a job. The section above
        breaks that down.
      </p>

      {months.length > 1 && (
        <div className="mt-6 border-t border-zinc-800 pt-4">
          <p className="mb-2.5 text-[11px] uppercase tracking-wide text-zinc-600">By month added</p>
          <div className="space-y-2">
            {months.map(m => {
              const pct = m.sourced ? (m.putForward / m.sourced) * 100 : 0
              return (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 text-[12px] text-zinc-400">
                    {new Date(m.month + '-02').toLocaleDateString('en-US',
                      { month: 'short', year: 'numeric', timeZone: 'UTC' })}
                  </span>
                  <span className="relative h-4 grow rounded bg-zinc-800/40">
                    <span className="absolute inset-y-0 left-0 rounded bg-cyan-500/25"
                          style={{ width: '100%' }} />
                    <span className="absolute inset-y-0 left-0 rounded bg-cyan-400/60"
                          style={{ width: `${Math.max(pct, 0.6)}%` }} />
                  </span>
                  <span className="w-32 shrink-0 text-right text-[11px] tabular-nums text-zinc-500">
                    <span className="text-cyan-300">{m.putForward}</span> of {m.sourced} worked
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
