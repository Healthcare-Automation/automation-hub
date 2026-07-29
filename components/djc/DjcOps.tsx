'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ViewCycle, CycleProjection, SourcingMonth, AutomationFunnel } from '@/lib/djcOps'

const CAP = 750

/**
 * DJC operating view: where the Profile View allowance goes, and what it produces.
 *
 * The cycle is 15th-to-14th because that is when DJC refills the allowance — calendar months would
 * split every cycle across two bars and make the cap meaningless.
 */
/** `only` lets the page place each block in its own narrative step instead of one dense stack. */
export default function DjcOps({
  cycles, projection, sourcing, funnel, only,
}: {
  cycles: ViewCycle[]
  projection: CycleProjection | null
  sourcing: SourcingMonth[]
  funnel: AutomationFunnel
  only?: 'cycles' | 'sourcing' | 'funnel'
}) {
  if (only === 'cycles') return <CycleUsage cycles={cycles} projection={projection} />
  if (only === 'sourcing') return <Sourcing months={sourcing} />
  if (only === 'funnel') return <Funnel f={funnel} />
  return (
    <div className="space-y-10">
      <CycleUsage cycles={cycles} projection={projection} />
      <Sourcing months={sourcing} />
      <Funnel f={funnel} />
    </div>
  )
}

/* ── Views per cycle, against the cap ─────────────────────────────────────── */

