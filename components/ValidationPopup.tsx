'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface ValidationJobDetail {
  id: string
  jobId?: string
  jobPostId?: string | null
  runId?: number | null
  emailScrapeId?: number | null
  emailSubject?: string | null
  emailActionOrChange?: string | null
  emailCreatedAt?: string | null
  kimedicsLink: string
  sfJobId: string | null
  status: 'success' | 'failed' | 'partial'
  fieldsUpdated: string[]
  kimedicsData: Record<string, any>
  salesforceData: Record<string, any>
  eventsThisRun?: Array<{
    id?: number
    runId?: number
    eventType: string
    payload?: any
    createdAt: string
  }>

  // Family A + B: Salesforce Mapping
  mappingResolution?: {
    eventId?: number
    runId?: number
    createdAt?: string
    source: string
    detail: string
    status: string
    fieldsChanged: string[]
    prev: Record<string, any>
    next: Record<string, any>
    updatedRows: Record<string, number>
  }
  mappingIssues?: Array<{
    type: string
    message: string
    details: any
  }>

  // Family C: Salesforce Field Updates
  salesforceFieldPatches?: Array<{
    eventId?: number
    runId?: number
    createdAt?: string
    sfJobId: string
    fieldsChanged: string[]
    prev: Record<string, any>
    next: Record<string, any>
  }>
  salesforceIssues?: Array<{
    type: string
    message: string
    count: number
    details: any
  }>

  // Raw events for debugging
  mappingEvents?: any[]
  salesforceFieldEvents?: any[]
  eventsHistory?: any[]

  // Legacy
  errors: string[]
  createdAt: string
}

interface ValidationPopupProps {
  runId: number
  isOpen: boolean
  onClose: () => void
  jobId?: string
}

function StatusBadge({ status }: { status: 'success' | 'failed' | 'partial' }) {
  const styles = {
    success: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    failed: 'text-red-400 bg-red-500/10 border-red-500/20',
    partial: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  }

  const icons = {
    success: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
    failed: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    ),
    partial: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  }

  const labels = {
    success: 'Success',
    failed: 'Failed',
    partial: 'Partial',
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium', styles[status])}>
      {icons[status]}
      {labels[status]}
    </span>
  )
}

function formatTime(ts: string) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type TimelineKind = 'mapping' | 'sf' | 'skip' | 'error' | 'info' | 'new'

type TimelineItem = {
  key: string
  ts: string
  kind: TimelineKind
  title: string
  subtitle: string
  event?: any
  fields?: string[]
}

function kindStyles(kind: TimelineKind) {
  switch (kind) {
    case 'new':
      return { dot: 'bg-violet-400', border: 'border-violet-500/20', bg: 'bg-violet-500/10', text: 'text-violet-300' }
    case 'mapping':
      return { dot: 'bg-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/10', text: 'text-emerald-300' }
    case 'sf':
      return { dot: 'bg-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/10', text: 'text-emerald-300' }
    case 'skip':
      return { dot: 'bg-blue-400', border: 'border-blue-500/20', bg: 'bg-blue-500/10', text: 'text-blue-300' }
    case 'error':
      return { dot: 'bg-red-400', border: 'border-red-500/20', bg: 'bg-red-500/10', text: 'text-red-300' }
    default:
      return { dot: 'bg-zinc-500', border: 'border-zinc-700/40', bg: 'bg-zinc-800/30', text: 'text-zinc-300' }
  }
}

