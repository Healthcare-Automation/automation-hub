'use client'

import { useState } from 'react'
import Link from 'next/link'

type View = 'ops' | 'cost'

/**
 * Partitions one automation's tab into [Operations] [AI Cost] (+ an [Insights ↗] link when the
 * automation has a full-page analytics report) so each concern stays clean.
 */
export function AutomationView({
  operations,
  cost,
  insightsHref,
}: {
  operations: React.ReactNode
  cost: React.ReactNode
  insightsHref?: string
}) {
  const [view, setView] = useState<View>('ops')
  const btn = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
      active ? 'bg-zinc-700/60 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
    }`
  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-zinc-700/50 bg-zinc-800/40 p-0.5">
        <button onClick={() => setView('ops')} className={btn(view === 'ops')}>
          Operations
        </button>
        <button onClick={() => setView('cost')} className={btn(view === 'cost')}>
          AI Cost
        </button>
        {insightsHref ? (
          <Link href={insightsHref} className={btn(false)}>
            Insights ↗
          </Link>
        ) : null}
      </div>
      {view === 'ops' ? operations : cost}
    </div>
  )
}
