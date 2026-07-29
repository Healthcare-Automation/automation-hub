'use client'

import { useState } from 'react'
import type { DjcQuotaBlockedRow, DjcQuotaBlockedResolution } from '@/lib/djcTypes'
import { cn, formatShortDate } from '@/lib/utils'

interface Props {
  rows: DjcQuotaBlockedRow[]
}

const RESOLUTION_META: Record<
  DjcQuotaBlockedResolution,
  { label: string; hint: string; cls: string }
> = {
  needs_view: {
    label: 'Needs a view',
    hint: 'Never checked — the profile scraped but the Profile Views wall blocked the contact reveal. A view is required to get their phone or email.',
    cls: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  },
  checked_empty: {
    label: 'Checked — empty',
    hint: 'A Profile View was spent and no phone, email or resume was found. Done, not pending.',
    cls: 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/30',
  },
  already_in_sf: {
    label: 'Already in Salesforce',
    hint: 'Matched to an existing contact after the block — no view needed.',
    cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  },
  gone: {
    label: 'No longer listed',
    hint: 'Dropped off the DJC search list — a view cannot be spent on them any more.',
    cls: 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/30',
  },
}

type Filter = 'all' | DjcQuotaBlockedResolution

export default function DjcQuotaBlockedPanel({ rows }: Props) {
  const [filter, setFilter] = useState<Filter>('needs_view')

  const counts = rows.reduce(
    (a, r) => ({ ...a, [r.resolution]: (a[r.resolution] ?? 0) + 1 }),
    {} as Record<DjcQuotaBlockedResolution, number>,
  )
  const masked = rows.filter(r => r.resolution === 'needs_view' && r.nameMasked).length
  const shown = filter === 'all' ? rows : rows.filter(r => r.resolution === filter)

  if (!rows.length) {
    return <p className="text-xs text-zinc-600">No candidates have been blocked by the Profile Views quota.</p>
  }

  const tab = (key: Filter, label: string, n: number) => (
    <button
      key={key}
      onClick={() => setFilter(key)}
      className={cn(
        'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
        filter === key ? 'bg-white/10 text-zinc-100 ring-1 ring-white/15' : 'text-zinc-500 hover:text-zinc-300',
      )}
    >
      {label} <span className="tabular-nums text-zinc-500">{n}</span>
    </button>
  )

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[13px] leading-relaxed text-zinc-300">
          <span className="font-semibold text-amber-300 tabular-nums">{counts.needs_view ?? 0}</span> of{' '}
          <span className="tabular-nums text-white">{rows.length}</span> blocked candidates need a Profile View. Their
          profiles scraped fine — the quota wall blocked the contact reveal, so nothing was ever learned about them.
          Each row links straight to the DJC profile so you can check it by hand.
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
          Based on every view actually spent to date, expect roughly <span className="text-zinc-300">26%</span> to
          become new Salesforce contacts, <span className="text-zinc-300">33%</span> to turn out already on file, and{' '}
          <span className="text-zinc-300">33%</span> to have no reachable contact info. A view&rsquo;s outcome can only
          be known after it is spent.
          {masked > 0 && (
            <> {masked} of these show initials only — that affects what you see in the table, not whether a view is
            needed.</>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {tab('needs_view', 'Needs a view', counts.needs_view ?? 0)}
        {tab('checked_empty', 'Checked — empty', counts.checked_empty ?? 0)}
        {tab('already_in_sf', 'Already in SF', counts.already_in_sf ?? 0)}
        {tab('gone', 'No longer listed', counts.gone ?? 0)}
        {tab('all', 'All', rows.length)}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-700/50">
        <table className="w-full min-w-[62rem] text-left text-[12px]">
          <thead className="bg-zinc-800/50 text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Candidate</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Role / specialty</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Location</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Registered</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Last active</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Status</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Last blocked</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Profile</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {shown.map(r => {
              const meta = RESOLUTION_META[r.resolution]
              return (
                <tr key={r.candidateId} className="hover:bg-zinc-800/30">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <span className={cn('font-medium', r.nameMasked ? 'text-zinc-500 italic' : 'text-zinc-200')}>
                        {r.displayName || '—'}
                      </span>
                      {r.nameMasked && (
                        <span
                          className="shrink-0 rounded bg-zinc-500/15 px-1 py-0.5 text-[9px] font-semibold tracking-wide text-zinc-400 ring-1 ring-zinc-500/25"
                          title="DJC masks the name until the profile is opened"
                        >
                          HIDDEN
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-400">
                    {r.target || '—'}
                    {r.degrees && <span className="ml-1.5 text-zinc-600">{r.degrees}</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-400">
                    {(r.cardLocation || '—').replace(/,\s*United States$/, '')}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-500 tabular-nums">
                    {r.registeredOn ? formatShortDate(r.registeredOn) : '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-500 tabular-nums">
                    {r.lastActivity || '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={cn('inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1', meta.cls)}
                      title={meta.hint}
                    >
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-500 tabular-nums">
                    {formatShortDate(r.lastBlocked)}
                    {r.blockCount > 1 && <span className="text-zinc-600"> · {r.blockCount}×</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.profileUrl ? (
                      <a
                        href={r.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="whitespace-nowrap text-cyan-400 underline-offset-2 hover:text-cyan-300 hover:underline"
                      >
                        Open
                      </a>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-600">
        Opening a profile from this table spends one of the shared Profile Views — the same budget the automation
        draws on.
      </p>
    </div>
  )
}
