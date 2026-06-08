'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface Metric {
  value: string
  label: string
  accent?: 'cyan' | 'emerald' | 'amber'
}

const ACCENT: Record<string, string> = {
  cyan: 'text-cyan-300',
  emerald: 'text-emerald-300',
  amber: 'text-amber-300',
}

/** Per-automation KPI strip with a small Past-7-days / All-time toggle so the period is explicit. */
export default function MetricStrip({ periods }: { periods: { sevenDay: Metric[]; allTime: Metric[] } }) {
  const [period, setPeriod] = useState<'7d' | 'all'>('7d')
  const items = period === '7d' ? periods.sevenDay : periods.allTime

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-600">
          {period === '7d' ? 'Past 7 days' : 'All time'}
        </span>
        <div className="inline-flex rounded-md bg-zinc-800/60 p-0.5 ring-1 ring-zinc-700/40">
          {(['7d', 'all'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                period === p ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {p === '7d' ? '7d' : 'All'}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-4 divide-x divide-zinc-700/40 overflow-hidden rounded-lg bg-zinc-800/40 ring-1 ring-zinc-700/40">
        {items.map(m => (
          <div key={m.label} className="px-2 py-2.5 text-center">
            <div className={cn('text-[17px] font-semibold leading-none tabular-nums', m.accent ? ACCENT[m.accent] : 'text-zinc-100')}>
              {m.value}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
