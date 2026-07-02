'use client'

import { useState } from 'react'

type View = 'ops' | 'cost' | 'log'

/**
 * Partitions one automation's tab into [Operations] [AI Cost] [Updates] so each
 * concern stays clean — you switch to cost detail or the change log deliberately.
 */
export function AutomationView({
  operations,
  cost,
  changelog,
}: {
  operations: React.ReactNode
  cost: React.ReactNode
  changelog: React.ReactNode
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
        <button onClick={() => setView('log')} className={btn(view === 'log')}>
          Updates
        </button>
      </div>
      {view === 'ops' ? operations : view === 'cost' ? cost : changelog}
    </div>
  )
}