function CycleUsage({ cycles, projection }: { cycles: ViewCycle[]; projection: CycleProjection | null }) {
  const max = Math.max(CAP, ...cycles.map(c => c.views)) * 1.05
  // The live cycle's own counter is the truth about whether we are over, not the projection —
  // the projection only extrapolates the automation's pace and misses manual use entirely.
  const live = cycles.find(c => c.isCurrent)
  const overNow = live ? live.views - live.cap : 0

  return (
    <section>
      <h3 className="text-[13px] font-semibold text-zinc-100">Profile Views per cycle</h3>
      <p className="mt-0.5 max-w-3xl text-[12px] leading-relaxed text-zinc-500">
        Read from DJC&rsquo;s own counter, not from what the automation did — the counter also moves for
        manual logins and backfills. Cycles run 15th to 14th, when the allowance refills. History
        starts 9 Jul, when counter snapshots began.
      </p>

      {live && (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat value={live.views.toLocaleString()} label="used this cycle"
                detail={`DJC's own counter · cap ${live.cap}`}
                tone={overNow > 0 ? 'text-orange-300' : 'text-cyan-300'} />
          <Stat value={overNow > 0 ? `+${overNow}` : `${live.cap - live.views}`}
                label={overNow > 0 ? 'over the cap' : 'still available'}
                detail={overNow > 0 ? 'add-on views were bought' : 'at the current counter reading'}
                tone={overNow > 0 ? 'text-orange-300' : 'text-teal-300'} />
          <Stat value={live.addedToSf.toLocaleString()} label="became new contacts"
                detail="what the automation got for its share" tone="text-teal-300" />
          <Stat value={live.other.toLocaleString()} label="manual or unattributed"
                detail="counter movement the automation did not cause" tone="text-zinc-200" />
        </div>
      )}

      <div className="mt-5 space-y-2.5">
        {cycles.map(c => {
          const seg = [
            { n: c.addedToSf, tone: 'bg-emerald-500/80', label: 'added to Salesforce' },
            { n: c.alreadyInSf, tone: 'bg-cyan-500/60', label: 'already in Salesforce' },
            { n: c.noContact, tone: 'bg-amber-500/60', label: 'no contact found' },
            { n: c.other, tone: 'bg-zinc-600/70', label: 'other' },
          ].filter(s => s.n > 0)
          return (
            <div key={c.cycleStart} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-[12px] text-zinc-300">
                {fmtCycle(c.cycleStart)}
                {c.isCurrent && <span className="ml-1 text-[10px] text-zinc-600">now</span>}
              </span>
              <span className="relative flex h-6 grow overflow-hidden rounded bg-zinc-800/50">
                {seg.map(s => (
                  <span key={s.label} className={s.tone} style={{ width: `${(s.n / max) * 100}%` }}
                        title={`${s.n} ${s.label}`} />
                ))}
                {/* The cap, drawn on the same scale — the point of the whole chart. */}
                <span className="absolute inset-y-0 w-px bg-zinc-300/60" style={{ left: `${(c.cap / max) * 100}%` }} />
              </span>
              <span className={cn('w-28 shrink-0 text-right text-[12px] font-semibold tabular-nums',
                c.views > c.cap ? 'text-orange-300' : 'text-zinc-200')}>
                {c.views.toLocaleString()}
                <span className="ml-1 text-[10px] font-normal text-zinc-600">of {c.cap}</span>
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-500">
        <Key tone="bg-emerald-500/80" label="added to Salesforce" />
        <Key tone="bg-cyan-500/60" label="already in Salesforce" />
        <Key tone="bg-amber-500/60" label="no contact found" />
        <Key tone="bg-zinc-600/70" label="manual or unattributed" />
        <span className="text-zinc-600">| vertical line = that cycle&rsquo;s cap</span>
      </div>

      {projection && projection.byWeekday.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-zinc-600">Views by weekday</p>
          <div className="flex gap-1.5">
            {projection.byWeekday.map(d => {
              const wmax = Math.max(...projection.byWeekday.map(x => x.views), 1)
              return (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-zinc-400">{d.views}</span>
                  <div className="flex h-12 w-full items-end">
                    <div className="w-full rounded-t bg-cyan-400/50"
                         style={{ height: `${Math.max((d.views / wmax) * 100, 3)}%` }} />
                  </div>
                  <span className="text-[10px] text-zinc-600">{d.day}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

/* ── Candidates created per month, by role ────────────────────────────────── */

type RoleKey = 'generalDentist' | 'specialist' | 'hygienist' | 'assistant'
const ROLES: { key: RoleKey; label: string; tone: string }[] = [
  { key: 'generalDentist', label: 'General dentists', tone: 'bg-cyan-400/70' },
  { key: 'specialist', label: 'Specialists', tone: 'bg-violet-400/70' },
  { key: 'hygienist', label: 'Hygienists', tone: 'bg-emerald-400/70' },
  { key: 'assistant', label: 'Assistants', tone: 'bg-amber-400/70' },
]

function Sourcing({ months }: { months: SourcingMonth[] }) {
  const [only, setOnly] = useState<RoleKey | null>(null)
  const shown = only ? ROLES.filter(r => r.key === only) : ROLES
  const totals = months.map(m => shown.reduce((a, r) => a + m[r.key], 0))
  const max = Math.max(...totals, 1)

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-zinc-100">New candidates added to Salesforce</h3>
          <p className="mt-0.5 text-[12px] text-zinc-500">Created by the automation, by month.</p>
        </div>
        <span className="inline-flex rounded-lg border border-zinc-700/60 bg-zinc-800/40 p-0.5">
          <button onClick={() => setOnly(null)}
                  className={cn('rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                    !only ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300')}>
            All
          </button>
          {ROLES.map(r => (
            <button key={r.key} onClick={() => setOnly(r.key)}
                    className={cn('rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                      only === r.key ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300')}>
              {r.label}
            </button>
          ))}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {months.map((m, i) => (
          <div key={m.month} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-[12px] text-zinc-400">{fmtMonth(m.month)}</span>
            <span className="flex h-6 grow overflow-hidden rounded bg-zinc-800/50">
              {shown.map(r => m[r.key] > 0 && (
                <span key={r.key} className={r.tone} style={{ width: `${(m[r.key] / max) * 100}%` }}
                      title={`${m[r.key]} ${r.label.toLowerCase()}`} />
              ))}
            </span>
            <span className="w-14 shrink-0 text-right text-[12px] font-semibold tabular-nums text-zinc-200">
              {totals[i]}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-500">
        {shown.map(r => <Key key={r.key} tone={r.tone} label={r.label} />)}
      </div>
    </section>
  )
}

/* ── What happened to them ────────────────────────────────────────────────── */

function Funnel({ f }: { f: AutomationFunnel }) {
  const steps = [
    { label: 'added to Salesforce', n: f.sourced, tone: 'bg-cyan-400/70' },
    { label: 'put forward for a job', n: f.applied, tone: 'bg-violet-400/70' },
    { label: 'reached submittal', n: f.submitted, tone: 'bg-amber-400/70' },
    { label: 'placed', n: f.placed, tone: 'bg-emerald-400/80' },
  ]
  const pct = f.sourced ? Math.round((f.applied / f.sourced) * 100) : 0
  return (
    <section>
      <h3 className="text-[13px] font-semibold text-zinc-100">What happened to them</h3>
      <p className="mt-0.5 text-[12px] text-zinc-500">
        Every candidate the automation created, and how far each one got.
      </p>
      <div className="mt-4 space-y-1.5">
        {steps.map(s => (
          <div key={s.label} className="flex items-center gap-3">
            <span className="w-44 shrink-0 text-[12px] text-zinc-300">{s.label}</span>
            <span className="relative h-5 grow rounded bg-zinc-800/50">
              <span className={cn('absolute inset-y-0 left-0 rounded', s.tone)}
                    style={{ width: `${Math.max((s.n / (f.sourced || 1)) * 100, 0.6)}%` }} />
            </span>
            <span className="w-20 shrink-0 text-right text-[12px] font-semibold tabular-nums text-zinc-200">
              {s.n.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-amber-200/90">
        Only <span className="font-semibold">{pct}%</span> of what the automation sources is ever put
        forward for a job. That step — not sourcing — is what caps the automation&rsquo;s contribution
        to placements.
      </p>
    </section>
  )
}

/* ── bits ─────────────────────────────────────────────────────────────────── */

const fmtCycle = (d: string) => {
  const s = new Date(d + 'T00:00:00Z')
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
}
const fmtMonth = (m: string) =>
  new Date(m + '-02').toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })

function Key({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-2.5 w-3 rounded-sm', tone)} /> {label}
    </span>
  )
}

function Stat({ value, label, detail, tone }: { value: string; label: string; detail: string; tone: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
      <p className={cn('text-[22px] leading-none font-semibold tabular-nums', tone)}>{value}</p>
      <p className="mt-1.5 text-[11px] text-zinc-300">{label}</p>
      <p className="mt-0.5 text-[10px] text-zinc-600">{detail}</p>
    </div>
  )
}