function fmtVal(v: any) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function buildTimeline(job: ValidationJobDetail): TimelineItem[] {
  const practice = job.kimedicsData?.practice || job.kimedicsData?.practice_value
  const evs = job.eventsThisRun ?? []

  const subj = (job.emailSubject ?? '').toLowerCase()
  const aoc = (job.emailActionOrChange ?? '').toLowerCase()
  const isNewJobPost = aoc === 'new' || subj.includes('new job post')

  // If a job had no SF updates for this run, we still want an explicit "skipped"
  // entry so the timeline stays informative/scannable.
  const hasAnySfEvent = evs.some(e =>
    e.eventType === 'sf_scrape_fields_patched' ||
    e.eventType === 'sf_scrape_fields_error' ||
    e.eventType === 'sf_scrape_fields_skip' ||
    e.eventType === 'sf_sync_skipped_no_mapping'
  )
  const hasAnyMappingEvent = evs.some(e =>
    e.eventType === 'sf_ids_update' ||
    e.eventType.startsWith('mapping_') ||
    e.eventType.startsWith('sf_mapping_')
  )

  const items: TimelineItem[] = evs.map((e) => {
    const type = e.eventType
    const ts = e.createdAt

    // Mapping family
    if (type === 'sf_ids_update') {
      const fields = (e.payload?.fields_changed ?? []).filter((f: string) => f !== 'sf_worksite_account_id')
      const status = e.payload?.mapping_status
      return {
        key: `ev_${e.id ?? ts}_${type}`,
        ts,
        kind: 'mapping' as const,
        title: 'Mapping',
        subtitle: [practice ? `Practice: ${practice}` : null, status ? String(status) : null].filter(Boolean).join(' · '),
        event: e,
        fields,
      }
    }
    if (type.startsWith('mapping_') || type.startsWith('sf_mapping_')) {
      const msg = e.payload?.error || e.payload?.reason || e.payload?.message || type
      const isErr = type === 'sf_mapping_pull_failed'
      const kind: TimelineKind = isErr ? 'error' : (type === 'sf_mapping_skipped' ? 'skip' : 'info')
      return {
        key: `ev_${e.id ?? ts}_${type}`,
        ts,
        kind,
        title: type.replaceAll('_', ' '),
        subtitle: String(msg),
        event: e,
      }
    }

    // Salesforce field update family
    if (type === 'sf_scrape_fields_patched') {
      const sfJobId = e.payload?.sf_job_id
      const fields = e.payload?.fields_changed ?? []
      return {
        key: `ev_${e.id ?? ts}_${type}`,
        ts,
        kind: 'sf' as const,
        title: 'Salesforce update',
        subtitle: `${sfJobId ? `Record ${sfJobId}` : 'Record'} · ${fields.slice(0, 3).join(', ')}${fields.length > 3 ? ` +${fields.length - 3} more` : ''}`,
        event: e,
      }
    }
    if (type === 'sf_scrape_fields_error') {
      const msg = e.payload?.error || e.payload?.detail || e.payload?.message || 'Salesforce update failed'
      return {
        key: `ev_${e.id ?? ts}_${type}`,
        ts,
        kind: 'error' as const,
        title: 'Salesforce update error',
        subtitle: String(msg),
        event: e,
      }
    }
    if (type === 'sf_scrape_fields_skip' || type === 'sf_sync_skipped_no_mapping') {
      const msg = e.payload?.reason || e.payload?.message || type
      return {
        key: `ev_${e.id ?? ts}_${type}`,
        ts,
        kind: 'skip' as const,
        title: 'Skipped',
        subtitle: String(msg),
        event: e,
      }
    }

    return {
      key: `ev_${e.id ?? ts}_${type}`,
      ts,
      kind: 'info' as const,
      title: type.replaceAll('_', ' '),
      subtitle: '',
      event: e,
    }
  })

  // Every run originates from an email scrape; always show email context first.
  items.unshift({
    key: `synthetic_email_${job.id}`,
    ts: job.emailCreatedAt ?? job.createdAt,
    kind: isNewJobPost ? 'new' : 'info',
    title: 'Email',
    subtitle: `Subject: ${job.emailSubject ?? '—'}`,
    event: { eventType: 'synthetic_email_context', createdAt: job.emailCreatedAt ?? job.createdAt },
  })

  if (evs.length > 0) {
    if (!hasAnyMappingEvent) {
      items.unshift({
        key: `synthetic_mapping_${job.id}`,
        ts: job.createdAt,
        kind: 'skip' as const,
        title: 'Mapping',
        subtitle: 'Skipped (no mapping events logged)',
        event: { eventType: 'synthetic_mapping_skip', createdAt: job.createdAt },
      })
    }
    if (!hasAnySfEvent) {
      items.push({
        key: `synthetic_sf_${job.id}`,
        ts: job.createdAt,
        kind: 'skip' as const,
        title: 'Salesforce update',
        subtitle: 'Skipped (no field updates)',
        event: { eventType: 'synthetic_sf_skip', createdAt: job.createdAt },
      })
    }
  }

  // Newest first (descending)
  items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
  return items
}

