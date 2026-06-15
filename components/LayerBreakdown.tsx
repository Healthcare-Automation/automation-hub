'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RunDetail, SFErrorDetail } from '@/lib/types'
import { cn, formatRelativeTime, formatDuration } from '@/lib/utils'
import ValidationPopup from './ValidationPopup'

function StatusBadge({
  status,
  sfErrorCount,
  emailCount,
  jobCount,
  unresolvedFailedJobCount,
}: {
  status: RunDetail['status']
  sfErrorCount: number
  emailCount: number
  jobCount: number
  unresolvedFailedJobCount: number
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
  // Unresolved Salesforce-creation failure inside this run — surface as red so
  // the row visibly disagrees with "Successful" until the failure is recovered
  // (rescrape, manual SF create, or a later populated job_content row).
  if (unresolvedFailedJobCount > 0) {
    return (
      <span
        className="inline-flex items-center gap-1 text-red-400 text-xs font-medium whitespace-nowrap"
        title={`${unresolvedFailedJobCount} job${unresolvedFailedJobCount === 1 ? '' : 's'} in this run failed to create a Salesforce Job__c record and have not been recovered yet`}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
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
  // "New updates": distinct jobs this run pushed to SF, anchored to the run's own
  // jobs (not the 15-min batch pairing) so a push landing in a later batch still
  // counts here instead of showing "—". Falls back to the raw event count.
  const patch = run.sfJobsPushed || run.sfPatchCount
  const created = run.sfJobsCreatedCount
  const worksites = run.worksitesCreatedCount ?? 0
  const swapped = run.extJobIdSwapCount ?? 0
  const failed = run.unresolvedFailedJobCount ?? 0
  const errs = run.sfErrorDetails
  // "Quarantine re-runs": SF writes via the recovery path — kept distinct from new updates.
  const recovered = run.sfJobsRecovered || (run.sfRecoveredCount ?? 0)
  const quarantined = run.sfQuarantinedCount ?? 0
  const recoveredLater = run.recoveredLaterCount ?? 0
  const hasLine =
    patch > 0 || created > 0 || worksites > 0 || swapped > 0 || failed > 0 || errs.length > 0 || recovered > 0 || quarantined > 0
  if (!hasLine) {
    // Run had no direct SF push activity. If its jobs failed at the time and
    // were patched later (e.g. via manual rescrape after auth was fixed),
    // surface that so the empty "—" isn't misleading.
    if (recoveredLater > 0) {
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1',
            'text-[10px] font-semibold leading-tight',
            'px-1.5 py-0.5 rounded-md border',
            'bg-amber-500/10 border-amber-500/30 text-amber-300',
            'truncate max-w-full'
          )}
          title={`${recoveredLater} job${recoveredLater === 1 ? '' : 's'} failed during this run but were patched later via a subsequent rescrape or recovery.`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
          </svg>
          {recoveredLater} amended later
        </span>
      )
    }
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
      {worksites > 0 ? (
        <span
          className={cn(
            'inline-flex items-center gap-1',
            'text-[10px] font-semibold leading-tight',
            'px-1.5 py-0.5 rounded-md border',
            'bg-sky-500/10 border-sky-500/30 text-sky-300',
            'shadow-[0_0_0_1px_rgba(14,165,233,0.08)]',
            'truncate max-w-full'
          )}
          title={`${worksites} new Salesforce worksite(s) (Account) created this run`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="opacity-90">
            <path
              d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {worksites} new worksite{worksites === 1 ? '' : 's'}
        </span>
      ) : null}
      {failed > 0 ? (
        <span
          className={cn(
            'inline-flex items-center gap-1',
            'text-[10px] font-semibold leading-tight',
            'px-1.5 py-0.5 rounded-md border',
            'bg-red-500/10 border-red-500/30 text-red-300',
            'shadow-[0_0_0_1px_rgba(239,68,68,0.08)]',
            'truncate max-w-full'
          )}
          title={`${failed} job${failed === 1 ? '' : 's'} in this run never produced a Salesforce Job__c (job_create_failed / worksite_create_failed) and haven't been recovered yet — see the admin recovery page to rescrape`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="opacity-90">
            <path
              d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {failed} failed
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

// `min-w-[560px]` (parent has overflow-x-auto on small screens) keeps the
// columns from collapsing into each other on mobile while preserving the
// existing layout on desktop.
const COLS = 'grid-cols-[3rem_4.5rem_3.5rem_1fr_1fr_1fr] gap-x-2 min-w-[560px]'
const PAGE_SIZE = 20

type PageItem = number | 'ellipsis'

function buildPageWindow(current: number, total: number): PageItem[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const items: PageItem[] = [1]
  const start = Math.max(2, current - 2)
  const end = Math.min(total - 1, current + 2)
  if (start > 2) items.push('ellipsis')
  for (let p = start; p <= end; p++) items.push(p)
  if (end < total - 1) items.push('ellipsis')
  items.push(total)
  return items
}

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

// SF-push facets the operator can toggle on the run list. Each entry maps a
// short pill label to a predicate on RunDetail; rows pass when they match
// ANY selected facet (multi-select OR-of-filters). This is a client-side
// filter on top of whatever is already loaded — it does not refetch.
const SF_FACETS: ReadonlyArray<{
  key: string
  label: string
  tone: 'red' | 'amber' | 'violet' | 'cyan' | 'emerald' | 'slate' | 'sky'
  match: (r: RunDetail) => boolean
  tooltip: string
}> = [
  { key: 'failed',      label: 'Failed',       tone: 'red',     match: r => (r.unresolvedFailedJobCount ?? 0) > 0, tooltip: 'Jobs in this run whose SF Job__c creation failed and has not been recovered' },
  { key: 'sf-error',    label: 'SF Error',     tone: 'red',     match: r => (r.sfErrorCount ?? 0) > 0,             tooltip: 'Unresolved Salesforce push errors on this run' },
  { key: 'quarantined', label: 'Field dropped', tone: 'amber',  match: r => (r.sfQuarantinedCount ?? 0) > 0,        tooltip: 'Field(s) dropped by SF on this run (e.g. value too long, picklist mismatch)' },
  { key: 'recovered',   label: 'Recovered',    tone: 'cyan',    match: r => (r.sfRecoveredCount ?? 0) > 0,         tooltip: 'SF push errors that were auto-recovered on this run' },
  { key: 'id-swap',     label: 'ID swap',      tone: 'amber',   match: r => (r.extJobIdSwapCount ?? 0) > 0,        tooltip: 'External_Job_ID__c was repointed on an existing SF record' },
  { key: 'new-job',     label: 'New SF job',   tone: 'violet',  match: r => (r.sfJobsCreatedCount ?? 0) > 0,        tooltip: 'New Salesforce Job__c records created by Proxi on this run' },
  { key: 'new-worksite', label: 'New worksite', tone: 'sky',     match: r => (r.worksitesCreatedCount ?? 0) > 0,    tooltip: 'New Salesforce Worksite__c (Account) records created by Proxi on this run' },
  { key: 'no-jobs',     label: 'No jobs',      tone: 'slate',   match: r => r.emailCount > 0 && r.jobCount === 0,   tooltip: 'Emails scraped but no job_content produced' },
  { key: 'patched',     label: 'Field patches', tone: 'emerald',match: r => (r.sfPatchCount ?? 0) > 0,             tooltip: 'Salesforce field patches landed on this run' },
] as const

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
  const [facets, setFacets] = useState<Set<string>>(new Set())
  // Full run history (up to N) — fetched once on mount in the background.
  // Used as the source of truth for both per-pill counts and the facet filter
  // so they are GLOBAL from page load, not lazy on first click.
  const [allRuns, setAllRuns] = useState<RunDetail[] | null>(null)
  const [allRunsLoading, setAllRunsLoading] = useState(false)
  const [allRunsError, setAllRunsError] = useState<string | null>(null)

  // Fire the full-history fetch on mount. Background — does not block initial
  // paint (page already has the first 20 via SSR). Subsequent re-renders re-use
  // the cached value.
  useEffect(() => {
    let cancelled = false
    setAllRunsLoading(true)
    setAllRunsError(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/runs?limit=2000`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setAllRuns((data.runs as RunDetail[]) || [])
      } catch (e: any) {
        if (!cancelled) setAllRunsError(e?.message || 'Failed to load full history')
      } finally {
        if (!cancelled) setAllRunsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Apply the SF-push facet filter. Once ``allRuns`` has loaded the filter
  // operates over the entire history; before it loads we fall back to the
  // current page so pills still work on the visible data.
  const facetCandidatePool: RunDetail[] = facets.size > 0
    ? (allRuns ?? filteredRuns ?? pageRuns)
    : (filteredRuns ?? pageRuns)
  const displayedRuns = useMemo(() => {
    if (facets.size === 0) return filteredRuns ?? pageRuns
    const active = SF_FACETS.filter(f => facets.has(f.key))
    return facetCandidatePool.filter(r => active.some(f => f.match(r)))
  }, [facetCandidatePool, facets, filteredRuns, pageRuns])

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

  const applyFilter = useCallback(async (rawValue: string, opts: { signal?: AbortSignal } = {}) => {
    const value = rawValue.trim()
    if (!value) return
    const mode = detectSearchMode(value)
    // For practice mode, require a token of at least 2 chars to avoid runaway queries
    if (mode === 'practice') {
      const tokens = value.split(/\s+/).filter((t) => t.length >= 2)
      if (tokens.length === 0) {
        setFilteredRuns([])
        setActiveJobId(null)
        setActiveQuery({ mode, value })
        setError(null)
        return
      }
    }
    setLoading(true)
    setError(null)
    try {
      const param = mode === 'jobId' ? 'jobId' : mode === 'sfJobId' ? 'sfJobId' : 'practice'
      const res = await fetch(`/api/runs?${param}=${encodeURIComponent(value)}`, { signal: opts.signal })
      if (!res.ok) throw new Error('Failed to fetch runs')
      const data = await res.json()
      if (opts.signal?.aborted) return
      setFilteredRuns(data.runs || [])
      // Only the popup-level Kimedics filter makes sense when the user typed a Kimedics id
      setActiveJobId(mode === 'jobId' ? value : null)
      setActiveQuery({ mode, value })
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return
      setError(`Failed to load runs for ${SEARCH_MODE_LABEL[mode]}`)
      setFilteredRuns([])
      setActiveJobId(mode === 'jobId' ? value : null)
      setActiveQuery({ mode, value })
    } finally {
      if (!opts.signal?.aborted) setLoading(false)
    }
  }, [])

  // Live debounced search — fire 300ms after the user stops typing, abort
  // any in-flight request when input changes again. Empty input is handled by
  // the cleanup effect above (reverts to the recent-runs view).
  useEffect(() => {
    if (trimmedInput === '') return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      void applyFilter(trimmedInput, { signal: ctrl.signal })
    }, 300)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [trimmedInput, applyFilter])

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

  const isEmpty = displayedRuns.length === 0
  const emptyMessage = facets.size > 0 && facetCandidatePool.length > 0
    ? `No runs match the active filter${facets.size === 1 ? '' : 's'}. Clear them above or pick a different signal.`
    : activeQuery
      ? `No runs found for ${SEARCH_MODE_LABEL[activeQuery.mode]}: ${activeQuery.value}`
      : 'No runs found in the database.'

  return (
    <div className="space-y-0.5">
      {/* Filter — searches live as the user types (300ms debounce) */}
      <div className="px-3 pt-2 pb-1 flex items-center gap-2">
        <div className="relative w-full">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="job_id (19596), Salesforce id (a01UP00000…), or practice name"
            className="w-full bg-zinc-900/40 border border-zinc-700/50 rounded-lg px-3 py-2 pr-8 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-600/50"
          />
          {canSearch && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 p-1"
              aria-label="Clear search"
              type="button"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {loading && (
          <span className="text-[11px] text-zinc-500 whitespace-nowrap">Searching…</span>
        )}
      </div>

      {/* Mode hint / result count */}
      {canSearch && (
        <div className="px-3 pb-1 text-[11px] text-zinc-500">
          {activeQuery ? (
            <>
              <span className="text-zinc-400">{filteredRuns?.length ?? 0}</span>{' '}
              run{(filteredRuns?.length ?? 0) === 1 ? '' : 's'} match{' '}
              <span className="text-zinc-300">{SEARCH_MODE_LABEL[activeQuery.mode]}</span>
              {': '}
              <span className="font-mono text-zinc-300">{activeQuery.value}</span>
            </>
          ) : previewMode ? (
            <>Will search as <span className="text-zinc-300">{SEARCH_MODE_LABEL[previewMode]}</span></>
          ) : null}
        </div>
      )}

      {error && (
        <div className="px-3 pb-1 text-[11px] text-red-400">
          {error}
        </div>
      )}

      {/* SF-push facet filter — click any pill to filter ALL runs (full
          history fetched on mount) to rows matching that signal. Multiple
          pills are OR'd. Counts shown next to each pill are global. */}
      <div className="px-3 pt-1 pb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500 mr-1">Filter</span>
        {SF_FACETS.map(f => {
          const active = facets.has(f.key)
          // Counts always derive from the full history once it has loaded,
          // so the number next to a pill represents the ENTIRE dataset (not
          // the current 20-row page). Until the fetch completes, fall back
          // to the current page so the bar still renders meaningfully.
          const countPool: RunDetail[] = allRuns ?? filteredRuns ?? pageRuns
          const count = countPool.filter(f.match).length
          const toneActive: Record<string, string> = {
            red:     'bg-red-500/15 border-red-500/40 text-red-300',
            amber:   'bg-amber-500/15 border-amber-500/40 text-amber-300',
            violet:  'bg-violet-500/15 border-violet-500/40 text-violet-300',
            cyan:    'bg-cyan-500/15 border-cyan-500/40 text-cyan-300',
            emerald: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
            slate:   'bg-zinc-500/20 border-zinc-500/40 text-zinc-300',
            sky:     'bg-sky-500/15 border-sky-500/40 text-sky-300',
          }
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFacets(prev => {
                const next = new Set(prev)
                if (next.has(f.key)) next.delete(f.key)
                else next.add(f.key)
                return next
              })}
              disabled={!active && count === 0}
              title={f.tooltip}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors',
                active
                  ? toneActive[f.tone]
                  : count > 0
                    ? 'border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
                    : 'border-zinc-800 text-zinc-700 cursor-not-allowed',
              )}
            >
              {f.label}
              <span className={cn(
                'text-[10px] tabular-nums',
                active ? 'opacity-90' : 'opacity-70',
              )}>{count}</span>
            </button>
          )
        })}
        {facets.size > 0 && (
          <button
            type="button"
            onClick={() => setFacets(new Set())}
            className="text-[11px] text-zinc-500 hover:text-zinc-200 underline underline-offset-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Instruction text + filter status */}
      <div className="px-3 py-1 text-xs text-zinc-500 flex items-center gap-1.5 flex-wrap">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
        Click any row to view details
        {allRunsLoading && (
          <span className="text-zinc-500">· loading full history for filters…</span>
        )}
        {facets.size > 0 && !allRunsLoading && (
          <span className="text-zinc-400">
            · <span className="text-zinc-200">{displayedRuns.length}</span> matching across all {facetCandidatePool.length} runs
          </span>
        )}
        {allRunsError && (
          <span className="text-red-400">· couldn't load full history: {allRunsError}</span>
        )}
      </div>

      {/* Header + rows wrap in an overflow container so narrow viewports
          scroll horizontally instead of squashing the columns. */}
      <div className="overflow-x-auto -mx-1 px-1">
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

      {isEmpty && (
        <div className="py-10 text-center text-zinc-600 text-sm">
          {emptyMessage}
        </div>
      )}

      {!isEmpty && displayedRuns.map((run) => (
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
            unresolvedFailedJobCount={run.unresolvedFailedJobCount}
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
      </div>

      {/* Pagination (unfiltered only) */}
      {filteredRuns === null && facets.size === 0 && (() => {
        const currentPage = Math.floor(pageOffset / PAGE_SIZE) + 1
        const totalPages = allRuns ? Math.max(1, Math.ceil(allRuns.length / PAGE_SIZE)) : null
        const atLastPage = totalPages !== null ? currentPage >= totalPages : !hasOlder
        const pageItems = totalPages !== null ? buildPageWindow(currentPage, totalPages) : []
        return (
          <div className="px-3 pt-2 flex items-center justify-between gap-2">
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

            {totalPages !== null ? (
              <div className="flex items-center gap-1 flex-wrap justify-center">
                {pageItems.map((item, i) =>
                  item === 'ellipsis' ? (
                    <span key={`gap-${i}`} className="text-[11px] text-zinc-600 px-1 select-none">…</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => item !== currentPage && fetchPage((item - 1) * PAGE_SIZE)}
                      disabled={paging || item === currentPage}
                      aria-current={item === currentPage ? 'page' : undefined}
                      className={cn(
                        'min-w-[26px] px-1.5 py-1 rounded-md text-[11px] font-medium border transition-colors tabular-nums',
                        item === currentPage
                          ? 'border-zinc-500 bg-zinc-700/40 text-zinc-100 cursor-default'
                          : 'border-zinc-800 text-zinc-400 hover:border-zinc-700/60 hover:text-zinc-200 hover:bg-zinc-700/30'
                      )}
                    >
                      {item}
                    </button>
                  )
                )}
              </div>
            ) : (
              <span className="text-[11px] text-zinc-600 tabular-nums">
                Page {currentPage}
              </span>
            )}

            <button
              onClick={() => fetchPage(pageOffset + PAGE_SIZE)}
              disabled={paging || atLastPage}
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors inline-flex items-center gap-1.5',
                atLastPage || paging
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
        )
      })()}

      <ValidationPopup
        runId={selectedRunId || 0}
        isOpen={selectedRunId !== null}
        onClose={() => setSelectedRunId(null)}
        jobId={activeJobId ?? undefined}
        sfJobId={activeQuery?.mode === 'sfJobId' ? activeQuery.value : undefined}
        practice={activeQuery?.mode === 'practice' ? activeQuery.value : undefined}
      />
    </div>
  )
}
