'use client'

import { useMemo, useState } from 'react'
import type { TrendRadarRow } from '@/lib/marketingQueries'
import type { SourceType } from '@/lib/marketing/types'
import { ScoreBar } from './ScoreBar'
import { Sparkline } from './Sparkline'
import { SourceTypeChips } from './SourceTypeChips'
import { DemoBadge } from './DemoBadge'
import { EvidenceSidePanel } from './EvidenceSidePanel'

type SortKey = 'score' | 'lastSeen' | 'itemCount'
type Vertical = 'all' | 'dental' | 'healthcare'
type Window = 'all' | '7d' | '30d'

const SOURCE_TYPE_OPTIONS: { value: SourceType | 'all'; label: string }[] = [
  { value: 'all', label: 'All source types' },
  { value: 'publication', label: 'Publications' },
  { value: 'government', label: 'Government' },
  { value: 'social', label: 'Reddit' },
  { value: 'video', label: 'YouTube' },
  { value: 'news', label: 'News' },
]

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Sortable/filterable trend cluster table. Filters run client-side over a page's worth
 * of clusters (this pipeline runs on a research-desk scale, not a firehose) — dental vs.
 * "other healthcare" is a heuristic split on dentalRelevanceAvg (>=50 counts as dental)
 * since clusters don't carry an explicit vertical field. */
export function TrendRadarTable({ rows }: { rows: TrendRadarRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [vertical, setVertical] = useState<Vertical>('all')
  const [sourceType, setSourceType] = useState<SourceType | 'all'>('all')
  const [window, setWindowFilter] = useState<Window>('all')
  const [openClusterId, setOpenClusterId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const now = Date.now()
    const windowMs = window === '7d' ? 7 * 86_400_000 : window === '30d' ? 30 * 86_400_000 : Infinity
    return rows
      .filter((r) => {
        if (vertical === 'dental' && (r.dentalRelevanceAvg ?? 0) < 50) return false
        if (vertical === 'healthcare' && (r.dentalRelevanceAvg ?? 0) >= 50) return false
        if (sourceType !== 'all' && !r.sourceTypeCounts.some((c) => c.sourceType === sourceType)) return false
        if (window !== 'all') {
          if (!r.lastSeen || now - new Date(r.lastSeen).getTime() > windowMs) return false
        }
        return true
      })
      .sort((a, b) => {
        if (sortKey === 'score') return (b.totalScore ?? -1) - (a.totalScore ?? -1)
        if (sortKey === 'itemCount') return b.itemCount - a.itemCount
        return new Date(b.lastSeen ?? 0).getTime() - new Date(a.lastSeen ?? 0).getTime()
      })
  }, [rows, vertical, sourceType, window, sortKey])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value={vertical}
          onChange={(e) => setVertical(e.target.value as Vertical)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="all">All verticals</option>
          <option value="dental">Dental</option>
          <option value="healthcare">Other healthcare</option>
        </select>
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as SourceType | 'all')}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {SOURCE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={window}
          onChange={(e) => setWindowFilter(e.target.value as Window)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="all">All time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
        <span className="text-zinc-400">Sort by</span>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="score">Score</option>
          <option value="lastSeen">Last seen</option>
          <option value="itemCount">Item count</option>
        </select>
        <span className="ml-auto text-zinc-400">
          {filtered.length} of {rows.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700/60">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-zinc-900/[0.03] text-[10px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-800/40">
            <tr>
              <th className="px-3 py-2 font-medium">Cluster</th>
              <th className="px-3 py-2 font-medium">Score</th>
              <th className="px-3 py-2 font-medium">Momentum</th>
              <th className="px-3 py-2 font-medium">Source mix</th>
              <th className="px-3 py-2 font-medium">First seen</th>
              <th className="px-3 py-2 font-medium">Last seen</th>
              <th className="px-3 py-2 text-right font-medium">Items</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.id}
                onClick={() => setOpenClusterId(row.id)}
                className="cursor-pointer border-t border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800/70 dark:hover:bg-zinc-800/30"
              >
                <td className="max-w-64 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">{row.title}</span>
                    {row.isDemoData && <DemoBadge />}
                  </div>
                </td>
                <td className="px-3 py-2">{row.totalScore != null ? <ScoreBar score={row.totalScore} size="sm" /> : '—'}</td>
                <td className="px-3 py-2">
                  <Sparkline values={row.sparkline} />
                </td>
                <td className="px-3 py-2">
                  <SourceTypeChips counts={row.sourceTypeCounts} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-500">{formatDate(row.firstSeen)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-500">{formatDate(row.lastSeen)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{row.itemCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openClusterId && <EvidenceSidePanel clusterId={openClusterId} onClose={() => setOpenClusterId(null)} />}
    </div>
  )
}
