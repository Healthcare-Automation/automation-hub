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
  /** Derived from scraped job_content diff — more accurate than email subject for “what changed”. */
  scrapeChangeSummary?: string | null
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

  // Family C: Salesforce Field Updates (includes full field audits when nothing PATCHed)
  salesforceFieldPatches?: Array<{
    eventId?: number
    runId?: number
    createdAt?: string
    sfJobId: string
    fieldsChanged: string[]
    fieldsCompared?: string[]
    prev: Record<string, any>
    next: Record<string, any>
    auditOnly?: boolean
    skipReason?: string
  }>
  salesforceIssues?: Array<{
    type: string
    message: string
    count: number
    details: any
  }>

  /** Set when automation POSTed a new Job__c (event ``job_created_in_salesforce``). */
  salesforceJobCreated?: {
    eventId?: number
    runId?: number | null
    createdAt: string
    sfJobId: string | null
    sfWorksiteAccountId: string | null
    automationKind: string | null
    summary: string | null
  } | null

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

/** Job__c layout (Overview → dates/schedule → insight → …); description last. Unknown __c fields sort before description. */
const SF_VALIDATION_FIELD_ORDER: string[] = [
  'Name',
  'Job_Account__c',
  'Job_Worksite_Location_1__c',
  'Job_Worksite_1_Address__c',
  'Job_Point_of_Contact__c',
  'External_Job_ID__c',
  'External_Job_Link__c',
  'test_status__c',
  'test_posted_date__c',
  'Job_Status__c',
  'Position_Type_DJC__c',
  'Specialty_DJC__c',
  'Occupation_DJC__c',
  'Job_City__c',
  'Job_State__c',
  'Job_Ranking__c',
  'Job_Facility_Display__c',
  'Job_Client_Job_Id__c',
  'Worksite_Parent__c',
  'Job_Patient_Ages__c',
  'Job_Volume__c',
  'Job_Recruitment_Level__c',
  'Salary_Pay_Range__c',
  'Job_Dates_Needed__c',
  'Job_Standard_Schedule__c',
  'Standard_Schedule_Hours__c',
  'Job_Provider_Start_Date__c',
  'Job_Provider_End_Date__c',
  'Insight__c',
  'Job_Types_of_Cases__c',
  'Job_Support_Staff__c',
]

const SF_DESC_FIELD = 'Job_Client_Job_Description__c'

function sortSfValidationFields(fields: string[]): string[] {
  const known = new Map(SF_VALIDATION_FIELD_ORDER.map((f, i) => [f, i]))
  const maxKnown = SF_VALIDATION_FIELD_ORDER.length
  const rank = (f: string) => {
    if (f === SF_DESC_FIELD) return maxKnown + 2
    const i = known.get(f)
    if (i !== undefined) return i
    return maxKnown + 1
  }
  return [...fields].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    return a.localeCompare(b)
  })
}

/** All fields evaluated for a sync (preferred); legacy events only have fields_changed. */
function sfSyncDisplayedFields(payload: Record<string, any> | undefined): string[] {
  if (!payload) return []
  const fc = payload.fields_compared
  if (Array.isArray(fc) && fc.length > 0) return sortSfValidationFields(fc)
  return sortSfValidationFields(payload.fields_changed ?? [])
}

function sfValuesMatchDisplay(a: unknown, b: unknown): boolean {
  const sa = fmtVal(a)
  const sb = fmtVal(b)
  return sa === sb
}

/**
 * Fallback when the hub still finds no SF field-sync rows after widening run_id matching.
 * Usually means the sync step did not run, logging failed, or data predates logging.
 */
function explainMissingSfFieldSyncEvents(job: ValidationJobDetail): string {
  const hasSfId = !!(job.sfJobId && String(job.sfJobId).trim())
  const hasMappingIssues = (job.mappingIssues?.length ?? 0) > 0

  if (hasMappingIssues) {
    return (
      'Still no Salesforce field-sync log lines for this job and run anchor. Mapping issues are present — resolve mapping, then re-run the pipeline.'
    )
  }
  if (!hasSfId) {
    return (
      'Still no Salesforce field-sync log lines. This row has no sf_job_id; the sync step logs a skip when it runs — if nothing appears, sync may not have run for this batch or logging failed.'
    )
  }
  return (
    'Still no Salesforce field-sync log lines despite a stored sf_job_id. Check Modal logs for this link_batch run, or whether this job_content row predates sf_field sync logging.'
  )
}

