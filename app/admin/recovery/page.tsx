'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ────────────────────────────────────────────────────────────────────
// Two API endpoints feed this page:
//   /api/admin/recovery/list           — unresolved SF push errors (after the
//                                        Job__c exists; e.g. sf_scrape_fields_error)
//   /api/admin/recovery/scrape-failures — jobs that never landed in SF at all
//                                        (job_create_failed, mapping_no_match, etc.)
// We merge them into one UnifiedFailure list so the operator sees ONE table
// and picks an action per row.

type ListItem = {
  id: number
  jobId: string
  eventType: string
  runId: number | null
  createdAt: string
  error: string
  attempt: Record<string, any> | null
}

type ScrapeFailureItem = {
  jobId: string
  eventType: string
  runId: number | null
  reason: string | null
  detail: string | null
  errorMessage: string | null
  practiceValue: string | null
  kimedicsLink: string | null
  createdAt: string
}

type UnifiedFailure = {
  jobId: string
  eventType: string
  createdAt: string
  source: 'list' | 'scrape-failures'  // which API the row came from
  // Display fields
  errorText: string
  practiceValue: string | null
  kimedicsLink: string | null
  // Used by "Re-push" action's bulk endpoint (which keys off job_event_log id)
  eventId: number | null
  attempt: Record<string, any> | null
  runId: number | null
}

type RunResult = {
  job_id: string
  action: string
  fields_pushed: string[]
  fields_quarantined: string[]
  error: string | null
  sf_job_id: string | null
}

type HistoryItem = {
  id: number
  jobId: string
  eventType: string
  runId: number | null
  createdAt: string
  invocation: string | null
  invoker: string | null
  action: string | null
  fieldsPushed: string[]
  fieldsQuarantined: string[]
  field: string | null
  offendingFields: string[]
  sfJobId: string | null
  error: string | null
}

// ── Plain-English copy + recommendation ──────────────────────────────────────

type RecAction = 'repush' | 'rescrape'

const EVENT_LABEL: Record<string, string> = {
  sf_scrape_fields_error: 'Field update failed',
  sf_mapping_pull_failed: 'Salesforce auth or mapping pull failed',
  sf_push_unhandled_error: 'Salesforce returned an unrecognized error',
  sf_field_quarantined: 'One field dropped during sync',
  job_create_failed: 'Salesforce Job__c creation failed',
  worksite_create_failed: 'Salesforce Worksite creation failed',
  mapping_no_match: 'No Salesforce match found',
  mapping_ambiguous: 'Multiple Salesforce candidates',
  mapping_review_required: 'Mapping needs review (legacy)',
  mapping_blocked_no_practice_value: 'No practice value (login wall / page change)',
  scrape_silent_failure: 'Scrape returned no content',
}

const RECOMMENDATION: Record<string, { action: RecAction; why: string }> = {
  // SF push or mapping/auth failures — local scrape data is fine
  sf_scrape_fields_error: { action: 'repush', why: 'Local scrape data is fine — only the push to Salesforce failed.' },
  sf_mapping_pull_failed: { action: 'repush', why: 'Auth / SF availability issue — re-push retries with fresh credentials.' },
  sf_push_unhandled_error: { action: 'repush', why: 'Push failed for an unrecognized reason. Try re-pushing first.' },
  sf_field_quarantined: { action: 'repush', why: 'A single field was dropped. Re-push will retry the field set.' },
  job_create_failed: { action: 'repush', why: 'The SF create call failed; data we have locally is good.' },
  worksite_create_failed: { action: 'repush', why: 'The Worksite create failed; the Kimedics scrape itself was clean.' },
  // Mapping / scrape-side failures — need a fresh scrape from Kimedics
  mapping_no_match: { action: 'rescrape', why: 'Resolver couldn’t find a match. A fresh Kimedics scrape may produce a cleaner practice value.' },
  mapping_ambiguous: { action: 'rescrape', why: 'Resolver found multiple candidates. Fresh data may disambiguate.' },
  mapping_review_required: { action: 'rescrape', why: 'Legacy review state. A fresh scrape usually clears it under the current resolver.' },
  mapping_blocked_no_practice_value: { action: 'rescrape', why: 'The scrape produced no practice — re-scrape Kimedics (likely a transient login wall).' },
  scrape_silent_failure: { action: 'rescrape', why: 'The scrape returned nothing. Must re-run from Kimedics.' },
}

