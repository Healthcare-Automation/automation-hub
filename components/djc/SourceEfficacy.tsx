'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { SourceRow } from '@/lib/djcStory'

/**
 * Which candidate platform actually produces placements.
 *
 * Proxi sources from eighteen places; the board only ever looked at DJC, which made "is the
 * automation worth it" unanswerable — there was nothing to compare it against.
 *
 * Two windows, because either alone misleads. ALL TIME favours old sources whose people have had
 * years to convert. LAST 12 MONTHS is like-for-like but punishes DJC's recent volume surge, where
 * thousands of candidates are only weeks old. Both are shown, and the caveat is stated rather than
 * buried.
 */
const DJC = 'Dentist_Job_Cafe'

const pretty = (s: string) => (s === DJC ? 'Dentist Job Cafe' : s)

export default function SourceEfficacy({ rows }: { rows: SourceRow[] }) {
  const [window, setWindow] = useState<'all' | 'recent'>('recent')

  // "Not recorded" is 5,800 legacy contacts with no source field — real, but not a platform anyone
  // chose, so it would sit at the top of every chart saying nothing.
  const real = rows.filter(r => r.source !== 'Not recorded')
  const list = real
    .map(r => ({
      ...r,
      n: window === 'all' ? r.candidates : r.recentCandidates,
      p: window === 'all' ? r.placed : r.recentPlaced,
    }))
    .filter(r => r.n >= 20)
    .map(r => ({ ...r, rate: r.n ? (r.p / r.n) * 100 : 0 }))
    .sort((a, b) => b.rate - a.rate)

  const maxRate = Math.max(...list.map(r => r.rate), 1)
  const djc = list.find(r => r.source === DJC)
  const best = list[0]

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-[14px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          {djc && best && djc.source !== best.source ? (
            <>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{pretty(best.source)}</span> places{' '}
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">{best.rate.toFixed(1)}</span> of every
              100 candidates it brings in. <span className="text-zinc-900 dark:text-zinc-100">Dentist Job Cafe</span>{' '}
              places <span className="font-semibold text-amber-700 dark:text-amber-300">{djc.rate.toFixed(1)}</span> —
              from {djc.n.toLocaleString()} candidates, the largest source we have.
            </>
          ) : (
            'Placements produced per 100 candidates, by where the candidate came from.'
          )}
        </p>
        <span className="inline-flex shrink-0 rounded-lg border border-zinc-200 bg-zinc-900/[0.04] dark:border-zinc-700/60 dark:bg-zinc-800/40 p-0.5">
          {([['recent', 'Last 12 months'], ['all', 'All time']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setWindow(k)}
                    className={cn('rounded-md px-3 py-1 text-[11px] font-medium transition-colors',
                      window === k ? 'bg-white text-zinc-900 shadow-sm dark:bg-white/10 dark:text-zinc-100 dark:shadow-none' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300')}>
              {label}
            </button>
          ))}
        </span>
      </div>

      <div className="mb-1.5 flex items-center gap-3 text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-600">
        <span className="w-40 shrink-0">Source</span>
        <span className="grow">Placements per 100 candidates</span>
        <span className="w-20 shrink-0 text-right">Rate</span>
        <span className="w-32 shrink-0 text-right">Volume</span>
      </div>

      <div className="space-y-1.5">
        {list.map(r => {
          const isDjc = r.source === DJC
          return (
            <div key={r.source}
                 className={cn('flex items-center gap-3 rounded-md py-1',
                   isDjc && 'bg-cyan-500/[0.06] ring-1 ring-cyan-500/20')}>
              <span className={cn('w-40 shrink-0 truncate pl-1.5 text-[12px]',
                isDjc ? 'font-medium text-cyan-800 dark:text-cyan-200' : 'text-zinc-700 dark:text-zinc-300')}>
                {pretty(r.source)}
              </span>
              <span className="relative h-5 grow rounded bg-zinc-200/70 dark:bg-zinc-800/50">
                <span className={cn('absolute inset-y-0 left-0 rounded',
                  isDjc ? 'bg-cyan-500/80 dark:bg-cyan-400/70' : r.rate >= 5 ? 'bg-emerald-500/75 dark:bg-emerald-400/65' : 'bg-zinc-400 dark:bg-zinc-600')}
                      style={{ width: `${Math.max((r.rate / maxRate) * 100, 1)}%` }} />
              </span>
              <span className={cn('w-20 shrink-0 text-right text-[12px] font-semibold tabular-nums',
                r.rate >= 5 ? 'text-emerald-700 dark:text-emerald-300' : r.rate >= 2 ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-600 dark:text-zinc-400')}>
                {r.rate.toFixed(1)}
              </span>
              <span className="w-32 shrink-0 pr-1.5 text-right text-[11px] tabular-nums text-zinc-500 dark:text-zinc-600">
                {r.p} of {r.n.toLocaleString()}
              </span>
            </div>
          )
        })}
      </div>

      {/* The conversion step that explains the gap. */}
      {djc && (
        <p className="mt-4 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          The gap opens before placement. Of every 100 candidates,{' '}
          <span className="text-zinc-800 dark:text-zinc-200">{real.find(r => r.source === 'Indeed')?.appliedPct ?? 0} from Indeed</span>{' '}
          get put forward for a job, against{' '}
          <span className="text-amber-700 dark:text-amber-300">
            {real.find(r => r.source === DJC)?.appliedPct ?? 0} from DJC
          </span>
          . Sourcing is not the constraint — what happens next is.
        </p>
      )}

      <p className="mt-4 border-t border-zinc-200 dark:border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-500">
        Sources with fewer than 20 candidates are hidden — a handful of people produces meaningless
        rates. {window === 'recent'
          ? 'The 12-month window compares like with like, but is harsh on DJC: much of its volume arrived in the last eight weeks and has not had time to convert.'
          : 'All-time favours older sources, whose candidates have had years to be placed.'}{' '}
        &ldquo;Not recorded&rdquo; ({rows.find(r => r.source === 'Not recorded')?.candidates.toLocaleString() ?? 0}{' '}
        legacy contacts with no source field) is excluded.
      </p>
    </div>
  )
}
