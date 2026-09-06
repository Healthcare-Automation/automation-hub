'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { FeedSourceStatsRow } from '@/lib/marketingQueries'

const TYPE_LABELS: Record<string, string> = {
  publication: 'Publication',
  government: 'Government',
  association: 'Association',
  social: 'Reddit',
  video: 'YouTube',
  news: 'Google News',
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Feed registry table — name, type, reliability, enabled toggle, last fetched, items in
 * the last 7 days, last error. isAdmin gates the toggle (read-only view otherwise). */
export function FeedRegistryTable({ rows, isAdmin }: { rows: FeedSourceStatsRow[]; isAdmin: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function toggle(feedRegistryId: string, enabled: boolean) {
    startTransition(async () => {
      await fetch('/api/marketing/sources/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedRegistryId, enabled }),
      })
      router.refresh()
    })
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700/60">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-zinc-900/[0.03] text-[10px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-800/40">
          <tr>
            <th className="px-3 py-2 font-medium">Feed</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Reliability</th>
            <th className="px-3 py-2 font-medium">Enabled</th>
            <th className="px-3 py-2 font-medium">Last fetched</th>
            <th className="px-3 py-2 text-right font-medium">Items, 7d</th>
            <th className="px-3 py-2 font-medium">Last error</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.feedRegistryId} className="border-t border-zinc-200 dark:border-zinc-800/70">
              <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">{row.name}</td>
              <td className="px-3 py-2 text-zinc-500">{row.sourceType ? (TYPE_LABELS[row.sourceType] ?? row.sourceType) : '—'}</td>
              <td className="px-3 py-2 text-zinc-500">{row.reliabilityClassification?.replace(/_/g, ' ') ?? '—'}</td>
              <td className="px-3 py-2">
                {isAdmin ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => toggle(row.feedRegistryId, !row.enabled)}
                    className={
                      row.enabled
                        ? 'rounded border border-teal-500/50 px-2 py-0.5 text-[11px] text-teal-700 disabled:opacity-40 dark:text-teal-300'
                        : 'rounded border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-500 disabled:opacity-40 dark:border-zinc-700'
                    }
                  >
                    {row.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                ) : (
                  <span className="text-zinc-500">{row.enabled ? 'Enabled' : 'Disabled'}</span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-zinc-500">{formatDateTime(row.lastFetchedAt)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{row.items7d}</td>
              <td className="max-w-56 px-3 py-2 text-amber-700 dark:text-amber-400">
                {row.lastError ? <span className="block truncate" title={row.lastError}>{row.lastError}</span> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