/** Milliseconds for timeline ordering; NaN → 0 */
function timelinePrimaryMs(ts: string): number {
  const x = new Date(ts).getTime()
  return Number.isNaN(x) ? 0 : x
}

/**
 * When timestamps tie, higher rank sorts first in "newest first" view = later pipeline stage on top.
 * Order: email → Supabase snapshot → mapping → Salesforce field sync (last step wins ties).
 */
function pipelineTieRank(item: TimelineItem): number {
  const t = item.event?.eventType ?? ''
  if (t === 'synthetic_email_context') return 0
  if (t === 'synthetic_mapping_skip') return 100
  if (t === 'sf_worksite_missing_on_job_row') return 350
  if (t === 'job_current_sf_ids_changed' || t === 'job_current_upsert') return 400
  if (t === 'sf_ids_update' || t.startsWith('mapping_') || t.startsWith('sf_mapping_')) return 500
  if (t === 'job_created_in_salesforce') return 550
  if (t.startsWith('sf_scrape_fields_') || t === 'sf_sync_skipped_no_mapping') return 800
  if (t === 'synthetic_sf_skip') return 900
  return 200
}

function maxTimelineMs(list: TimelineItem[]): number {
  let m = 0
  for (const it of list) {
    const x = timelinePrimaryMs(it.ts)
    if (x > m) m = x
  }
  return m
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
    e.eventType === 'sf_sync_skipped_no_mapping' ||
    e.eventType === 'job_created_in_salesforce'
  )
  const hasAnyMappingEvent = evs.some(e =>
    e.eventType === 'sf_ids_update' ||
    e.eventType.startsWith('mapping_') ||
    e.eventType.startsWith('sf_mapping_') ||
    e.eventType === 'job_created_in_salesforce'
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

    if (type === 'job_created_in_salesforce') {
      const sid = e.payload?.sf_job_id ? String(e.payload.sf_job_id) : '—'
      const wid = e.payload?.sf_worksite_account_id ? String(e.payload.sf_worksite_account_id) : ''
      const sum = e.payload?.summary ? String(e.payload.summary) : 'New Salesforce job record created via API (unmapped Kimedics job).'
      return {
        key: `ev_${e.id ?? ts}_${type}`,
        ts,
        kind: 'new' as const,
        title: 'New job created in Salesforce',
        subtitle: [sum, `Record ${sid}`, wid ? `Worksite Account ${wid}` : null].filter(Boolean).join(' · '),
        event: e,
      }
    }

    // Salesforce field update family
    if (type === 'sf_scrape_fields_patched') {
      const sfJobId = e.payload?.sf_job_id
      const fields = sfSyncDisplayedFields(e.payload)
      const nUpdated = Array.isArray(e.payload?.fields_changed) ? e.payload.fields_changed.length : 0
      const sub =
        fields.length > 0
          ? `${sfJobId ? `Record ${sfJobId}` : 'Record'} · ${nUpdated} field${nUpdated !== 1 ? 's' : ''} updated in Salesforce · ${fields.length} compared · ${fields.slice(0, 2).join(', ')}${fields.length > 2 ? ` +${fields.length - 2} more` : ''}`
          : `${sfJobId ? `Record ${sfJobId}` : 'Record'}`
      return {
        key: `ev_${e.id ?? ts}_${type}`,
        ts,
        kind: 'sf' as const,
        title: 'Salesforce field update',
        subtitle: sub,
        event: e,
      }
    }
    if (type === 'sf_scrape_fields_error') {
      const msg = e.payload?.error || e.payload?.detail || e.payload?.message || 'Salesforce update failed'
      return {
        key: `ev_${e.id ?? ts}_${type}`,
        ts,
        kind: 'error' as const,
        title: 'Salesforce field update error',
        subtitle: String(msg),
        event: e,
      }
    }
    if (type === 'sf_scrape_fields_skip' || type === 'sf_sync_skipped_no_mapping') {
      const reason = e.payload?.reason || e.payload?.message || type
      const detail = e.payload?.detail ? String(e.payload.detail) : ''
      const jid = e.payload?.job_id ? `job_id ${e.payload.job_id}` : ''
      const fields = sfSyncDisplayedFields(e.payload)
      const parts: string[] = []
      if (type === 'sf_sync_skipped_no_mapping') {
        parts.push(detail || String(reason))
        if (jid) parts.push(jid)
      } else if (fields.length > 0) {
        parts.push(
          `${String(reason)} · ${fields.length} field${fields.length !== 1 ? 's' : ''} compared (already matched Salesforce — no write)`,
        )
      } else {
        parts.push(detail ? `${String(reason)} — ${detail}` : String(reason))
      }
      const sub = parts.filter(Boolean).join(' · ')
      return {
        key: `ev_${e.id ?? ts}_${type}`,
        ts,
        kind: 'skip' as const,
        title:
          type === 'sf_sync_skipped_no_mapping'
            ? 'Salesforce field sync skipped'
            : fields.length > 0
              ? 'Salesforce — no write needed'
              : 'Salesforce skipped',
        subtitle: sub,
        event: e,
      }
    }

    if (type === 'job_current_sf_ids_changed' || type === 'job_current_upsert') {
      const saved = e.payload?.saved_as
      const label =
        saved === 'inserted_new_latest_row'
          ? 'New latest job row saved'
          : saved === 'updated_existing_latest_row'
            ? 'Existing latest job row updated'
          : type === 'job_current_upsert'
            ? 'Latest job row saved (legacy event)'
            : 'Latest job row — Salesforce Id fields changed'
      const fc = (e.payload?.fields_changed ?? []).join(', ')
      return {
        key: `ev_${e.id ?? ts}_${type}`,
        ts,
        kind: 'mapping' as const,
        title: 'Supabase latest job snapshot',
        subtitle: [label, fc ? `Ids: ${fc}` : null].filter(Boolean).join(' · '),
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
  const emailSubLines = [
    `Subject: ${job.emailSubject ?? '—'}`,
    job.scrapeChangeSummary
      ? `Scrape summary: ${job.scrapeChangeSummary}`
      : null,
  ].filter(Boolean)
  items.unshift({
    key: `synthetic_email_${job.id}`,
    ts: job.emailCreatedAt ?? job.createdAt,
    kind: isNewJobPost ? 'new' : 'info',
    title: 'Email',
    subtitle: emailSubLines.join('\n'),
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
      const anchor = maxTimelineMs(items)
      const sfTs =
        anchor > 0
          ? new Date(anchor + 2500).toISOString()
          : job.createdAt
      items.push({
        key: `synthetic_sf_${job.id}`,
        ts: sfTs,
        kind: 'skip' as const,
        title: 'Salesforce field sync',
        subtitle: explainMissingSfFieldSyncEvents(job),
        event: { eventType: 'synthetic_sf_skip', createdAt: sfTs },
      })
    }
  }

  // Newest first; same-time events ordered by pipeline stage (Salesforce field sync last)
  items.sort((a, b) => {
    const ta = timelinePrimaryMs(a.ts)
    const tb = timelinePrimaryMs(b.ts)
    if (tb !== ta) return tb - ta
    return pipelineTieRank(b) - pipelineTieRank(a)
  })
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
                        <div className="text-xs text-zinc-400 mt-0.5 break-words whitespace-pre-line">
                          {it.subtitle}
                        </div>
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
                              {sortSfValidationFields(
                                it.event.payload.fields_changed.filter((f: string) => f !== 'sf_worksite_account_id'),
                              ).map((field: string) => (
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
                          {(() => {
                            const p = it.event?.payload || {}
                            const list = sfSyncDisplayedFields(p)
                            const patched = new Set<string>(Array.isArray(p.fields_changed) ? p.fields_changed : [])
                            if (list.length === 0) return null
                            return (
                              <div className="mt-3 space-y-2">
                                {list.map((field: string) => {
                                  const didPatch = patched.has(field)
                                  const matched = sfValuesMatchDisplay(p.prev?.[field], p.next?.[field])
                                  return (
                                    <div
                                      key={field}
                                      className={cn(
                                        'rounded p-2 border',
                                        didPatch
                                          ? 'bg-emerald-500/5 border-emerald-500/10'
                                          : 'bg-zinc-800/40 border-zinc-700/40',
                                      )}
                                    >
                                      <div className="flex items-center justify-between gap-2 mb-1">
                                        <div className="text-[10px] font-semibold text-emerald-400">{field}</div>
                                        <span
                                          className={cn(
                                            'text-[9px] px-1.5 py-0.5 rounded shrink-0',
                                            didPatch
                                              ? 'bg-emerald-500/20 text-emerald-300'
                                              : matched
                                                ? 'bg-zinc-700/60 text-zinc-400'
                                                : 'bg-amber-500/15 text-amber-300',
                                          )}
                                        >
                                          {didPatch ? 'updated in SF' : matched ? 'unchanged' : 'review'}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                                        <div>
                                          <span className="text-zinc-500">Before: </span>
                                          <span className="font-mono text-zinc-300">{fmtVal(p.prev?.[field])}</span>
                                        </div>
                                        <div>
                                          <span className="text-zinc-500">After: </span>
                                          <span className="font-mono text-emerald-200">{fmtVal(p.next?.[field])}</span>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })()}
                        </div>
                      )}

                      {it.event?.eventType === 'sf_scrape_fields_skip' &&
                        Array.isArray(it.event.payload?.fields_compared) &&
                        it.event.payload.fields_compared.length > 0 && (
                          <div className="mt-2 rounded-lg p-3 bg-blue-500/5 border border-blue-500/15">
                            <div className="text-xs text-zinc-300">
                              <span className="text-zinc-500">Record:</span>{' '}
                              <span className="font-mono text-blue-200">{it.event?.payload?.sf_job_id ?? '—'}</span>
                            </div>
                            <p className="text-[10px] text-zinc-500 mt-1">
                              Full audit — values already matched Salesforce (no write sent).
                            </p>
                            <div className="mt-3 space-y-2">
                              {sfSyncDisplayedFields(it.event.payload).map((field: string) => (
                                <div key={field} className="bg-zinc-800/40 border border-zinc-700/40 rounded p-2">
                                  <div className="text-[10px] font-semibold text-blue-300 mb-1">{field}</div>
                                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    <div>
                                      <span className="text-zinc-500">Salesforce: </span>
                                      <span className="font-mono text-zinc-300">{fmtVal(it.event?.payload?.prev?.[field])}</span>
                                    </div>
                                    <div>
                                      <span className="text-zinc-500">Desired: </span>
                                      <span className="font-mono text-blue-200">{fmtVal(it.event?.payload?.next?.[field])}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      {(it.event?.eventType === 'sf_sync_skipped_no_mapping' ||
                        (it.event?.eventType === 'sf_scrape_fields_skip' &&
                          it.event?.payload?.detail &&
                          !(Array.isArray(it.event.payload?.fields_compared) && it.event.payload.fields_compared.length > 0))) && (
                        <div className="mt-2 rounded-lg p-3 bg-blue-500/5 border border-blue-500/15">
                          <p className="text-[10px] font-semibold text-blue-300 mb-1">Why this was skipped</p>
                          <p className="text-xs text-zinc-300 leading-relaxed">
                            {String(it.event.payload?.detail || it.event.payload?.reason || '—')}
                          </p>
                          {it.event.payload?.job_id ? (
                            <p className="text-[11px] text-zinc-500 mt-2 font-mono">
                              job_id: {String(it.event.payload.job_id)}
                            </p>
                          ) : null}
                        </div>
                      )}

                      {(it.event?.eventType === 'job_current_sf_ids_changed' ||
                        it.event?.eventType === 'job_current_upsert') && (
                        <div className="mt-2 rounded-lg p-3 bg-emerald-500/5 border border-emerald-500/10 text-xs text-zinc-300 space-y-1">
                          <p>
                            <span className="text-zinc-500">saved_as:</span>{' '}
                            {String(it.event.payload?.saved_as ?? '—')}
                          </p>
                          {it.event.payload?.job_content_id != null ? (
                            <p className="font-mono text-[11px] text-zinc-500">
                              job_content_id: {String(it.event.payload.job_content_id)}
                            </p>
                          ) : null}
                        </div>
                      )}

                      {it.event?.eventType === 'job_created_in_salesforce' && (
                        <div className="mt-2 rounded-lg p-3 bg-violet-500/10 border border-violet-500/25 text-xs text-zinc-300 space-y-2">
                          <p className="text-[11px] font-semibold text-violet-200">
                            New job (automation — not an existing match)
                          </p>
                          {it.event.payload?.summary ? (
                            <p className="text-[11px] text-zinc-400 leading-relaxed">{String(it.event.payload.summary)}</p>
                          ) : null}
                          <div className="grid gap-1 font-mono text-[11px]">
                            <p>
                              <span className="text-zinc-500">sf_job_id</span>{' '}
                              <span className="text-violet-200">{String(it.event.payload?.sf_job_id ?? '—')}</span>
                            </p>
                            {it.event.payload?.sf_worksite_account_id ? (
                              <p>
                                <span className="text-zinc-500">sf_worksite_account_id</span>{' '}
                                <span className="text-violet-200">
                                  {String(it.event.payload.sf_worksite_account_id)}
                                </span>
                              </p>
                            ) : null}
                            {it.event.payload?.automation_kind ? (
                              <p className="text-zinc-600">
                                automation_kind: {String(it.event.payload.automation_kind)}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      )}

                      {/* Fallback: show raw payload in a subtle way */}
                      {it.event?.eventType !== 'sf_ids_update' &&
                        it.event?.eventType !== 'job_created_in_salesforce' &&
                        it.event?.eventType !== 'sf_scrape_fields_patched' &&
                        it.event?.eventType !== 'sf_sync_skipped_no_mapping' &&
                        it.event?.eventType !== 'job_current_sf_ids_changed' &&
                        it.event?.eventType !== 'job_current_upsert' &&
                        !(
                          it.event?.eventType === 'sf_scrape_fields_skip' &&
                          it.event?.payload?.detail &&
                          !(
                            Array.isArray(it.event.payload?.fields_compared) &&
                            it.event.payload.fields_compared.length > 0
                          )
                        ) &&
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

  const patchList = job.salesforceFieldPatches || []
  const anyAudit = patchList.some(p => p.auditOnly)
  const anyPatched = patchList.some(p => !p.auditOnly)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-400">Salesforce field sync</p>
        <span className="text-[10px] text-zinc-600">Family C</span>
      </div>

      {hasPatches && (
        <div
          className={cn(
            'rounded-lg p-3 border',
            anyPatched && !anyAudit && 'bg-emerald-500/10 border-emerald-500/20',
            anyAudit && !anyPatched && 'bg-blue-500/10 border-blue-500/20',
            anyAudit && anyPatched && 'bg-zinc-800/40 border-zinc-700/50',
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <p
              className={cn(
                'text-xs font-semibold flex items-center gap-1',
                anyPatched && !anyAudit && 'text-emerald-400',
                anyAudit && !anyPatched && 'text-blue-300',
                anyAudit && anyPatched && 'text-zinc-300',
              )}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              {anyPatched && anyAudit && 'Salesforce updates + full-field audit'}
              {anyPatched && !anyAudit && 'Fields written to Salesforce'}
              {!anyPatched && anyAudit && 'Full-field audit (already matched Salesforce)'}
            </p>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'text-[10px] px-2 py-1 rounded-full',
                  anyPatched && !anyAudit && 'bg-emerald-500/20 text-emerald-300',
                  anyAudit && !anyPatched && 'bg-blue-500/20 text-blue-300',
                  anyAudit && anyPatched && 'bg-zinc-700/50 text-zinc-300',
                )}
              >
                {patchList.length} event{patchList.length !== 1 ? 's' : ''}
              </span>
              {patchList.length > 1 && (
                <button
                  onClick={toggleAllPatches}
                  className="text-[10px] px-2 py-1 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-800/50 transition-colors"
                >
                  {patchList.every((_, i) => expandedPatches.has(i)) ? 'Collapse All' : 'Expand All'}
                </button>
              )}
            </div>
          </div>
          {patchList.map((patch, i) => {
            const isExpanded = expandedPatches.has(i)
            const fc = patch.fieldsCompared?.length ? patch.fieldsCompared : patch.fieldsChanged
            const fieldsOrdered = sortSfValidationFields(fc)
            const patchedSet = new Set(patch.fieldsChanged || [])
            const isAudit = Boolean(patch.auditOnly)
            return (
              <div
                key={`${patch.eventId ?? i}_${isAudit ? 'a' : 'p'}`}
                className={cn(
                  'rounded-lg mb-2 last:mb-0 border',
                  isAudit ? 'border-blue-500/25 bg-blue-500/5' : 'border-emerald-500/20 bg-emerald-500/5',
                )}
              >
                <button
                  onClick={() => togglePatch(i)}
                  className={cn(
                    'w-full p-3 text-left transition-colors flex items-center justify-between rounded-lg',
                    isAudit ? 'hover:bg-blue-500/10' : 'hover:bg-emerald-500/10',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className={cn('text-xs font-medium mb-1', isAudit ? 'text-blue-300' : 'text-emerald-400')}>
                      Record {patch.sfJobId}
                      {isAudit ? (
                        <span className="text-zinc-500 font-normal"> · audit only</span>
                      ) : (
                        <span className="text-zinc-500 font-normal">
                          {' '}
                          · {patch.fieldsChanged.length} updated in SF · {fieldsOrdered.length} compared
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate">
                      {fieldsOrdered.slice(0, 4).join(', ')}
                      {fieldsOrdered.length > 4 ? ` +${fieldsOrdered.length - 4} more` : ''}
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
                    className={cn(
                      'shrink-0 transition-transform',
                      isAudit ? 'text-blue-400' : 'text-emerald-400',
                      isExpanded ? 'rotate-90' : '',
                    )}
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>

                {isExpanded && (
                  <div
                    className={cn(
                      'px-3 pb-3 border-t',
                      isAudit ? 'border-blue-500/15' : 'border-emerald-500/10',
                    )}
                  >
                    <div className="space-y-2 pt-2">
                      {fieldsOrdered.map(field => {
                        const didPatch = !isAudit && patchedSet.has(field)
                        const matched = sfValuesMatchDisplay(patch.prev?.[field], patch.next?.[field])
                        const badgeLabel = isAudit ? 'matched SF' : didPatch ? 'updated in SF' : matched ? 'unchanged' : 'review'
                        const badgeClass = didPatch
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : isAudit || matched
                            ? 'bg-zinc-700/60 text-zinc-400'
                            : 'bg-amber-500/15 text-amber-300'
                        return (
                          <div
                            key={field}
                            className={cn(
                              'rounded p-2 border',
                              didPatch
                                ? 'bg-emerald-500/5 border-emerald-500/15'
                                : 'bg-zinc-900/50 border-zinc-700/40',
                            )}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className={cn('text-[10px] font-semibold', isAudit ? 'text-blue-300' : 'text-emerald-400')}>
                                {field}
                              </div>
                              <span className={cn('text-[9px] px-1.5 py-0.5 rounded shrink-0', badgeClass)}>
                                {badgeLabel}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div>
                                <span className="text-zinc-500">{isAudit ? 'Salesforce: ' : 'Before: '}</span>
                                <span className="font-mono text-zinc-300">{fmtVal(patch.prev?.[field])}</span>
                              </div>
                              <div>
                                <span className="text-zinc-500">{isAudit ? 'Desired: ' : 'After: '}</span>
                                <span className={cn('font-mono', isAudit ? 'text-blue-200' : 'text-emerald-300')}>
                                  {fmtVal(patch.next?.[field])}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
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
  const jc = job.salesforceJobCreated

  return (
    <div className="border border-zinc-700/40 rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <StatusBadge status={job.status} />
            <span className="text-xs text-zinc-500">JobContent: {job.id}</span>
          </div>
          {jc && (
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300">
                  New job
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/25 text-violet-200">
                  auto-created
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                {jc.summary ||
                  'Salesforce record was created by automation because no existing job matched this Kimedics post.'}
              </p>
              {jc.sfJobId ? (
                <p className="text-[11px] font-mono text-violet-200 mt-2">
                  <span className="text-zinc-500">sf_job_id</span> {jc.sfJobId}
                </p>
              ) : null}
            </div>
          )}
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
          {(job.kimedicsData?.practice || job.kimedicsData?.practice_value) ? (
            <div className="text-[11px] text-zinc-400 leading-snug">
              <span className="text-zinc-500">Kimedics practice → Salesforce </span>
              <span className="font-mono text-zinc-300">Job_Client_Job_Id__c</span>
              <span className="text-zinc-500">: </span>
              <span className="text-zinc-200">{String(job.kimedicsData.practice ?? job.kimedicsData.practice_value)}</span>
              <span className="text-zinc-600"> · </span>
              <span className="text-zinc-500">Shown when Salesforce values differ from the scrape.</span>
            </div>
          ) : null}
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

    const qs = jobId ? `?jobId=${encodeURIComponent(jobId)}` : ''
    let cancelled = false
    const POLL_MS = 12_000

    const fetchValidationData = async (isInitial: boolean) => {
      if (cancelled) return
      if (isInitial) {
        setLoading(true)
        setError(null)
      }
      try {
        const response = await fetch(`/api/validation/${runId}${qs}`, { cache: 'no-store' })

        if (!response.ok) {
          throw new Error('Failed to fetch validation data')
        }

        const data = await response.json()
        if (!cancelled) {
          setJobs(data.jobs || [])
          if (isInitial) setError(null)
        }
      } catch {
        if (!cancelled && isInitial) {
          setError('Failed to load validation data')
        }
      } finally {
        if (!cancelled && isInitial) {
          setLoading(false)
        }
      }
    }

    void fetchValidationData(true)
    const poll = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void fetchValidationData(false)
    }, POLL_MS)

    return () => {
      cancelled = true
      clearInterval(poll)
    }
  }, [isOpen, runId, jobId])

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