function getRecommendation(eventType: string): { action: RecAction; why: string } {
  return RECOMMENDATION[eventType] ?? { action: 'repush', why: 'Default — retry the SF push first; if it persists, try a full rescrape.' }
}

const WINDOW_CHOICES = [
  { label: 'Last 3 h', hours: 3 },
  { label: 'Last 24 h', hours: 24 },
  { label: 'Last 48 h (default)', hours: 48 },
  { label: 'Last 7 d', hours: 24 * 7 },
]

function fmt(ts: string): string {
  try {
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return ts
    return d.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ts
  }
}

function timeAgo(ts: string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const secs = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function AdminRecoveryPage() {
  const router = useRouter()
  const [hours, setHours] = useState(48)
  const [listItems, setListItems] = useState<ListItem[]>([])
  const [scrapeFailures, setScrapeFailures] = useState<ScrapeFailureItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [results, setResults] = useState<RunResult[] | null>(null)
  const [dryRun, setDryRun] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)

  // Per-job action status during a bulk run.
  //   - 'queued'  : selected but not yet started
  //   - 'running' : in-flight (re-push or rescrape)
  //   - 'done'    : succeeded
  //   - 'failed'  : individual error (still moves on to the next)
  //   - 'cancelled': bulk run cancelled by operator before reaching this job
  type JobActionStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
  type JobStatus = { state: JobActionStatus; kind: 'repush' | 'rescrape'; detail?: string }
  const [jobStatus, setJobStatus] = useState<Map<string, JobStatus>>(new Map())
  const [progress, setProgress] = useState<{ done: number; total: number; currentJobId?: string } | null>(null)
  const cancelRequestedRef = useRef(false)

  // ── Data loading ────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [listRes, scrapeRes] = await Promise.all([
        fetch(`/api/admin/recovery/list?hours=${hours}`),
        fetch(`/api/admin/recovery/scrape-failures?hours=${hours}`),
      ])
      if (listRes.status === 401 || scrapeRes.status === 401) {
        router.replace('/admin/login?next=/admin/recovery')
        return
      }
      const listJson = await listRes.json()
      const scrapeJson = await scrapeRes.json()
      if (!listJson.ok) {
        setError(listJson.error || 'Failed to load unresolved errors')
        return
      }
      if (!scrapeJson.ok) {
        setError(scrapeJson.error || 'Failed to load stuck jobs')
        return
      }
      setListItems(listJson.items || [])
      setScrapeFailures(scrapeJson.items || [])
      setSelected(new Set())
    } catch (e: any) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [hours, router])

  useEffect(() => { loadAll() }, [loadAll])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/admin/recovery/history?limit=100')
      if (res.ok) {
        const json = await res.json()
        setHistory(json.items || [])
      }
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => { if (historyOpen) loadHistory() }, [historyOpen, loadHistory])

  // ── Unify the two data sources ─────────────────────────────────────────
  const failures = useMemo<UnifiedFailure[]>(() => {
    const out: UnifiedFailure[] = []
    const seen = new Set<string>()  // dedupe by (jobId, eventType)
    for (const it of listItems) {
      const k = `${it.jobId}|${it.eventType}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({
        jobId: it.jobId,
        eventType: it.eventType,
        createdAt: it.createdAt,
        source: 'list',
        errorText: it.error || '',
        practiceValue: null,
        kimedicsLink: null,
        eventId: it.id,
        attempt: it.attempt,
        runId: it.runId,
      })
    }
    for (const it of scrapeFailures) {
      const k = `${it.jobId}|${it.eventType}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({
        jobId: it.jobId,
        eventType: it.eventType,
        createdAt: it.createdAt,
        source: 'scrape-failures',
        errorText: it.reason || it.detail || it.errorMessage || '',
        practiceValue: it.practiceValue,
        kimedicsLink: it.kimedicsLink,
        eventId: null,
        attempt: null,
        runId: it.runId,
      })
    }
    // Most recent first
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    return out
  }, [listItems, scrapeFailures])

  // ── Selection ─────────────────────────────────────────────────────────
  const toggleSelect = (jobId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }
  const selectAll = () => setSelected(new Set(failures.map((f) => f.jobId)))
  const clearSel = () => setSelected(new Set())

  // ── Actions ───────────────────────────────────────────────────────────
  // Bulk operations are processed ONE JOB AT A TIME (server-side calls each
  // hit either the SF push retry endpoint or the Modal rescrape endpoint
  // with a single jobId). Reasons:
  //   1. Avoids Vercel function timeouts (each request is ~5-60s, well within
  //      the function limit) which used to abort large bulk requests.
  //   2. Gives the operator real-time progress: each row's status flips as
  //      its turn comes up.
  //   3. Lets the user cancel a long bulk operation without losing jobs that
  //      already completed.
  const cancelBulk = useCallback(() => { cancelRequestedRef.current = true }, [])

  const setOneStatus = useCallback((jobId: string, s: JobStatus) => {
    setJobStatus((prev) => {
      const next = new Map(prev)
      next.set(jobId, s)
      return next
    })
  }, [])

  const runOnePush = useCallback(async (jobId: string): Promise<{ ok: boolean; detail?: string; result?: RunResult }> => {
    try {
      const res = await fetch('/api/admin/recovery/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds: [jobId], sinceHours: hours, dryRun }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) return { ok: false, detail: json.error || `HTTP ${res.status}` }
      const r: RunResult | undefined = (json.results || [])[0]
      return { ok: true, detail: r?.action, result: r }
    } catch (e: any) {
      return { ok: false, detail: e?.message || 'request failed' }
    }
  }, [hours, dryRun])

  const runOneRescrape = useCallback(async (jobId: string): Promise<{ ok: boolean; detail?: string }> => {
    try {
      const res = await fetch('/api/admin/recovery/rescrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds: [jobId] }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) return { ok: false, detail: json.error || `HTTP ${res.status}` }
      return { ok: true, detail: 'rescrape complete' }
    } catch (e: any) {
      return { ok: false, detail: e?.message || 'request failed' }
    }
  }, [])

  // Runs a list of (jobId, kind) pairs sequentially.
  const runBulk = useCallback(async (jobs: Array<{ jobId: string; kind: 'repush' | 'rescrape' }>) => {
    if (jobs.length === 0) return
    setRunning(true)
    setActionError(null)
    setStatusMsg(null)
    setResults(null)
    cancelRequestedRef.current = false

    // Mark all as queued up-front so the UI shows the planned set.
    const initial = new Map<string, JobStatus>()
    for (const j of jobs) initial.set(j.jobId, { state: 'queued', kind: j.kind })
    setJobStatus(initial)
    setProgress({ done: 0, total: jobs.length })

    const aggregated: RunResult[] = []
    let successCount = 0
    let failCount = 0

    for (let i = 0; i < jobs.length; i++) {
      const { jobId, kind } = jobs[i]
      if (cancelRequestedRef.current) {
        // Mark remaining as cancelled
        setJobStatus((prev) => {
          const next = new Map(prev)
          for (let k = i; k < jobs.length; k++) {
            next.set(jobs[k].jobId, { state: 'cancelled', kind: jobs[k].kind })
          }
          return next
        })
        break
      }
      setOneStatus(jobId, { state: 'running', kind })
      setProgress({ done: i, total: jobs.length, currentJobId: jobId })

      const out =
        kind === 'rescrape' ? await runOneRescrape(jobId) : await runOnePush(jobId)

      if (out.ok) {
        successCount++
        setOneStatus(jobId, { state: 'done', kind, detail: out.detail })
        const r = (out as { result?: RunResult }).result
        if (r) aggregated.push(r)
      } else {
        failCount++
        setOneStatus(jobId, { state: 'failed', kind, detail: out.detail })
      }
      setProgress({ done: i + 1, total: jobs.length, currentJobId: undefined })
    }

    if (aggregated.length) setResults(aggregated)
    const total = jobs.length
    setStatusMsg(
      cancelRequestedRef.current
        ? `Cancelled. ${successCount} of ${total} completed (${failCount} failed) before stop.`
        : `Done. ${successCount} of ${total} succeeded${failCount ? `, ${failCount} failed` : ''}.`,
    )
    setProgress(null)
    setRunning(false)
    cancelRequestedRef.current = false
    await loadAll()
  }, [loadAll, runOnePush, runOneRescrape, setOneStatus])

  const doRepush = useCallback(async (jobIds: string[]) => {
    await runBulk(jobIds.map((jobId) => ({ jobId, kind: 'repush' as const })))
  }, [runBulk])

  const doRescrape = useCallback(async (jobIds: string[]) => {
    await runBulk(jobIds.map((jobId) => ({ jobId, kind: 'rescrape' as const })))
  }, [runBulk])

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.replace('/admin/login')
  }

  // "Apply recommended" — one combined sequential run, picking the right
  // action per row from RECOMMENDATION. Rescrape rows take longer than
  // re-push rows; interleaving them in one sequence shows steady progress
  // rather than a "fast-then-slow" two-phase wait.
  const applyRecommended = useCallback(async () => {
    const picked = failures.filter((f) => selected.has(f.jobId))
    const jobs = picked.map((f) => ({
      jobId: f.jobId,
      kind: getRecommendation(f.eventType).action as 'repush' | 'rescrape',
    }))
    await runBulk(jobs)
  }, [failures, selected, runBulk])

  const actionColor = (a: string) => {
    if (a === 're_parsed' || a === 'transient_retried' || a === 're_scraped') return 'text-emerald-300'
    if (a === 'field_dropped' || a === 're_scraped_with_warning') return 'text-amber-300'
    if (a === 'quarantined' || a === 'unhandled' || a === 'rescrape_parse_failed') return 'text-red-300'
    return 'text-zinc-300'
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-3 sm:p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold">Admin · Recovery</h1>
            <p className="text-xs text-zinc-500 mt-1">
              Every failed job — whether it stalled in mapping or hit a Salesforce push error — appears here.
              Each row carries a recommended action; you can also apply re-push or rescrape in bulk.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/admin/checkin"
              className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded px-2.5 py-1"
            >
              Check-In →
            </a>
            <button
              onClick={logout}
              className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded px-2.5 py-1"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
          <label className="text-xs text-zinc-400">Window:</label>
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1 text-xs"
          >
            {WINDOW_CHOICES.map((w) => (
              <option key={w.hours} value={w.hours}>{w.label}</option>
            ))}
          </select>
          <button
            onClick={loadAll}
            disabled={loading}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 rounded-md px-2.5 py-1"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <div className="flex-1" />
          <label className="text-xs text-zinc-400 inline-flex items-center gap-1.5">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Dry run (re-push classify only)
          </label>
        </div>

        {/* Bulk action bar */}
        {failures.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-zinc-900/40 border border-zinc-800 rounded-lg text-xs">
            <span className="text-zinc-500">{selected.size} of {failures.length} selected</span>
            <button onClick={selectAll} disabled={!failures.length} className="text-zinc-400 hover:text-zinc-200 disabled:text-zinc-700">Select all</button>
            <button onClick={clearSel} disabled={!selected.size} className="text-zinc-400 hover:text-zinc-200 disabled:text-zinc-700">Clear</button>
            <div className="flex-1" />
            <button
              onClick={applyRecommended}
              disabled={running || selected.size === 0}
              title="For each selected row, runs whichever action is recommended (re-push or full rescrape)."
              className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-md px-3 py-1 font-medium"
            >
              ✨ Apply recommended ({selected.size})
            </button>
            <button
              onClick={() => doRepush(Array.from(selected))}
              disabled={running || selected.size === 0}
              className="bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 rounded-md px-3 py-1"
            >
              Re-push selected
            </button>
            <button
              onClick={() => doRescrape(Array.from(selected))}
              disabled={running || selected.size === 0}
              className="bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 rounded-md px-3 py-1"
            >
              Rescrape selected
            </button>
          </div>
        )}

        {/* Progress bar (visible only while a bulk operation is in flight) */}
        {progress && (
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="text-zinc-300 min-w-0 truncate">
                Processing&nbsp;
                <span className="text-zinc-100 font-semibold tabular-nums">{progress.done}</span>
                &nbsp;/&nbsp;
                <span className="text-zinc-300 tabular-nums">{progress.total}</span>
                {progress.currentJobId && (
                  <span className="text-zinc-500"> · current: <span className="font-mono text-zinc-300">job {progress.currentJobId}</span></span>
                )}
              </div>
              <button
                onClick={cancelBulk}
                disabled={cancelRequestedRef.current}
                className="text-[11px] border border-zinc-700/60 hover:bg-zinc-700/30 disabled:border-zinc-800 disabled:text-zinc-600 rounded-md px-2.5 py-1 whitespace-nowrap"
              >
                {cancelRequestedRef.current ? 'Cancelling…' : 'Cancel after current'}
              </button>
            </div>
            <div className="h-2 w-full bg-zinc-800/80 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-[width] duration-300 ease-out"
                style={{ width: `${progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-zinc-500">
              Each job runs on its own request, so a Vercel timeout on one job won&apos;t kill the rest. Per-row status updates live as the queue advances.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
        {actionError && <p className="text-sm text-red-400">{actionError}</p>}
        {statusMsg && <p className="text-sm text-emerald-300">{statusMsg}</p>}

        {/* Unified failures table */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
            <div className="text-xs text-zinc-300 font-medium">
              Failed jobs <span className="text-zinc-500 font-normal">({failures.length})</span>
            </div>
            <div className="text-[11px] text-zinc-500">
              ⚡ Re-push = retry Salesforce push using existing local data &nbsp;·&nbsp; 🔄 Rescrape = re-fetch the Kimedics page first, then push
            </div>
          </div>

          {failures.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-zinc-600">
              {loading ? 'Loading…' : 'No failed jobs in this window. 🎉'}
            </p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-zinc-500 text-[11px] uppercase tracking-wider bg-zinc-950/40">
                  <th className="w-8 py-2 px-3"></th>
                  <th className="text-left py-2 px-3">Job</th>
                  <th className="text-left py-2 px-3">Failed</th>
                  <th className="text-left py-2 px-3">Recommendation</th>
                  <th className="text-right py-2 px-3 pr-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {failures.map((f) => {
                  const rec = getRecommendation(f.eventType)
                  const recIsRepush = rec.action === 'repush'
                  const expandKey = `${f.jobId}|${f.eventType}`
                  const isExpanded = expanded.has(expandKey)
                  return (
                    <Fragment key={expandKey}>
                      <tr className="border-t border-zinc-800 hover:bg-zinc-900/40 align-top">
                        <td className="py-3 px-3">
                          <input
                            type="checkbox"
                            checked={selected.has(f.jobId)}
                            onChange={() => toggleSelect(f.jobId)}
                          />
                        </td>
                        <td className="py-3 px-3 font-mono text-zinc-200 whitespace-nowrap text-xs">
                          <div>{f.jobId}</div>
                          <div className="text-[10px] text-zinc-600 mt-0.5">
                            {timeAgo(f.createdAt)} · {fmt(f.createdAt)}
                          </div>
                          {f.runId != null && (
                            <div className="text-[10px] text-zinc-600">run #{f.runId}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 max-w-md">
                          <div className="text-zinc-200 text-xs font-medium">
                            {EVENT_LABEL[f.eventType] ?? f.eventType}
                          </div>
                          <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2 break-words">
                            {f.errorText || <span className="text-zinc-700 italic">(no details)</span>}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            {f.kimedicsLink && (
                              <a
                                href={f.kimedicsLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-blue-400 hover:text-blue-300 underline"
                              >
                                Open in Kimedics
                              </a>
                            )}
                            <button
                              onClick={() =>
                                setExpanded((prev) => {
                                  const n = new Set(prev)
                                  if (n.has(expandKey)) n.delete(expandKey)
                                  else n.add(expandKey)
                                  return n
                                })
                              }
                              className="text-[10px] text-zinc-500 hover:text-zinc-300"
                            >
                              {isExpanded ? 'Hide details' : 'Show details'}
                            </button>
                            <span className="text-[10px] text-zinc-700 font-mono">{f.eventType}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 max-w-xs">
                          <div className={`text-xs font-medium ${recIsRepush ? 'text-zinc-200' : 'text-sky-300'}`}>
                            {recIsRepush ? '⚡ Re-push' : '🔄 Full rescrape'}
                          </div>
                          <div className="text-[11px] text-zinc-500 mt-0.5 break-words">
                            {rec.why}
                          </div>
                        </td>
                        <td className="py-3 px-3 pr-4 text-right whitespace-nowrap">
                          <div className="flex flex-col items-end gap-1.5">
                            {(() => {
                              const s = jobStatus.get(f.jobId)
                              if (!s) return null
                              const pill = (label: string, cls: string, icon?: React.ReactNode) => (
                                <div className={`inline-flex items-center gap-1 text-[10px] font-medium rounded-full border px-2 py-0.5 ${cls}`}>
                                  {icon}{label}
                                </div>
                              )
                              if (s.state === 'queued')
                                return pill('Queued', 'border-zinc-700/60 text-zinc-400')
                              if (s.state === 'running')
                                return pill(
                                  s.kind === 'rescrape' ? 'Rescraping…' : 'Pushing…',
                                  'border-amber-500/40 bg-amber-500/10 text-amber-300',
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" />,
                                )
                              if (s.state === 'done')
                                return pill('✓ Done', 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300')
                              if (s.state === 'failed')
                                return pill(
                                  s.detail ? `✕ Failed: ${s.detail.slice(0, 40)}` : '✕ Failed',
                                  'border-red-500/40 bg-red-500/10 text-red-300',
                                )
                              if (s.state === 'cancelled')
                                return pill('Cancelled', 'border-zinc-700/60 text-zinc-500')
                              return null
                            })()}
                            <div>
                          {recIsRepush ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => doRepush([f.jobId])}
                                disabled={running}
                                className="text-[11px] bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-md px-2.5 py-1 font-medium"
                              >
                                Re-push
                              </button>
                              <button
                                onClick={() => doRescrape([f.jobId])}
                                disabled={running}
                                title="Alternative: full rescrape from Kimedics"
                                className="text-[11px] border border-zinc-700/60 hover:bg-zinc-700/30 disabled:border-zinc-800 disabled:text-zinc-600 rounded-md px-2 py-1"
                              >
                                Rescrape
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => doRescrape([f.jobId])}
                                disabled={running}
                                className="text-[11px] bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-md px-2.5 py-1 font-medium"
                              >
                                Rescrape
                              </button>
                              <button
                                onClick={() => doRepush([f.jobId])}
                                disabled={running}
                                title="Alternative: retry SF push only"
                                className="text-[11px] border border-zinc-700/60 hover:bg-zinc-700/30 disabled:border-zinc-800 disabled:text-zinc-600 rounded-md px-2 py-1"
                              >
                                Re-push
                              </button>
                            </div>
                          )}
                            </div>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-zinc-950/60 border-t border-zinc-800/60">
                          <td></td>
                          <td colSpan={4} className="py-3 px-3">
                            <div className="text-[11px] text-zinc-400 space-y-2">
                              {f.practiceValue && (
                                <div><span className="text-zinc-600">Practice:</span> <span className="font-mono">{f.practiceValue}</span></div>
                              )}
                              {f.errorText && (
                                <div>
                                  <div className="text-zinc-600 mb-0.5">Full error:</div>
                                  <pre className="text-[11px] text-zinc-400 overflow-auto max-h-48 whitespace-pre-wrap break-words bg-zinc-950/50 rounded p-2 border border-zinc-800/60">
                                    {f.errorText}
                                  </pre>
                                </div>
                              )}
                              {f.attempt && (
                                <div>
                                  <div className="text-zinc-600 mb-0.5">Attempt log:</div>
                                  <pre className="text-[11px] text-zinc-400 overflow-auto max-h-48 whitespace-pre-wrap break-words bg-zinc-950/50 rounded p-2 border border-zinc-800/60">
                                    {JSON.stringify(f.attempt, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table></div>
          )}
        </div>

        {/* Last action results */}
        {results && (
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg">
            <div className="px-4 py-2 border-b border-zinc-800 text-xs text-zinc-400">
              Last re-push results ({results.length})
            </div>
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-zinc-500 text-[11px] uppercase tracking-wider">
                  <th className="text-left py-2 px-3">Job</th>
                  <th className="text-left py-2 px-3">Action</th>
                  <th className="text-left py-2 px-3">SF id</th>
                  <th className="text-right py-2 px-3">Pushed</th>
                  <th className="text-right py-2 px-3">Quarantined</th>
                  <th className="text-left py-2 px-3">Detail</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={`${r.job_id}-${i}`} className="border-t border-zinc-800">
                    <td className="py-2 px-3 font-mono">{r.job_id}</td>
                    <td className={`py-2 px-3 font-medium ${actionColor(r.action)}`}>{r.action}</td>
                    <td className="py-2 px-3 font-mono text-xs text-zinc-400">{r.sf_job_id || '—'}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{r.fields_pushed.length}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{r.fields_quarantined.length}</td>
                    <td className="py-2 px-3 text-zinc-400 text-xs">{r.error || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}

        {/* Manual push log (collapsed by default) */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-zinc-900/60"
          >
            <span className="text-xs text-zinc-400 font-medium">
              Manual push log {historyOpen ? '' : '(click to expand)'}
            </span>
            <span className="text-[11px] text-zinc-600">{historyOpen ? '▾ Hide' : '▸ Show'}</span>
          </button>
          {historyOpen && (
            history.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-zinc-600">
                {historyLoading ? 'Loading…' : 'No manual pushes yet.'}
              </p>
            ) : (
              <div className="overflow-x-auto border-t border-zinc-800"><table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-zinc-500 text-[11px] uppercase tracking-wider">
                    <th className="text-left py-2 px-3">When</th>
                    <th className="text-left py-2 px-3">Job</th>
                    <th className="text-left py-2 px-3">Event</th>
                    <th className="text-left py-2 px-3">Action / field</th>
                    <th className="text-left py-2 px-3">Source</th>
                    <th className="text-right py-2 px-3">Pushed</th>
                    <th className="text-right py-2 px-3">Quar.</th>
                    <th className="text-left py-2 px-3">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => {
                    const detail =
                      h.eventType === 'sf_scrape_fields_recovered'
                        ? h.offendingFields.length
                          ? `offending: ${h.offendingFields.join(', ')}`
                          : ''
                        : h.error || ''
                    const actionOrField =
                      h.eventType === 'sf_field_quarantined' ? (h.field || '—') : (h.action || '—')
                    const src =
                      h.invocation === 'manual_cli'
                        ? `CLI${h.invoker ? ` · ${h.invoker.replace(/^cli:/, '')}` : ''}`
                        : h.invocation === 'manual_admin_ui'
                          ? 'Admin UI'
                          : h.invocation === 'auto_retry'
                            ? 'Auto retry'
                            : (h.invocation || '—')
                    return (
                      <tr key={h.id} className="border-t border-zinc-800">
                        <td className="py-2 px-3 text-zinc-400 text-xs whitespace-nowrap">{fmt(h.createdAt)}</td>
                        <td className="py-2 px-3 font-mono text-zinc-200">{h.jobId}</td>
                        <td className="py-2 px-3 text-zinc-400 text-xs">
                          {h.eventType === 'sf_scrape_fields_recovered' && <span className="text-emerald-300">recovered</span>}
                          {h.eventType === 'manual_rescrape_completed' && <span className="text-sky-300">rescraped</span>}
                          {h.eventType === 'auto_retry_completed' && <span className="text-cyan-300">auto retry</span>}
                          {h.eventType === 'sf_field_quarantined' && <span className="text-amber-300">quarantined</span>}
                          {h.eventType === 'sf_push_unhandled_error' && <span className="text-red-300">unhandled</span>}
                        </td>
                        <td className={`py-2 px-3 text-xs ${actionColor(actionOrField)}`}>{actionOrField}</td>
                        <td className="py-2 px-3 text-zinc-500 text-xs">{src}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-xs">{h.fieldsPushed.length || ''}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-xs">{h.fieldsQuarantined.length || ''}</td>
                        <td className="py-2 px-3 text-zinc-400 text-xs">
                          <span className="line-clamp-2 break-all">{detail}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
