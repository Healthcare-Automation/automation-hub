'use client'

import { useEffect, useMemo, useState } from 'react'
import type { RunDetail, SFErrorDetail } from '@/lib/types'
import { cn, formatRelativeTime, formatDuration } from '@/lib/utils'
import ValidationPopup from './ValidationPopup'

function StatusBadge({
  status,
  sfErrorCount,
  emailCount,
  jobCount,
}: {
  status: RunDetail['status']
  sfErrorCount: number
  emailCount: number
  jobCount: number
}) {
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium whitespace-nowrap">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
        Failed
      </span>
    )
  }
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-medium whitespace-nowrap">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
        </span>
        Running
      </span>
    )
  }
  // completed — emails scraped but no jobs produced (popup will be empty)
  if (emailCount > 0 && jobCount === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 text-zinc-500 text-xs font-medium whitespace-nowrap"
        title="Emails were scraped but no job content was produced — nothing to inspect in the validation popup"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12h8" />
        </svg>
        No jobs
      </span>
    )
  }
  // completed — check for SF errors
  if (sfErrorCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-medium whitespace-nowrap">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        Warning
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium whitespace-nowrap">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      Successful
    </span>
  )
}

const TOOLTIP_W = 320 // matches w-80

function SFErrorBadge({ errors }: { errors: SFErrorDetail[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null)
  if (errors.length === 0) return null

  return (
    <>
      <span
        className="ml-1.5 text-red-400 text-[10px] font-medium cursor-help inline-flex items-center gap-0.5 whitespace-nowrap"
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const rawX = r.left + r.width / 2
          const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
          // Keep tooltip fully inside viewport with 8px padding on each side
          const clampedX = Math.min(Math.max(rawX, TOOLTIP_W / 2 + 8), vw - TOOLTIP_W / 2 - 8)
          setTooltip({ x: clampedX, y: r.top })
        }}
        onMouseLeave={() => setTooltip(null)}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        {errors.length} err
      </span>

      {tooltip && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y - 12,
            transform: 'translateX(-50%) translateY(-100%)',
          }}
        >
          <div className="bg-zinc-800 border border-red-500/30 rounded-xl p-3.5 shadow-2xl w-80 text-xs">
            <p className="font-semibold text-red-400 mb-2.5 flex items-center gap-1.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Salesforce Sync Errors
            </p>
            <div className="space-y-2.5">
              {errors.map((err, i) => (
                <div key={i} className="border-l-2 border-red-500/40 pl-2.5">
                  <p className="text-zinc-500 font-mono text-[10px] mb-0.5">
                    {err.eventType === 'sf_mapping_pull_failed' ? 'SOQL query failed' : `Job ${err.jobId}`}
                  </p>
                  <p className="text-zinc-300 leading-relaxed break-words">{err.error}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function LayerCell({
  count,
  sfErrors = [],
  dimWhenZero = true,
}: {
  count: number
  sfErrors?: SFErrorDetail[]
  dimWhenZero?: boolean
}) {
  const isEmpty = count === 0 && sfErrors.length === 0
  if (isEmpty && dimWhenZero) {
    return <span className="text-zinc-600 tabular-nums">—</span>
  }
  return (
    <span className="tabular-nums inline-flex items-center">
      <span className={cn(count > 0 ? 'text-zinc-200' : 'text-zinc-600')}>
        {count}
      </span>
      <SFErrorBadge errors={sfErrors} />
    </span>
  )
}

function RecoveryBadge({ count }: { count: number }) {
  if (!count) return null
  return (
    <span
      className="ml-1.5 text-emerald-400 text-[10px] font-medium inline-flex items-center gap-0.5 whitespace-nowrap"
      title={`${count} previously-failed push${count === 1 ? '' : 'es'} was automatically recovered on this run`}
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 4v6h-6" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
      {count}
    </span>
  )
}

function QuarantineBadge({ count, fields }: { count: number; fields: string[] }) {
  if (!count) return null
  const title = fields.length
    ? `Fields dropped from payload (need parser fix): ${fields.join(', ')}`
    : `${count} field${count === 1 ? '' : 's'} dropped from payload (parser fix needed)`
  return (
    <span
      className="ml-1.5 text-amber-300 text-[10px] font-medium inline-flex items-center gap-0.5 whitespace-nowrap"
      title={title}
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      {count}
    </span>
  )
}

function SfPushCell({ run }: { run: RunDetail }) {
  const patch = run.sfPatchCount
  const created = run.sfJobsCreatedCount
  const swapped = run.extJobIdSwapCount ?? 0
  const errs = run.sfErrorDetails
  const recovered = run.sfRecoveredCount ?? 0
  const quarantined = run.sfQuarantinedCount ?? 0
  const hasLine =
    patch > 0 || created > 0 || swapped > 0 || errs.length > 0 || recovered > 0 || quarantined > 0
  if (!hasLine) {
    return <span className="text-zinc-600 tabular-nums">—</span>
  }
  return (
    <span className="tabular-nums inline-flex flex-col items-start gap-0.5 min-w-0">
      <span className="inline-flex items-center">
        <span className={cn(patch > 0 ? 'text-zinc-200' : 'text-zinc-600')}>{patch}</span>
        <SFErrorBadge errors={errs} />
        <RecoveryBadge count={recovered} />
        <QuarantineBadge count={quarantined} fields={run.sfQuarantinedFields ?? []} />
      </span>
      {created > 0 ? (
        <span
          className={cn(
            'inline-flex items-center gap-1',
            'text-[10px] font-semibold leading-tight',
            'px-1.5 py-0.5 rounded-md border',
            'bg-violet-500/10 border-violet-500/25 text-violet-300',
            'shadow-[0_0_0_1px_rgba(139,92,246,0.08)]',
            'truncate max-w-full'
          )}
          title={`${created} new Salesforce job record(s) created this run`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="opacity-90">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
          {created} new job{created === 1 ? '' : 's'}
        </span>
      ) : null}
      {swapped > 0 ? (
        <span
          className={cn(
            'inline-flex items-center gap-1',
            'text-[10px] font-semibold leading-tight',
            'px-1.5 py-0.5 rounded-md border',
            'bg-amber-500/10 border-amber-500/30 text-amber-300',
            'shadow-[0_0_0_1px_rgba(245,158,11,0.08)]',
            'truncate max-w-full'
          )}
          title={`${swapped} Salesforce record(s) had External_Job_ID__c repointed to a different Kimedics job_id — manual validation recommended`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="opacity-90">
            <path
              d="M7 4 3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {swapped} ID swap{swapped === 1 ? '' : 's'}
        </span>
      ) : null}
    </span>
  )
}

interface Props {
  runs: RunDetail[]
}

const COLS = 'grid-cols-[3rem_4.5rem_3.5rem_1fr_1fr_1fr] gap-x-2'
const PAGE_SIZE = 20

type SearchMode = 'jobId' | 'sfJobId' | 'practice'

function detectSearchMode(raw: string): SearchMode {
  const q = raw.trim()
  if (/^\d{3,7}$/.test(q)) return 'jobId'
  if (/^a0[A-Za-z0-9]{13,16}$/.test(q)) return 'sfJobId'
  return 'practice'
}

const SEARCH_MODE_LABEL: Record<SearchMode, string> = {
  jobId: 'Kimedics job_id (exact)',
  sfJobId: 'Salesforce Job__c id (exact)',
  practice: 'Practice value (partial match)',
}

export default function LayerBreakdown({ runs }: Props) {
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [lastOpenedRunId, setLastOpenedRunId] = useState<number | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [activeQuery, setActiveQuery] = useState<{ mode: SearchMode; value: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filteredRuns, setFilteredRuns] = useState<RunDetail[] | null>(null)
  const [pageOffset, setPageOffset] = useState(0)
  const [pageRuns, setPageRuns] = useState<RunDetail[]>(runs)
  const [paging, setPaging] = useState(false)
  const [hasOlder, setHasOlder] = useState(runs.length === PAGE_SIZE)

  const displayedRuns = filteredRuns ?? pageRuns

  const trimmedInput = searchInput.trim()
  const canSearch = trimmedInput.length > 0
  const previewMode: SearchMode | null = useMemo(
    () => (canSearch ? detectSearchMode(searchInput) : null),
    [searchInput, canSearch],
  )

  useEffect(() => {
    // If the user clears the input, revert to default recent runs.
    if (trimmedInput === '') {
      setFilteredRuns(null)
      setActiveJobId(null)
      setActiveQuery(null)
      setError(null)
      // Restore paged runs view
      setPageOffset(0)
      setPageRuns(runs)
      setHasOlder(runs.length === PAGE_SIZE)
    }
  }, [trimmedInput])

  useEffect(() => {
    // If server-provided initial runs change (e.g. refresh), keep page 0 in sync.
    if (filteredRuns === null && pageOffset === 0) {
      setPageRuns(runs)
      setHasOlder(runs.length === PAGE_SIZE)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs])

  const applyFilter = async () => {
    const value = trimmedInput
    if (!value) return
    const mode = detectSearchMode(value)
    setLoading(true)
    setError(null)
    try {
      const param = mode === 'jobId' ? 'jobId' : mode === 'sfJobId' ? 'sfJobId' : 'practice'
      const res = await fetch(`/api/runs?${param}=${encodeURIComponent(value)}`)
      if (!res.ok) throw new Error('Failed to fetch runs')
      const data = await res.json()
      setFilteredRuns(data.runs || [])
      // Only the popup-level Kimedics filter makes sense when the user typed a Kimedics id
      setActiveJobId(mode === 'jobId' ? value : null)
      setActiveQuery({ mode, value })
    } catch {
      setError(`Failed to load runs for ${SEARCH_MODE_LABEL[mode]}`)
      setFilteredRuns([])
      setActiveJobId(mode === 'jobId' ? value : null)
      setActiveQuery({ mode, value })
    } finally {
      setLoading(false)
    }
  }

  const fetchPage = async (nextOffset: number) => {
    setPaging(true)
    setError(null)
    try {
      const res = await fetch(`/api/runs?limit=${PAGE_SIZE}&offset=${nextOffset}`)
      if (!res.ok) throw new Error('Failed to fetch runs')
      const data = await res.json()
      const nextRuns: RunDetail[] = data.runs || []
      setPageRuns(nextRuns)
      setPageOffset(nextOffset)
      setHasOlder(nextRuns.length === PAGE_SIZE)
      setLastOpenedRunId(null)
      setSelectedRunId(null)
    } catch {
      setError('Failed to load run history')
    } finally {
      setPaging(false)
    }
  }

  if (displayedRuns.length === 0) {
    return (
      <div className="py-10 text-center text-zinc-600 text-sm">
        {activeQuery
          ? `No runs found for ${SEARCH_MODE_LABEL[activeQuery.mode]}: ${activeQuery.value}`
          : 'No runs found in the database.'}
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {/* Filter */}
      <div className="px-3 pt-2 pb-1 flex items-center gap-2">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyFilter()
          }}
          placeholder="job_id (19596), Salesforce id (a01UP00000…), or practice name"
          className="w-full bg-zinc-900/40 border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-600/50"
        />
        <button
          onClick={applyFilter}
          disabled={!canSearch || loading}
          className={cn(
            'px-3 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap',
            canSearch && !loading
              ? 'border-zinc-600/60 text-zinc-200 hover:bg-zinc-700/30'
              : 'border-zinc-800 text-zinc-600 cursor-not-allowed'
          )}
        >
          {loading ? 'Loading…' : 'Search'}
        </button>
      </div>

      {/* Mode hint — show what the input will be searched as before submit */}
      {previewMode && !activeQuery && (
        <div className="px-3 pb-1 text-[11px] text-zinc-500">
          Will search as <span className="text-zinc-300">{SEARCH_MODE_LABEL[previewMode]}</span>
        </div>
      )}

      {error && (
        <div className="px-3 pb-1 text-[11px] text-red-400">
          {error}
        </div>
      )}

      {/* Instruction text */}
      <div className="px-3 py-1 text-xs text-zinc-500 flex items-center gap-1.5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
        Click any row to view details
        {activeQuery
          ? ` (filtered by ${SEARCH_MODE_LABEL[activeQuery.mode]}: ${activeQuery.value})`
          : ''}
      </div>

      {/* Header */}
      <div
          className={cn(
            'grid px-3 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest',
          COLS,
        )}
      >
        <span>Run</span>
        <span>Status</span>
        <span>Started · Dur</span>
        <span className="flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          Email
        </span>
        <span className="flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          Jobs
        </span>
        <span className="flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
          </svg>
          SF Push
        </span>
      </div>

      {displayedRuns.map((run) => (
        <div
          key={run.id}
          onClick={() => {
            setSelectedRunId(run.id)
            setLastOpenedRunId(run.id)
          }}
          className={cn(
            'grid px-3 py-2.5 rounded-lg text-sm items-center cursor-pointer',
            'hover:bg-zinc-700/30 hover:border-zinc-600 transition-all duration-200 group',
            'border border-transparent relative',
            lastOpenedRunId === run.id && 'bg-zinc-700/30 border-zinc-600',
            COLS,
          )}
        >
          {/* Run IDs: show gmail + batch */}
          <span className="font-mono text-zinc-400 text-[11px] group-hover:text-zinc-200 leading-tight transition-colors">
            <span>#{run.id}</span>
            {run.batchId && (
              <span className="block text-zinc-600">#{run.batchId}</span>
            )}
          </span>

          <StatusBadge
            status={run.status}
            sfErrorCount={run.sfErrorCount}
            emailCount={run.emailCount}
            jobCount={run.jobCount}
          />

          {/* Started + duration */}
          <span className="text-zinc-400 text-xs leading-tight group-hover:text-zinc-300 transition-colors">
            <span className="block">{formatRelativeTime(run.startedAt)}</span>
            {run.durationSeconds != null && (
              <span className="block text-zinc-600 text-[10px]">
                {run.gmailDurationSeconds != null && run.batchDurationSeconds != null
                  ? formatDuration(run.gmailDurationSeconds + run.batchDurationSeconds)
                  : formatDuration(run.durationSeconds)
                }
              </span>
            )}
          </span>

          <LayerCell count={run.emailCount} />
          <LayerCell count={run.jobCount} />
          <SfPushCell run={run} />

          {/* Click indicator */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-xs text-zinc-400 bg-zinc-800 px-2 py-1 rounded border border-zinc-600 flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
              View Details
            </span>
          </div>
        </div>
      ))}

      {/* Pagination (unfiltered only) */}
      {filteredRuns === null && (
        <div className="px-3 pt-2 flex items-center justify-between">
          <button
            onClick={() => fetchPage(Math.max(0, pageOffset - PAGE_SIZE))}
            disabled={paging || pageOffset === 0}
            className={cn(
              'px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors inline-flex items-center gap-1.5',
              pageOffset === 0 || paging
                ? 'border-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'border-zinc-700/60 text-zinc-200 hover:bg-zinc-700/30'
            )}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Previous
          </button>

          <span className="text-[11px] text-zinc-600 tabular-nums">
            Page {Math.floor(pageOffset / PAGE_SIZE) + 1}
          </span>

          <button
            onClick={() => fetchPage(pageOffset + PAGE_SIZE)}
            disabled={paging || !hasOlder}
            className={cn(
              'px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors inline-flex items-center gap-1.5',
              !hasOlder || paging
                ? 'border-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'border-zinc-700/60 text-zinc-200 hover:bg-zinc-700/30'
            )}
          >
            Next
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      )}

      <ValidationPopup
        runId={selectedRunId || 0}
        isOpen={selectedRunId !== null}
        onClose={() => setSelectedRunId(null)}
        jobId={activeJobId ?? undefined}
      />
    </div>
  )
}
