'use client'

import { useState } from 'react'

/** Tab switcher so the two automations each get a full, uncrammed view instead of being stacked.
 *  Cards are passed in pre-rendered (server components) and toggled client-side. */
export function AutomationTabs({ kimedics, djc }: { kimedics: React.ReactNode; djc: React.ReactNode }) {
  const [tab, setTab] = useState<'djc' | 'kimedics'>('djc')
  const cls = (active: boolean) =>
    `px-4 py-2 text-[13px] font-medium rounded-lg transition-colors ${
      active ? 'bg-zinc-800 text-white ring-1 ring-zinc-700/70' : 'text-zinc-500 hover:text-zinc-300'
    }`
  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-zinc-900/40 p-1 ring-1 ring-zinc-800/60 w-fit">
        <button onClick={() => setTab('djc')} className={cls(tab === 'djc')}>Dentist Job Cafe → Salesforce</button>
        <button onClick={() => setTab('kimedics')} className={cls(tab === 'kimedics')}>Kimedics → Salesforce</button>
      </div>
      <div>{tab === 'djc' ? djc : kimedics}</div>
    </div>
  )
}