function Timeline({ job }: { job: ValidationJobDetail }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const items = buildTimeline(job)

  if (items.length === 0) {
    return (
      <div className="text-xs text-zinc-500">
        No event timeline recorded for this run.
      </div>
    )
  }

  const toggle = (key: string) => {
    const next = new Set(open)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setOpen(next)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-400">Timeline</p>
        <span className="text-[10px] text-zinc-600">{/* intentionally blank */}</span>
      </div>

      <div className="relative pl-6">
        {/* Vertical rail (lives in the left gutter, behind markers) */}
        <div className="absolute left-[8px] top-1 bottom-1 w-px bg-zinc-700/60" />
        <div className="space-y-2">
          {items.map((it) => {
            const isOpen = open.has(it.key)
            const s = kindStyles(it.kind)
            return (
              <div key={it.key} className="relative">
                {/* Marker: outer shell masks the vertical line, inner dot conveys status */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-zinc-950 border border-zinc-700/60 flex items-center justify-center">
                  <div className={cn('h-2.5 w-2.5 rounded-full', s.dot)} />
                </div>
                {/* Card is offset so marker never touches its outline */}
                <div className={cn('border rounded-lg ml-6', s.border, 'bg-zinc-900/40')}>
                  <button
                    onClick={() => toggle(it.key)}
                    className="w-full text-left px-3 py-2.5 flex items-start justify-between gap-3 hover:bg-zinc-800/30 transition-colors rounded-lg"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-[11px] font-semibold', s.text)}>{it.title}</span>
                        <span className="text-[10px] text-zinc-600 font-mono">
                          {it.event?.id != null ? `#${it.event.id}` : null}
                        </span>
                      </div>
                      {it.subtitle ? (
                        <div className="text-xs text-zinc-400 mt-0.5 break-words">{it.subtitle}</div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] text-zinc-500 tabular-nums">{formatTime(it.ts)}</div>
                      <div className="text-[10px] text-zinc-600 mt-0.5">{isOpen ? '—' : ''}</div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className={cn('px-3 pb-3 pt-0.5 border-t', s.border)}>
                      {/* Single-expand details (no nested expanders) */}
                      {it.event?.eventType === 'sf_ids_update' && (
                        <div className={cn('mt-2 rounded-lg p-3', s.bg)}>
                          <div className="text-xs text-zinc-300">
                            <span className="text-zinc-500">Source:</span>{' '}
                            <span className="font-mono text-emerald-200">{it.event?.payload?.source ?? '—'}</span>
                            {it.event?.payload?.mapping_detail ? (
                              <span className="text-zinc-600"> · {String(it.event.payload.mapping_detail)}</span>
                            ) : null}
                          </div>

                          {Array.isArray(it.event?.payload?.fields_changed) && it.event.payload.fields_changed.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {it.event.payload.fields_changed
                                .filter((f: string) => f !== 'sf_worksite_account_id')
                                .map((field: string) => (
                                  <div key={field} className="bg-emerald-500/5 border border-emerald-500/10 rounded p-2">
                                    <div className="text-[10px] font-semibold text-emerald-400 mb-1">{field}</div>
                                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                                      <div>
                                        <span className="text-zinc-500">Before: </span>
                                        <span className="font-mono text-zinc-300">{fmtVal(it.event?.payload?.prev?.[field])}</span>
                                      </div>
                                      <div>
                                        <span className="text-zinc-500">After: </span>
                                        <span className="font-mono text-emerald-200">{fmtVal(it.event?.payload?.next?.[field])}</span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      )}

                      {it.event?.eventType === 'sf_scrape_fields_patched' && (
                        <div className={cn('mt-2 rounded-lg p-3', s.bg)}>
                          <div className="text-xs text-zinc-300">
                            <span className="text-zinc-500">Record:</span>{' '}
                            <span className="font-mono text-emerald-200">{it.event?.payload?.sf_job_id ?? '—'}</span>
                          </div>

                          {Array.isArray(it.event?.payload?.fields_changed) && it.event.payload.fields_changed.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {it.event.payload.fields_changed.map((field: string) => (
                                <div key={field} className="bg-emerald-500/5 border border-emerald-500/10 rounded p-2">
                                  <div className="text-[10px] font-semibold text-emerald-400 mb-1">{field}</div>
                                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    <div>
                                      <span className="text-zinc-500">Before: </span>
                                      <span className="font-mono text-zinc-300">{fmtVal(it.event?.payload?.prev?.[field])}</span>
                                    </div>
                                    <div>
                                      <span className="text-zinc-500">After: </span>
                                      <span className="font-mono text-emerald-200">{fmtVal(it.event?.payload?.next?.[field])}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Fallback: show raw payload in a subtle way */}
                      {it.event?.eventType !== 'sf_ids_update' &&
                        it.event?.eventType !== 'sf_scrape_fields_patched' &&
                        !String(it.event?.eventType || '').startsWith('synthetic_') && (
                          <div className="mt-2 text-[11px] text-zinc-500">
                            <span className="font-mono">event_type</span>={it.event?.eventType}
                            {it.event?.runId != null ? <span className="font-mono"> · run_id={it.event.runId}</span> : null}
                          </div>
                        )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SalesforceMappingSection({ job }: { job: ValidationJobDetail }) {
  const hasMappingResolution = job.mappingResolution
  const hasMappingIssues = job.mappingIssues && job.mappingIssues.length > 0

  if (!hasMappingResolution && !hasMappingIssues) return null

  const practice = job.kimedicsData?.practice || job.kimedicsData?.practice_value
  const changedFields = (job.mappingResolution?.fieldsChanged ?? []).filter(
    (f) => f !== 'sf_worksite_account_id'
  )
  const isSimpleOneToOne =
    !!job.mappingResolution &&
    !hasMappingIssues &&
    changedFields.length > 0 &&
    (job.mappingResolution.status || '').toLowerCase().includes('mapped')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-400">Salesforce Mapping</p>
        <span className="text-[10px] text-zinc-600">Family A + B</span>
      </div>

      {/* Successful Mapping Resolution */}
      {hasMappingResolution && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span className="text-emerald-400 text-xs font-semibold">Mapping Resolved</span>
            <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300">
              {job.mappingResolution?.status}
            </span>
          </div>

          {/* Compact for 1:1 mappings */}
          {isSimpleOneToOne ? (
            <div className="text-xs text-zinc-300">
              <span className="text-zinc-500">Practice:</span>{' '}
              <span className="text-emerald-200 font-medium">{practice || '—'}</span>
              <span className="text-zinc-600"> · </span>
              <span className="text-zinc-500">Source:</span>{' '}
              <span className="text-emerald-300 font-mono">{job.mappingResolution?.source}</span>
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">Practice:</span>
                <span className="text-emerald-200 font-medium">{practice || '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">Source:</span>
                <span className="text-emerald-300 font-mono">{job.mappingResolution?.source}</span>
              </div>
              {job.mappingResolution?.detail && (
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">Detail:</span>
                  <span className="text-emerald-300">{job.mappingResolution?.detail}</span>
                </div>
              )}

              {/* Show ID assignments (omit fixed fields like sf_worksite_account_id) */}
              <div className="grid grid-cols-1 gap-2 mt-3">
                {changedFields.map((field) => (
                  <div key={field} className="bg-emerald-500/5 border border-emerald-500/10 rounded p-2">
                    <div className="text-[10px] font-semibold text-emerald-400 mb-1">{field}</div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-zinc-500">Before: </span>
                        <span className="font-mono text-zinc-400">{job.mappingResolution?.prev?.[field] ?? 'null'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">After: </span>
                        <span className="font-mono text-emerald-300">{job.mappingResolution?.next?.[field] ?? 'null'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mapping Issues */}
      {hasMappingIssues && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <p className="text-red-400 text-xs font-semibold mb-2 flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            Mapping Issues
          </p>
          <div className="space-y-2">
            {job.mappingIssues?.map((issue, i) => (
              <div key={i} className="text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] px-2 py-1 rounded bg-red-500/20 text-red-300">{issue.type}</span>
                </div>
                <p className="text-red-300 leading-relaxed">{issue.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SalesforceFieldUpdatesSection({ job }: { job: ValidationJobDetail }) {
  const [expandedPatches, setExpandedPatches] = useState<Set<number>>(new Set())
  const hasPatches = job.salesforceFieldPatches && job.salesforceFieldPatches.length > 0
  const hasIssues = job.salesforceIssues && job.salesforceIssues.length > 0

  if (!hasPatches && !hasIssues) return null

  const togglePatch = (index: number) => {
    const newExpanded = new Set(expandedPatches)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedPatches(newExpanded)
  }

  const toggleAllPatches = () => {
    if (!job.salesforceFieldPatches) return

    const allIndices = job.salesforceFieldPatches.map((_, i) => i)
    const allExpanded = allIndices.every(i => expandedPatches.has(i))

    if (allExpanded) {
      setExpandedPatches(new Set()) // Collapse all
    } else {
      setExpandedPatches(new Set(allIndices)) // Expand all
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-400">Salesforce Field Updates</p>
        <span className="text-[10px] text-zinc-600">Family C</span>
      </div>

      {/* Successful Field Patches */}
      {hasPatches && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              Fields Successfully Updated
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300">
                {job.salesforceFieldPatches?.length || 0} record{(job.salesforceFieldPatches?.length || 0) !== 1 ? 's' : ''}
              </span>
              {(job.salesforceFieldPatches?.length || 0) > 1 && (
                <button
                  onClick={toggleAllPatches}
                  className="text-[10px] px-2 py-1 rounded border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                >
                  {job.salesforceFieldPatches?.every((_, i) => expandedPatches.has(i)) ? 'Collapse All' : 'Expand All'}
                </button>
              )}
            </div>
          </div>
          {job.salesforceFieldPatches?.map((patch, i) => {
            const isExpanded = expandedPatches.has(i)
            return (
              <div key={i} className="border border-emerald-500/20 rounded-lg mb-2 last:mb-0">
                {/* Collapsible header */}
                <button
                  onClick={() => togglePatch(i)}
                  className="w-full p-3 text-left hover:bg-emerald-500/5 transition-colors flex items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="text-xs text-emerald-400 font-medium mb-1">
                      Record {patch.sfJobId}
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      Updated {patch.fieldsChanged.length} field{patch.fieldsChanged.length !== 1 ? 's' : ''}: {patch.fieldsChanged.slice(0, 3).join(', ')}{patch.fieldsChanged.length > 3 ? ` +${patch.fieldsChanged.length - 3} more` : ''}
                    </div>
                  </div>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn("text-emerald-400 transition-transform", isExpanded ? "rotate-90" : "")}
                  >
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-emerald-500/10">
                    <div className="space-y-2 pt-2">
                      {patch.fieldsChanged.map(field => (
                        <div key={field} className="bg-emerald-500/5 border border-emerald-500/10 rounded p-2">
                          <div className="text-[10px] font-semibold text-emerald-400 mb-1">{field}</div>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <span className="text-zinc-500">Before: </span>
                              <span className="font-mono text-zinc-300">{patch.prev[field] || '—'}</span>
                            </div>
                            <div>
                              <span className="text-zinc-500">After: </span>
                              <span className="font-mono text-emerald-300">{patch.next[field] || '—'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Field Update Issues */}
      {hasIssues && (
        <div className="space-y-2">
          {job.salesforceIssues?.map((issue, i) => {
            const isSkip = issue.type.includes('skip')
            const bgColor = isSkip ? 'bg-blue-500/10 border-blue-500/20' : 'bg-red-500/10 border-red-500/20'
            const textColor = isSkip ? 'text-blue-400' : 'text-red-400'
            const iconColor = isSkip ? 'text-blue-400' : 'text-red-400'

            return (
              <div key={i} className={cn('border rounded-lg p-3', bgColor)}>
                <p className={cn('text-xs font-semibold mb-2 flex items-center gap-1', textColor)}>
                  {isSkip ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  )}
                  {isSkip ? 'Skipped' : 'Error'}
                  {issue.count > 1 && (
                    <span className="text-[10px] px-2 py-1 rounded-full bg-zinc-500/20 text-zinc-300">
                      {issue.count}x
                    </span>
                  )}
                </p>
                <div className="text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn('text-[10px] px-2 py-1 rounded', isSkip ? 'bg-blue-500/20 text-blue-300' : 'bg-red-500/20 text-red-300')}>
                      {issue.type}
                    </span>
                  </div>
                  <p className={cn('leading-relaxed', isSkip ? 'text-blue-300' : 'text-red-300')}>
                    {issue.message}
                  </p>
                  {/* Show affected fields for grouped events */}
                  {issue.details?.fields && issue.details.fields.length > 0 && (
                    <div className="mt-2 text-[11px] text-zinc-500">
                      Fields: {issue.details.fields.join(', ')}
                    </div>
                  )}
                  {/* Show checked fields for skip events (legacy) */}
                  {issue.details?.checked && (
                    <div className="mt-2 text-[11px] text-zinc-500">
                      Checked: {issue.details.checked.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function JobCard({ job }: { job: ValidationJobDetail }) {
  const sfLink = job.sfJobId ? `https://proxi.lightning.force.com/lightning/r/Job__c/${job.sfJobId}/view` : null

  return (
    <div className="border border-zinc-700/40 rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <StatusBadge status={job.status} />
            <span className="text-xs text-zinc-500">JobContent: {job.id}</span>
          </div>
          {/* Subtle debug IDs (kept small for non-technical users) */}
          <div className="text-[10px] text-zinc-600 font-mono">
            {job.jobId ? <span>job_id={job.jobId}</span> : null}
            {job.jobPostId ? <span>{job.jobId ? ' · ' : ''}job_post_id={job.jobPostId}</span> : null}
            {job.runId != null ? <span>{(job.jobId || job.jobPostId) ? ' · ' : ''}run_id={job.runId}</span> : null}
            {job.emailScrapeId != null ? <span>{(job.jobId || job.jobPostId || job.runId != null) ? ' · ' : ''}email_scrape_id={job.emailScrapeId}</span> : null}
          </div>

          <div className="flex items-center gap-4 text-xs">
            <a
              href={job.kimedicsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline flex items-center gap-1"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
              </svg>
              Kimedics
            </a>
            {sfLink && (
              <a
                href={sfLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline flex items-center gap-1"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
                </svg>
                Salesforce
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Default: chronological timeline (details are embedded/expandable) */}
      <Timeline job={job} />
    </div>
  )
}

export default function ValidationPopup({ runId, isOpen, onClose, jobId }: ValidationPopupProps) {
  const [jobs, setJobs] = useState<ValidationJobDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !runId) return

    setLoading(true)
    setError(null)

    const fetchValidationData = async () => {
      try {
        const qs = jobId ? `?jobId=${encodeURIComponent(jobId)}` : ''
        const response = await fetch(`/api/validation/${runId}${qs}`)

        if (!response.ok) {
          throw new Error('Failed to fetch validation data')
        }

        const data = await response.json()
        setJobs(data.jobs || [])
      } catch (err) {
        setError('Failed to load validation data')
      } finally {
        setLoading(false)
      }
    }

    fetchValidationData()
  }, [isOpen, runId])

  if (!isOpen) return null

  const successCount = jobs.filter(j => j.status === 'success').length
  const failedCount = jobs.filter(j => j.status === 'failed').length
  const partialCount = jobs.filter(j => j.status === 'partial').length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="h-full w-full max-w-4xl bg-zinc-900 border-l border-zinc-700/50 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-700/40">
          <div>
            <h2 className="text-lg font-semibold text-white">Validation Details</h2>
            <p className="text-sm text-zinc-400">Run #{runId}</p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stats Summary */}
        <div className="p-6 border-b border-zinc-700/40">
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{jobs.length}</div>
              <div className="text-xs text-zinc-500">Total Jobs</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400">{successCount}</div>
              <div className="text-xs text-zinc-500">Successful</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{failedCount}</div>
              <div className="text-xs text-zinc-500">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-400">{partialCount}</div>
              <div className="text-xs text-zinc-500">Partial</div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="text-zinc-500">Loading validation data...</div>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className="space-y-4">
              {jobs.map(job => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}