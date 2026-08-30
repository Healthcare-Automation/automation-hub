'use client'

import { computeCost, pricingSchedule, fmtUSD, VENDOR, type Automation } from '@/lib/aiCost'
import type { UsageWindows } from '@/lib/aiUsage'
import type { ActualCost } from '@/lib/aiBilling'

const ACCENT = {
  emerald: { text: 'text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500', soft: 'bg-emerald-500/15', ring: 'ring-emerald-500/25', grad: 'from-emerald-500/10' },
  cyan: { text: 'text-cyan-700 dark:text-cyan-300', bar: 'bg-cyan-500', soft: 'bg-cyan-500/15', ring: 'ring-cyan-500/25', grad: 'from-cyan-500/10' },
} as const

/** Unmistakable tag: solid green = a real billed figure, dashed = our estimate. */
function Tag({ billed }: { billed: boolean }) {
  return billed ? (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-500/30">
      <span className="h-1 w-1 rounded-full bg-emerald-500 dark:bg-emerald-400" />Billed
    </span>
  ) : (
    <span className="rounded border border-dashed border-zinc-400 dark:border-zinc-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
      Est.
    </span>
  )
}

export function AiCostPanel({
  automation,
  usage,
  actual,
  accent = 'emerald',
}: {
  automation: Automation
  usage: UsageWindows
  actual?: ActualCost
  accent?: keyof typeof ACCENT
}) {
  const a = ACCENT[accent]
  const month = computeCost(automation, usage.thirtyDay)
  const week = computeCost(automation, usage.sevenDay)
  const vendor = VENDOR[automation]

  // Headline prefers the real billed figure; everything else (breakdown, forecast) is modeled.
  const billed = actual?.available === true
  const headline = billed ? (actual!.last30 ?? 0) : month.total
  const runRate7 = billed && actual!.last7 != null ? actual!.last7 : week.total
  const perMonth = (runRate7 / 7) * 30
  const perYear = (runRate7 / 7) * 365
  const tilde = (n: number) => `~${fmtUSD(n)}`

  const maxCost = Math.max(1e-6, ...month.layers.map((l) => l.cost))
  const ranked = [...month.layers].sort((x, y) => y.cost - x.cost)
  const sched = pricingSchedule(automation, usage.thirtyDay)

  return (
    <div className="space-y-3">
      {/* Legend — what the marks mean */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
          <strong className="font-medium text-zinc-700 dark:text-zinc-400">Billed</strong> — exact, from the {vendor} invoice
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono text-zinc-600 dark:text-zinc-400">~</span>
          <strong className="font-medium text-zinc-700 dark:text-zinc-400">Estimate</strong> — our model from logged activity
        </span>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900/40 dark:shadow-none p-5">
        <div className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${a.grad} to-transparent`} />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">AI spend · last 30 days</p>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${a.soft} ${a.text} ring-1 ${a.ring}`}>{vendor}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white">{billed ? fmtUSD(headline) : tilde(headline)}</p>
              <Tag billed={billed} />
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {billed
                ? <>Our model put it at {tilde(month.total)} · {month.totalCalls.toLocaleString()} AI calls</>
                : <>{month.totalCalls.toLocaleString()} AI calls across {month.layers.length} step{month.layers.length === 1 ? '' : 's'}</>}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Projected at this pace</p>
              <Tag billed={false} />
            </div>
            <p className="mt-1 text-lg font-semibold text-zinc-800 dark:text-zinc-200">{tilde(perMonth)}<span className="text-xs font-normal text-zinc-500"> / month</span></p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{tilde(perYear)}<span className="text-xs text-zinc-400 dark:text-zinc-600"> / year</span></p>
          </div>
        </div>
      </div>

      {/* Breakdown — always our modeled allocation (vendors bill one lump sum) */}
      <div>
        <div className="mb-2 flex items-center gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-600">Where the AI spend goes</p>
          <Tag billed={false} />
        </div>
        <div className="space-y-2.5">
          {ranked.map((l) => (
            <div key={l.key} className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700/40 dark:bg-zinc-800/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{l.name}</span>
                  <span className="rounded bg-zinc-200 dark:bg-zinc-700/50 px-1.5 py-0.5 text-[9px] font-medium text-zinc-600 dark:text-zinc-400">{l.model}</span>
                </div>
                <div className="text-right">
                  <span className="text-[13px] font-semibold text-zinc-900 dark:text-white">{tilde(l.cost)}</span>
                  <span className="ml-1.5 text-[10px] text-zinc-500">{l.calls.toLocaleString()} calls</span>
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700/40">
                <div className={`h-full rounded-full ${a.bar}`} style={{ width: `${Math.max(2, (l.cost / maxCost) * 100)}%` }} />
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{l.why}</p>
              <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-600">Runs: {l.driver}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing schedule — how cost scales with usage (sets expectations as you grow) */}
      {sched.hasData && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-600">Pricing schedule · how it scales</p>
            <Tag billed={false} />
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700/40 dark:bg-zinc-800/30 p-3.5">
            <p className="text-[13px] text-zinc-700 dark:text-zinc-300">
              Rule of thumb: <span className="font-bold text-zinc-900 dark:text-white">~{fmtUSD(sched.per1k)}</span>
              <span className="text-zinc-500"> per 1,000 {sched.unitPlural}</span>
            </p>
            <div className="mt-3 space-y-2">
              {sched.rows.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 text-xs">
                  <span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{r.label}</span>
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-600"> ({r.note})</span>
                    <span className="text-zinc-500"> · {r.volume.toLocaleString()} {sched.unitPlural}/mo</span>
                  </span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">~{fmtUSD(r.cost)}<span className="text-[10px] font-normal text-zinc-500 dark:text-zinc-600"> /mo</span></span>
                </div>
              ))}
            </div>
            <p className="mt-3 border-t border-zinc-200 dark:border-zinc-700/40 pt-2.5 text-[11px] leading-relaxed text-zinc-500">
              You&apos;re at ≈ {sched.currentVolume.toLocaleString()} {sched.unitPlural}/mo today. Cost is linear at this mix — <strong className="text-zinc-700 dark:text-zinc-400">2× the volume ≈ 2× the cost</strong>.
            </p>
          </div>
        </div>
      )}

      {billed ? (
        <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-600">
          The <strong className="text-emerald-600 dark:text-emerald-400">Billed</strong> figure comes straight from {vendor}&apos;s usage &amp; billing API. Everything marked{' '}
          <span className="font-mono">~</span> (the per-step split and the forecast) is our model — vendors bill one lump sum, not per step.
        </p>
      ) : (
        <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-600">
          Everything here is marked <span className="font-mono">~</span> because it&apos;s estimated from real activity × current {vendor} prices.
          For exact <strong className="text-emerald-600 dark:text-emerald-400">Billed</strong> figures, add{' '}
          <code className="text-zinc-500">{automation === 'kimedics' ? 'OPENAI_ADMIN_KEY' : 'ANTHROPIC_ADMIN_KEY'}</code>{' '}
          (the {vendor} admin key) and redeploy.
        </p>
      )}
    </div>
  )
}
