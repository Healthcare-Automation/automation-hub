'use client'

import type { ReactNode } from 'react'
import DjcOps from '@/components/djc/DjcOps'
import ViewSpend from '@/components/djc/ViewSpend'
import CandidateOutcomesView from '@/components/djc/CandidateOutcomes'
import RoleSpendView from '@/components/djc/RoleSpend'
import Outreach from '@/components/djc/Outreach'
import type {
  ViewCycle, CycleProjection, SourcingMonth, AutomationFunnel,
  EfficiencyWeek, ActivityBucket, CandidateOutcomes, LocationSupply, OutreachMonth, RoleSpend, OutreachDetail,
} from '@/lib/djcOps'

/**
 * The acquisition page as one argument, in order.
 *
 * It had become a stack of charts added one at a time, several of them saying the same thing twice
 * — two view-efficiency charts, two activity-recency charts — with no thread between them. The page
 * exists to answer one question: are we spending the DJC subscription well? Each section below is a
 * step in that answer, and nothing is here that does not move it forward.
 *
 * Sections are deliberately far apart and each opens with the question it answers. Density was the
 * complaint, not length.
 */
export default function AcquisitionStory({
  cycles, projection, sourcing, funnel, weeks, activity, outcomesCycle, outcomesAll, locations, outreach, roles, outreachDetail,
}: {
  cycles: ViewCycle[]
  projection: CycleProjection | null
  sourcing: SourcingMonth[]
  funnel: AutomationFunnel
  weeks: EfficiencyWeek[]
  activity: ActivityBucket[]
  outcomesCycle: CandidateOutcomes
  outcomesAll: CandidateOutcomes
  locations: LocationSupply[]
  outreach: OutreachMonth[]
  roles: RoleSpend[]
  outreachDetail: OutreachDetail
}) {
  // The live cycle's own counter, not the projection: the projection extrapolates the automation's
  // pace and cannot see manual use, which is most of the spend.
  const live = cycles.find(c => c.isCurrent)
  const overNow = live ? live.views - live.cap : 0

  return (
    <div className="space-y-14">
      <header className="max-w-3xl">
        <h1 className="text-[20px] font-semibold text-zinc-900 dark:text-zinc-100">Is the DJC subscription paying off?</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          DJC gives us 750 Profile Views a month. A view is the only way to see who someone is, and
          it is spent whether the answer is useful or not. This page follows the budget from the
          moment it refills to what it eventually produced.
        </p>
      </header>

      <Step
        n={1}
        title="The budget"
        question="How much of the allowance have we used, and will we run out?"
        answer={live
          ? overNow > 0
            ? `We are already ${overNow} views past this cycle's ${live.cap} cap — ${live.views} used. Most of that is not the automation.`
            : `${live.views} of ${live.cap} used this cycle, ${live.cap - live.views} still available.`
          : undefined}
      >
        <DjcOps cycles={cycles} projection={projection} sourcing={sourcing} funnel={funnel}
                only="cycles" />
      </Step>

      <Step
        n={2}
        title="What each view bought"
        question="A view is spent before we know if it was worth it — so what did we get?"
        answer={`Counting people: of ${outcomesAll.unique.toLocaleString()} candidates seen all time, ${outcomesAll.addedToSf} became new Salesforce contacts. The rest were already on file or had no reachable contact details. Step 7 counts the same story in views rather than people.`}
      >
        <CandidateOutcomesView cycle={outcomesCycle} allTime={outcomesAll}
                               locations={locations} outreach={outreach} outreachDetail={outreachDetail} only="outcomes" />
      </Step>

      <Step
        n={3}
        title="Who we spend it on, and what each costs"
        question="Which disciplines absorb the budget, and how many views does each contact take?"
      >
        <RoleSpendView roles={roles} weeks={weeks} />
      </Step>

      <Step
        n={4}
        title="Is this pool worth having?"
        question="Are the people we are paying to see actually on the market?"
      >
        <ViewSpend activity={activity} />
      </Step>

      <Step
        n={5}
        title="Does anyone actually reach them?"
        question="Sourcing a candidate is worth nothing until someone gets hold of them. How often does that happen?"
        answer={`Of ${outreachDetail.reach?.[0]?.people ?? 0} sourced, ${outreachDetail.reach?.[1]?.people ?? 0} had an attempt made — but only ${outreachDetail.reach?.[3]?.people ?? 0} ever got into a conversation. The gap is reachability, not effort.`}
      >
        <Outreach detail={outreachDetail} months={outreach} />
      </Step>

      <Step
        n={6}
        title="What happened next"
        question="Once a candidate is in Salesforce, how far do they actually get?"
        answer="Every stage, and where the pipeline loses people."
      >
        <CandidateOutcomesView cycle={outcomesCycle} allTime={outcomesAll}
                               locations={locations} outreach={outreach} outreachDetail={outreachDetail} only="outreach" />
      </Step>

      <Step
        n={7}
        title="Where the gaps are"
        question="If we were to spend the next views deliberately, where would they go?"
        answer="Steps 8 and 9 below go under the bonnet: the same budget counted in views, and what conserve mode avoided spending."
      >
        <CandidateOutcomesView cycle={outcomesCycle} allTime={outcomesAll}
                               locations={locations} outreach={outreach} outreachDetail={outreachDetail} only="locations" />
      </Step>
    </div>
  )
}

function Step({
  n, title, question, answer, children,
}: {
  n: number
  title: string
  question: string
  answer?: string
  children: ReactNode
}) {
  return (
    <section className="scroll-mt-16">
      <div className="mb-5 flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 text-[11px] font-semibold tabular-nums text-zinc-600 dark:text-zinc-400">
          {n}
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <p className="mt-0.5 text-[13px] text-zinc-500">{question}</p>
          {answer && (
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">{answer}</p>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700/50 dark:bg-zinc-800/30 dark:shadow-none p-6">{children}</div>
    </section>
  )
}
