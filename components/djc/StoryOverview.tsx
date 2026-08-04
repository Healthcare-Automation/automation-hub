'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { DjcStory } from '@/lib/djcStory'
import { cn } from '@/lib/utils'
import PlacementMonthPanel from '@/components/djc/PlacementMonthPanel'
import DrillPanel, { type DrillTarget } from '@/components/djc/DrillPanel'
import SupplyDemand from '@/components/djc/SupplyDemand'
import SourceEfficacy from '@/components/djc/SourceEfficacy'
import OpsPlacements from '@/components/djc/OpsPlacements'
import JobEffectivenessView from '@/components/djc/JobEffectiveness'

/**
 * The Overview, told as one argument rather than a wall of charts.
 *
 * Four beats, in order:
 *   1. Are we placing more people?            — the only number the business is judged on
 *   2. Where does the pipeline leak?          — where to intervene
 *   3. Who are we sourcing that nobody wants? — supply vs demand, the most actionable finding
 *   4. Which sourcing platform actually produces placements?
 *
 * "Is the automation earning its keep" lives on the Impact tab instead, beside the placement
 * verdict and the hours model — it is a question about our work, not about the business.
 *
 * Deliberately absent: candidates reviewed, runs completed, hours "saved". They measure our effort,
 * not Proxi's outcome, and they crowd out the numbers that would change a decision.
 */

function Section({
  n, title, question, children,
}: { n: number; title: string; question: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-zinc-800 pt-8 first:border-0 first:pt-0">
      <div className="mb-5 flex items-baseline gap-3">
        <span className="text-[11px] font-semibold tabular-nums text-zinc-600">0{n}</span>
        <div>
          <h2 className="text-[15px] font-semibold text-zinc-100">{title}</h2>
          <p className="mt-0.5 text-[12px] text-zinc-500">{question}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

const monthLabel = (m: string) =>
  new Date(m + '-02').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

export default function StoryOverview({ story }: { story: DjcStory }) {
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const [drill, setDrill] = useState<DrillTarget | null>(null)
  const { placements, funnel, funnelMeta, supplyDemand, demand, sources, ops, jobs } = story


  const apps = funnel[0]?.count ?? 0
  const submitted = funnel[1]?.count ?? 0
  const placed = funnel[2]?.count ?? 0


  return (
    <div className="space-y-10">
      <header className="max-w-3xl">
        <h1 className="text-[20px] font-semibold text-zinc-100">How the business is doing</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
          Placements, the roles we take on, and whether we have the people to fill them — across
          every candidate source, not just the automation. The Pipeline tab explains the mechanism
          behind these numbers; Acquisition covers the DJC subscription specifically.
        </p>
      </header>

      {/* 1 — the needle */}
      <Section n={1} title="Placements"
               question="Are we putting more people into jobs than we were?">
        <OpsPlacements ops={ops} onMonthClick={setOpenMonth} />
      </Section>

      {jobs && (
        <Section n={2} title="Filling the roles we take on"
                 question="Of the jobs that come in, how many do we actually staff?">
          <JobEffectivenessView data={jobs} />
        </Section>
      )}

      {/* 3 — where it leaks */}
      <Section n={3} title="The pipeline"
               question="Once a candidate is put forward for a job, how far do they get?">
        <p className="mb-4 text-[12px] leading-relaxed text-zinc-500">
          Each row below counts a <span className="text-zinc-300">candidate–job pairing</span>, not a
          person: {apps.toLocaleString()} pairings across{' '}
          <span className="text-zinc-300">{funnelMeta.people.toLocaleString()} people</span> and{' '}
          {funnelMeta.jobs.toLocaleString()} jobs — roughly{' '}
          {(apps / (funnelMeta.people || 1)).toFixed(1)} per person. Recruiters create these when they
          put someone forward; only 6% appear on the day a candidate joins Salesforce.{' '}
          <span className="text-zinc-600">Click any row to see the people in it.</span>
        </p>
        <div className="space-y-2.5">
          {([
            { label: 'Put forward for a job', n: apps, of: apps, tone: 'bg-zinc-500/50', stage: 'apps' as const },
            { label: 'Reached submittal', n: submitted, of: apps, tone: 'bg-cyan-400/60', stage: 'submitted' as const },
            { label: 'Placed', n: placed, of: apps, tone: 'bg-emerald-400/70', stage: 'placed' as const },
          ]).map(s => (
            <button key={s.label} type="button"
                    onClick={() => setDrill({ kind: 'funnel', stage: s.stage })}
                    className="block w-full rounded-md px-1 py-0.5 text-left transition-colors hover:bg-zinc-800/40">
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="text-zinc-300">{s.label}</span>
                <span className="tabular-nums text-zinc-400">
                  {s.n.toLocaleString()}{' '}
                  <span className="text-zinc-600">({Math.round((s.n / (s.of || 1)) * 100)}%)</span>
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-800">
                <div className={cn('h-full rounded-full', s.tone)}
                     style={{ width: `${Math.round((s.n / (s.of || 1)) * 100)}%` }} />
              </div>
            </button>
          ))}
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-zinc-400">
          <span className="font-medium text-zinc-200">
            {Math.round(((apps - submitted) / (apps || 1)) * 100)}% never reach submittal.
          </span>{' '}
          Someone was put forward for a job and it went no further — matched but never presented to
          the client. The submittal step cuts harder still: {Math.round(((submitted - placed) /
          (submitted || 1)) * 100)}% of submitted applications never convert. Interview and offer
          stages are left out because they are recorded on only about a third of placements, so a
          fuller funnel would mislead rather than inform.
        </p>
      </Section>

      {/* 3 — supply vs demand, as three separate questions */}
      <Section n={4} title="Supply vs demand"
               question="Are we filling the jobs that come through?">
        <SupplyDemand data={demand} />
      </Section>

      {/* 4 — every platform, not just DJC */}
      <Section n={5} title="Where candidates come from"
               question="Which platform actually produces placements?">
        <SourceEfficacy rows={sources} />
      </Section>

      {/* "What the automation has produced" moved to the Impact tab: it answers a different
          question from the rest of this page — how the automation is doing, rather than how the
          business is doing — and it sits next to the placement verdict and the hours model there. */}
      {drill && <DrillPanel target={drill} onClose={() => setDrill(null)} />}

      {openMonth && (
        <PlacementMonthPanel
          month={openMonth}
          isCurrent={openMonth === ops.monthly[ops.monthly.length - 1]?.month}
          onClose={() => setOpenMonth(null)}
          onNavigate={setOpenMonth}
        />
      )}
    </div>
  )
}
