'use client'

import { useState } from 'react'

type View = 'ops' | 'cost'

/**
 * Partitions one automation's tab into [Operations] [AI Cost]. The old [Insights ↗] link was
 * removed once the Intelligence pages superseded it (2026-07-27).
 * automation has a full-page analytics report) so each concern stays clean.
 */
export function AutomationView({
  operations,
  cost,
}: {
  operations: React.ReactNode
  cost: React.ReactNode
}) {
  const [view, setView] = useState<View>('ops')
  const btn = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
      active
        ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700/60 dark:text-white'
        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
    }`
  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-900/[0.04] p-0.5 dark:border-zinc-700/50 dark:bg-zinc-800/40">
        <button onClick={() => setView('ops')} className={btn(view === 'ops')}>
          Operations
        </button>
        <button onClick={() => setView('cost')} className={btn(view === 'cost')}>
          AI Cost
        </button>
      </div>
      {view === 'ops' ? operations : cost}
    </div>
  )
}
