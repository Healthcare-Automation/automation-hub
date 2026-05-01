'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type ErrorItem = {
  id: number
  jobId: string
  eventType: string
  runId: number | null
  createdAt: string
  error: string
  attempt: Record<string, any> | null
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

export default function AdminRecoveryPage() {
  const router = useRouter()
  const [hours, setHours] = useState(48)
  const [items, setItems] = useState<ErrorItem[]>([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [results, setResults] = useState<RunResult[] | null>(null)
  const [dryRun, setDryRun] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [scrapeFailures, setScrapeFailures] = useState<ScrapeFailureItem[]>([])
  const [scrapeFailuresLoading, setScrapeFailuresLoading] = useState(false)
  const [scrapeFailuresError, setScrapeFailuresError] = useState<string | null>(null)
  const [rescrapeJobIdInput, setRescrapeJobIdInput] = useState('')
  const [rescraping, setRescraping] = useState(false)
  const [rescrapeError, setRescrapeError] = useState<string | null>(null)
  const [rescrapeStatus, setRescrapeStatus] = useState<string | null>(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const res = await fetch(`/api/admin/recovery/list?hours=${hours}`)
      if (res.status === 401) {
        router.replace('/admin/login?next=/admin/recovery')
        return
      }
      const json = await res.json()
      if (!json.ok) {
        setListError(json.error || 'Failed to load')
        setItems([])
        return
      }
      setItems(json.items || [])
      setSelected(new Set())
    } catch (e: any) {
      setListError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [hours, router])

  useEffect(() => {
    loadList()
  }, [loadList])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/admin/recovery/history?limit=100')
      if (!res.ok) {
        setHistory([])
        return
      }
      const json = await res.json()
      setHistory(json.items || [])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const loadScrapeFailures = useCallback(async () => {
    setScrapeFailuresLoading(true)
    setScrapeFailuresError(null)
    try {
      const res = await fetch(`/api/admin/recovery/scrape-failures?hours=${hours}`)
      if (res.status === 401) {
        router.replace('/admin/login?next=/admin/recovery')
        return
      }
      const json = await res.json()
      if (!json.ok) {
        setScrapeFailuresError(json.error || 'Failed to load scrape failures')
        setScrapeFailures([])
        return
      }
      setScrapeFailures(json.items || [])
    } catch (e: any) {
      setScrapeFailuresError(e?.message || 'Failed to load scrape failures')
    } finally {
      setScrapeFailuresLoading(false)
    }
  }, [hours, router])

  useEffect(() => {
    loadScrapeFailures()
  }, [loadScrapeFailures])

  const rescrape = async (jobIds: string[]) => {
    if (jobIds.length === 0) return
    setRescraping(true)
    setRescrapeError(null)
    setRescrapeStatus(null)
    try {
      const res = await fetch('/api/admin/recovery/rescrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setRescrapeError(json.error || `Rescrape failed (${res.status})`)
        return
      }
      const n = jobIds.length
      setRescrapeStatus(`Rescrape requested for ${n} job${n === 1 ? '' : 's'}. Results will appear once the scrape completes.`)
      await loadScrapeFailures()
    } catch (e: any) {
      setRescrapeError(e?.message || 'Rescrape failed')
    } finally {
      setRescraping(false)
    }
  }

  const toggleSelect = (jobId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(items.map((it) => it.jobId)))
  const clearSel  = () => setSelected(new Set())

  const run = async (jobIds: string[]) => {
    setRunning(true)
    setRunError(null)
    setResults(null)
    try {
      const res = await fetch('/api/admin/recovery/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds, sinceHours: hours, dryRun }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setRunError(json.error || `Run failed (${res.status})`)
        return
      }
      setResults(json.results || [])
      await loadList()
      await loadHistory()
    } catch (e: any) {
      setRunError(e?.message || 'Run failed')
    } finally {
      setRunning(false)
    }
  }

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.replace('/admin/login')
  }

  const actionColor = (a: string) => {
    if (a === 're_parsed' || a === 'transient_retried' || a === 're_scraped') return 'text-emerald-300'
    if (a === 'field_dropped' || a === 're_scraped_with_warning') return 'text-amber-300'
    if (a === 'quarantined' || a === 'unhandled' || a === 'rescrape_parse_failed') return 'text-red-300'
    return 'text-zinc-300'
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-3 sm:p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold">Admin · Push recovery</h1>
            <p className="text-xs text-zinc-500 mt-1">
              Replay unresolved Salesforce push errors. The automation already retries every 10 min; use this page for manual catch-up or when you need fuller control over the window.
            </p>
          </div>
          <button
            onClick={logout}
            className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded px-2.5 py-1 shrink-0"
          >
            Sign out
          </button>
        </div>

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
            onClick={loadList}
            disabled={loading}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 rounded-md px-2.5 py-1"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <div className="flex-1" />
          <label className="text-xs text-zinc-400 inline-flex items-center gap-1.5">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Dry run (classify, do not push)
          </label>
          <button
            onClick={() => run(Array.from(selected))}
            disabled={running || selected.size === 0}
            className="text-xs bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-md px-3 py-1 font-medium"
          >
            Re-push selected ({selected.size})
          </button>
          <button
            onClick={() => run([])}
            disabled={running || items.length === 0}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 rounded-md px-3 py-1"
          >
            Re-push all in window
          </button>
        </div>

        {/* Stuck-creation — jobs whose SF Job__c never got created (no follow-up `job_created_in_salesforce`) */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between px-3 sm:px-4 py-2 border-b border-zinc-800 gap-3">
            <div className="min-w-0">
              <div className="text-xs text-zinc-300 font-medium">
                Stuck job creation
                <span className="ml-2 text-[10px] text-zinc-500 uppercase tracking-wider">job_create_failed / worksite_create_failed</span>
              </div>
              <div className="text-[11px] text-zinc-500">
                {scrapeFailures.length} job{scrapeFailures.length === 1 ? '' : 's'} received an email but never produced a Salesforce Job__c record. Common reasons: empty practice (login wall / page change), worksite creation rejected.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <input
                value={rescrapeJobIdInput}
                onChange={(e) => setRescrapeJobIdInput(e.target.value)}
                placeholder="job_id"
                className="bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1 text-xs flex-1 min-w-0 md:flex-initial md:w-32 placeholder:text-zinc-600"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && rescrapeJobIdInput.trim()) {
                    void rescrape([rescrapeJobIdInput.trim()])
                    setRescrapeJobIdInput('')
                  }
                }}
              />
              <button
                onClick={() => {
                  const v = rescrapeJobIdInput.trim()
                  if (v) {
                    void rescrape([v])
                    setRescrapeJobIdInput('')
                  }
                }}
                disabled={!rescrapeJobIdInput.trim() || rescraping}
                className="text-xs bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 rounded-md px-2.5 py-1 whitespace-nowrap"
              >
                Rescrape job
              </button>
              <button
                onClick={loadScrapeFailures}
                disabled={scrapeFailuresLoading}
                className="text-xs text-zinc-500 hover:text-zinc-300 disabled:text-zinc-700"
              >
                {scrapeFailuresLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
          </div>

          {scrapeFailuresError && (
            <p className="px-4 py-2 text-xs text-red-400 border-b border-zinc-800">{scrapeFailuresError}</p>
          )}
          {rescrapeError && (
            <p className="px-4 py-2 text-xs text-red-400 border-b border-zinc-800">{rescrapeError}</p>
          )}
          {rescrapeStatus && (
            <p className="px-4 py-2 text-xs text-emerald-300 border-b border-zinc-800">{rescrapeStatus}</p>
          )}

          {scrapeFailures.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-zinc-600">
              {scrapeFailuresLoading ? 'Loading…' : 'No stuck job creations in this window.'}
            </p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-zinc-500 text-[11px] uppercase tracking-wider">
                  <th className="text-left py-2 px-3">Job</th>
                  <th className="text-left py-2 px-3">When</th>
                  <th className="text-left py-2 px-3">Event</th>
                  <th className="text-left py-2 px-3">Reason</th>
                  <th className="text-left py-2 px-3">Kimedics</th>
                  <th className="text-right py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {scrapeFailures.map((it) => (
                  <tr key={`${it.jobId}-${it.createdAt}`} className="border-t border-zinc-800 hover:bg-zinc-900/40">
                    <td className="py-2 px-3 font-mono text-zinc-200 whitespace-nowrap">
                      {it.jobId}
                      {it.runId != null && (
                        <span className="block text-[10px] text-zinc-600">run #{it.runId}</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-zinc-400 text-xs whitespace-nowrap">{fmt(it.createdAt)}</td>
                    <td className="py-2 px-3 text-zinc-400 text-xs">{it.eventType}</td>
                    <td className="py-2 px-3 text-zinc-400 text-xs">
                      <span className="line-clamp-2">
                        {it.reason || it.detail || it.errorMessage || '—'}
                        {it.practiceValue ? <span className="text-zinc-600"> · practice: {it.practiceValue}</span> : null}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs">
                      {it.kimedicsLink ? (
                        <a
                          href={it.kimedicsLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 underline"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={() => rescrape([it.jobId])}
                        disabled={rescraping}
                        className="text-[11px] bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-md px-2.5 py-1 font-medium"
                      >
                        Rescrape
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>

        {listError && <p className="text-sm text-red-400">{listError}</p>}

        <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
            <div className="text-xs text-zinc-400">
              {items.length} unresolved error{items.length === 1 ? '' : 's'} in window
            </div>
            <div className="text-xs text-zinc-500 space-x-3">
              <button onClick={selectAll} disabled={!items.length} className="hover:text-zinc-200">Select all</button>
              <button onClick={clearSel} disabled={!selected.size} className="hover:text-zinc-200">Clear</button>
            </div>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-zinc-500 text-[11px] uppercase tracking-wider">
                <th className="w-8 py-2 px-3"></th>
                <th className="text-left py-2 px-3">Job</th>
                <th className="text-left py-2 px-3">When</th>
                <th className="text-left py-2 px-3">Event</th>
                <th className="text-left py-2 px-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading && (
                <tr><td colSpan={5} className="py-6 text-center text-zinc-600">No unresolved errors in this window.</td></tr>
              )}
              {items.map((it) => {
                const isOpen = expanded.has(it.id)
                return (
                  <Fragment key={it.id}>
                    <tr className="border-t border-zinc-800 hover:bg-zinc-900/40">
                      <td className="py-2 px-3">
                        <input
                          type="checkbox"
                          checked={selected.has(it.jobId)}
                          onChange={() => toggleSelect(it.jobId)}
                        />
                      </td>
                      <td className="py-2 px-3 font-mono text-zinc-200">{it.jobId}</td>
                      <td className="py-2 px-3 text-zinc-400">{fmt(it.createdAt)}</td>
                      <td className="py-2 px-3 text-zinc-400">{it.eventType}</td>
                      <td className="py-2 px-3 text-zinc-300">
                        <button
                          className="text-left text-zinc-300 hover:text-white"
                          onClick={() =>
                            setExpanded((prev) => {
                              const n = new Set(prev)
                              if (n.has(it.id)) n.delete(it.id)
                              else n.add(it.id)
                              return n
                            })
                          }
                        >
                          <span className="line-clamp-2">{it.error || '(no error text)'}</span>
                          <span className="text-[10px] text-zinc-600 ml-1">
                            {isOpen ? '(hide attempt)' : '(show attempt)'}
                          </span>
                        </button>
                      </td>
                    </tr>
                    {isOpen && it.attempt && (
                      <tr className="bg-zinc-950/60">
                        <td></td>
                        <td colSpan={4} className="py-2 px-3">
                          <pre className="text-[11px] text-zinc-400 overflow-auto max-h-48 whitespace-pre-wrap break-words">
                            {JSON.stringify(it.attempt, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table></div>
        </div>

        {runError && <p className="text-sm text-red-400">{runError}</p>}

        {results && (
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg">
            <div className="px-4 py-2 border-b border-zinc-800 text-xs text-zinc-400">
              Recovery results ({results.length})
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

        <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg">
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
            <div className="text-xs text-zinc-400">
              Manual push log ({history.length}{history.length >= 100 ? '+' : ''})
            </div>
            <button
              onClick={loadHistory}
              disabled={historyLoading}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 disabled:text-zinc-700"
            >
              {historyLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {history.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-zinc-600">
              No manual pushes yet. Re-runs via the admin UI or the CLI will show here, most recent first.
            </p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
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
                        : (h.invocation || '—')
                  return (
                    <tr key={h.id} className="border-t border-zinc-800">
                      <td className="py-2 px-3 text-zinc-400 text-xs whitespace-nowrap">{fmt(h.createdAt)}</td>
                      <td className="py-2 px-3 font-mono text-zinc-200">{h.jobId}</td>
                      <td className="py-2 px-3 text-zinc-400 text-xs">
                        {h.eventType === 'sf_scrape_fields_recovered' && <span className="text-emerald-300">recovered</span>}
                        {h.eventType === 'manual_rescrape_completed' && <span className="text-sky-300">rescraped</span>}
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
          )}
        </div>
      </div>
    </div>
  )
}
