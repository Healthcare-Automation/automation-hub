'use client'

import { useState } from 'react'

type TabKey = 'djc' | 'kimedics' | 'candidateBank'

/** Tab switcher so each automation gets a full, uncrammed view instead of being stacked.
 *  Cards are passed in pre-rendered (server components) and toggled client-side. */
export function AutomationTabs({
  kimedics,
  djc,
  candidateBank,
}: {
  kimedics: React.ReactNode
  djc: React.ReactNode
  candidateBank?: React.ReactNode
}) {
  const [tab, setTab] = useState<TabKey>('djc')
  const cls = (active: boolean) =>
    `px-4 py-2 text-[13px] font-medium rounded-lg transition-colors ${
      active
        ? 'bg-white text-zinc-900 ring-1 ring-zinc-200 shadow-sm dark:bg-zinc-800 dark:text-white dark:ring-zinc-700/70 dark:shadow-none'
        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
    }`
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-xl bg-zinc-900/[0.04] p-1 ring-1 ring-zinc-200 w-fit dark:bg-zinc-900/40 dark:ring-zinc-800/60">
        <button onClick={() => setTab('djc')} className={cls(tab === 'djc')}>Dentist Job Cafe → Salesforce</button>
        <button onClick={() => setTab('kimedics')} className={cls(tab === 'kimedics')}>Kimedics → Salesforce</button>
        {candidateBank && (
          <button onClick={() => setTab('candidateBank')} className={cls(tab === 'candidateBank')}>Candidate Bank</button>
        )}
        <a href="/djc/overview" className={`${cls(false)} text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300`}>
          Intelligence ↗
        </a>
      </div>
      <div>{tab === 'kimedics' ? kimedics : tab === 'candidateBank' ? candidateBank : djc}</div>
    </div>
  )
}
