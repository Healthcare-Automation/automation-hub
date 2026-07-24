'use client'

import Link from 'next/link'
import { Card, BarList, SmallLabel } from '@/components/DjcInsightsPanel'
import type { DjcOverview } from '@/lib/djcPipeline'

const CYAN = '#0891b2'
const EMERALD = '#059669'

/** The daily pulse: everything a stakeholder needs at a glance, each block linking one level
 *  deeper. Data refreshes with every hourly automation run. */
export default function OverviewView({ data }: { data: DjcOverview }) {
  const runOk = data.lastRun.status === 'ok'
  return (
    <div className="space-y-8">
      {/* Status line */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
        <span className={runOk ? 'text-emerald-400' : 'text-amber-400'}>
          ● {runOk ? 'Automation healthy' : `Last run: ${data.lastRun.status ?? 'unknown'}`}
        </span>
        <span>last sync {data.lastRun.at ?? '—'} ET · refreshes hourly</span>
        {data.conserveActive && (
          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-cyan-300">
            view-conserve mode active
          </span>
        )}
        {data.viewsRemaining !== null && data.viewsRemaining === 0 && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-300">
            profile views exhausted — refills Aug 15
          </span>
        )}
      </div>

      {/* Hero numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Hero
          big={data.placementsThisYear}
          label="placements this year"
          detail="DJC-sourced dental professionals"
          href="/djc/pipeline"
          accent="text-cyan-300"
        />
        <Hero
          big={data.placementsAllTime}
          label="placements all-time"
          detail={`across ${data.peoplePlaced} professionals — many placed repeatedly`}
          href="/djc/pipeline"
        />
        <Hero
          big={data.automation.placedOrExtended}
          label="placements from automation-sourced candidates"
          detail={`${data.automation.candidatesCreated} candidates sourced · ${data.automation.applications} applications since mid-June`}
          href="/djc/pipeline"
          accent="text-emerald-300"
        />
        <Hero
          big={data.netNewThisQuarter}
          label="net-new candidates this quarter"
          detail={
            data.viewsRemaining !== null
              ? `${data.viewsRemaining} profile views remaining`
              : 'sourcing continues hourly'
          }
          href="/djc/acquisition"
        />
      </div>

      {/* Trends */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Placements per year"
          sub="DJC-sourced placements have tripled since 2022 — and 2026 is on pace to beat 2025."
        >
          <BarList
            items={data.placementsPerYear.slice(-8).map(y => ({ key: y.year, label: y.year, count: y.count, color: CYAN }))}
            total={Math.max(...data.placementsPerYear.map(y => y.count), 1)}
            relative
          />
          <Link href="/djc/pipeline" className="mt-3 inline-block text-[11px] text-cyan-400 hover:underline">
            Full pipeline →
          </Link>
        </Card>
        <Card
          title="Fresh candidate supply"
          sub="New professionals joining DJC each month — the pool the automation harvests from."
        >
          <BarList
            items={data.monthlySignups.map(m => ({
              key: m.month,
              label: new Date(m.month + '-02').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
              count: m.count,
              color: EMERALD,
            }))}
            total={Math.max(...data.monthlySignups.map(m => m.count), 1)}
            relative
          />
          <Link href="/djc/candidates" className="mt-3 inline-block text-[11px] text-cyan-400 hover:underline">
            Who these candidates are →
          </Link>
        </Card>
      </div>

      {/* Where to dig */}
      <div className="grid gap-3 sm:grid-cols-3">
        <DigCard
          href="/djc/pipeline"
          title="Pipeline"
          text="Applications by stage, recent placements, who's in interviews right now, and where candidates stall."
        />
        <DigCard
          href="/djc/candidates"
          title="Candidates"
          text="Experience, schools, languages, specialties, locations — resume-mined profiles of the whole pool."
        />
        <DigCard
          href="/djc/acquisition"
          title="Acquisition"
          text="Where every profile view went, the sourcing funnel, and how good DJC is as a source."
        />
      </div>
    </div>
  )
}

function Hero({
  big, label, detail, href, accent,
}: {
  big: number
  label: string
  detail: string
  href: string
  accent?: string
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-5 transition-colors hover:border-zinc-600 hover:bg-zinc-800/60"
    >
      <div className={`text-3xl font-semibold leading-none tabular-nums ${accent ?? 'text-zinc-100'}`}>
        {big.toLocaleString()}
      </div>
      <div className="mt-2 text-xs font-medium text-zinc-200">{label}</div>
      <div className="mt-1 text-[11px] leading-snug text-zinc-500">{detail}</div>
    </Link>
  )
}

function DigCard({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-zinc-700/40 bg-zinc-900/40 p-4 transition-colors hover:border-cyan-800/50 hover:bg-zinc-800/40"
    >
      <p className="text-[13px] font-semibold text-zinc-100">{title} →</p>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{text}</p>
    </Link>
  )
}
