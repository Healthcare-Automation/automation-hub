'use client'

import { useState } from 'react'
import type { DjcRunDetail, DjcRunDetailBundle, DjcEvent, DjcCandidateRow } from '@/lib/djcTypes'
import { cn, formatRelativeTime, formatDuration } from '@/lib/utils'

/* ─────────────────────────────────────────────────────────────────────────
   Plain-language layer. The DB stores terse event types; clients see English.
   ───────────────────────────────────────────────────────────────────────── */

const EVENT_COPY: Record<string, string> = {
  run_started: 'Run started',
  run_finished: 'Run finished',
  run_failed: 'Run failed',
  session_valid: 'Signed in to Dentist Job Cafe',
  session_expired: 'Sign-in expired — needs re-authentication',
  target_started: 'Searched specialty',
  target_completed: 'Finished specialty',
  candidate_selected: 'Opened candidate',
  profile_scraped: 'Read the candidate profile',
  profile_scrape_failed: 'Could not open the profile',
  cv_downloaded: 'Downloaded résumé',
  cv_missing: 'No résumé on file',
  cv_parse_failed: 'Could not read the résumé',
  contact_from_profile: 'Found contact info on the profile',
  contact_from_cv: 'Recovered contact info from the résumé',
  contact_from_profile_and_cv: 'Combined contact info from profile + résumé',
  candidate_uncontactable: 'No phone or email anywhere — skipped',
  dedup_no_match: 'Not yet in Salesforce',
  dedup_match: 'Already in Salesforce',
  dedup_query_failed: 'Could not check Salesforce',
  contact_create_skipped_guard: 'Ready for Salesforce — held (test mode)',
  contact_created: 'Added to Salesforce',
  contact_create_failed: 'Failed to add to Salesforce',
  cv_uploaded: 'Attached résumé in Salesforce',
  match_validated: 'Verified in Salesforce',
  match_validation_flagged: 'Verification flagged — review',
}

const DEDUP_COPY: Record<string, string> = {
  phone: 'matched by phone',
  email: 'matched by email',
  'name+link': 'matched by name + profile',
}

type OutcomeKind = 'new' | 'exists' | 'skipped' | 'created'

function candidateOutcome(c: DjcCandidateRow): { kind: OutcomeKind; label: string; sub?: string } {
  if (c.sfContactId && c.dedupStatus === 'new') return { kind: 'created', label: 'Added to Salesforce' }
  if (c.dedupStatus === 'new') return { kind: 'new', label: 'Ready for Salesforce', sub: 'held — test mode' }
  if (c.dedupStatus === 'duplicate')
    return { kind: 'exists', label: 'Already in Salesforce', sub: DEDUP_COPY[c.dedupReason ?? ''] ?? undefined }
  return { kind: 'skipped', label: 'Skipped', sub: 'no contact info' }
}

const OUTCOME_STYLE: Record<OutcomeKind, string> = {
  new: 'text-cyan-300 bg-cyan-500/10 ring-cyan-500/25',
  created: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/25',
  exists: 'text-zinc-400 bg-zinc-600/15 ring-zinc-500/20',
  skipped: 'text-amber-300 bg-amber-500/10 ring-amber-500/25',
}

/* ─────────────────────────────────────────────────────────────────────────
   Small presentational pieces
   ───────────────────────────────────────────────────────────────────────── */

function StatusGlyph({ status, errorCount }: { status: string; errorCount: number }) {
  if (status === 'running')
    return (
      <span className="relative flex h-2 w-2" title="Running">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
      </span>
    )
  if (status === 'error' || status === 'session_expired')
    return <span className="h-2 w-2 rounded-full bg-red-500" title="Did not finish" />
  if (errorCount > 0) return <span className="h-2 w-2 rounded-full bg-amber-500" title="Completed with warnings" />
  return <span className="h-2 w-2 rounded-full bg-emerald-500" title="Completed" />
}

/** One emphasized number + label, used in the run summary readout. */
function Metric({ value, label, tone = 'default' }: { value: number; label: string; tone?: 'default' | 'cyan' | 'emerald' | 'amber' | 'red' }) {
  const tones = {
    default: 'text-zinc-100',
    cyan: 'text-cyan-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    red: 'text-red-300',
  }
  return (
    <div className="flex flex-col">
      <span className={cn('text-xl font-semibold tabular-nums leading-none', tones[tone])}>{value}</span>
      <span className="mt-1 text-[11px] text-zinc-500">{label}</span>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</p>
      <p className="truncate text-[13px] text-zinc-200" title={value ?? ''}>{value || '—'}</p>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Candidate detail — what we collected + what goes to Salesforce
   ───────────────────────────────────────────────────────────────────────── */

function CandidateDetail({ c, events }: { c: DjcCandidateRow; events: DjcEvent[] }) {
  const out = candidateOutcome(c)
  const willSend = out.kind === 'new' || out.kind === 'created'
  return (
    <div className="px-4 pb-4 pt-1">
      {willSend && (
        <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-cyan-400/80">
          {out.kind === 'created' ? 'Sent to Salesforce' : 'Prepared for Salesforce'}
        </p>
      )}
      <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
        <Field label="Name" value={c.name} />
        <Field label="Specialty" value={c.target} />
        <Field label="Position type" value={c.positionTypes?.replace(/;/g, ', ')} />
        <Field label="Phone" value={c.phone} />
        <Field label="Email" value={c.email} />
        <Field label="Contact found" value={contactSourceCopy(c.contactSource)} />
        <Field label="Location" value={[c.mailingCity, c.mailingState].filter(Boolean).join(', ') || null} />
        <Field label="Zip" value={c.mailingPostalCode} />
        <Field label="State license" value={c.stateLicenses?.replace(/;/g, ', ')} />
        <Field label="Preferred states" value={c.preferredStates?.replace(/;/g, ', ')} />
        <Field label="Résumé" value={c.cvFilename ? 'Attached' : 'None'} />
        <Field label="Source" value="Dentist Job Cafe" />
      </div>

      {/* Activity trail in plain English */}
      {events.length > 0 && (
        <div className="mt-4 border-t border-zinc-800/80 pt-3">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-600">Activity</p>
          <ol className="space-y-1.5">
            {events.map(e => (
              <li key={e.id} className="flex items-center gap-2 text-[12px]">
                <span className={cn('h-1 w-1 rounded-full', e.level === 'error' ? 'bg-red-500' : e.level === 'warn' ? 'bg-amber-500' : 'bg-zinc-600')} />
                <span className="text-zinc-400">{EVENT_COPY[e.eventType] ?? e.eventType.replace(/_/g, ' ')}</span>
                {e.eventType === 'dedup_match' && e.payload?.reason ? (
                  <span className="text-zinc-600">({DEDUP_COPY[String(e.payload.reason)] ?? String(e.payload.reason)})</span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

function contactSourceCopy(s: string | null): string | null {
  if (s === 'profile') return 'On profile'
  if (s === 'cv') return 'In résumé'
  if (s === 'profile+cv') return 'Profile + résumé'
  return null
}

function CandidateRow({ c, events }: { c: DjcCandidateRow; events: DjcEvent[] }) {
  const [open, setOpen] = useState(false)
  const out = candidateOutcome(c)
  return (
    <div className="overflow-hidden rounded-lg bg-zinc-800/30 ring-1 ring-zinc-700/40">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-700/20">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-zinc-100">{c.name || c.candidateId}</p>
          <p className="truncate text-[11px] text-zinc-500">
            {[c.target, [c.mailingCity, c.mailingState].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium ring-1', OUTCOME_STYLE[out.kind])}>{out.label}</span>
          {out.sub && <span className="mt-0.5 text-[10px] text-zinc-600">{out.sub}</span>}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={cn('shrink-0 text-zinc-600 transition-transform', open && 'rotate-180')}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <CandidateDetail c={c} events={events} />}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Run detail — summary readout + grouped candidate lists
   ───────────────────────────────────────────────────────────────────────── */

function RunDetailBody({ run, bundle }: { run: DjcRunDetail; bundle: DjcRunDetailBundle }) {
  const byCandidate = new Map<string, DjcEvent[]>()
  for (const e of bundle.events) {
    if (!e.candidateId) continue
    const arr = byCandidate.get(e.candidateId) ?? []
    arr.push(e)
    byCandidate.set(e.candidateId, arr)
  }
  const groups: { key: OutcomeKind; title: string; rows: DjcCandidateRow[] }[] = [
    { key: 'new', title: 'New — ready for Salesforce', rows: [] },
    { key: 'created', title: 'Added to Salesforce', rows: [] },
    { key: 'exists', title: 'Already in Salesforce', rows: [] },
    { key: 'skipped', title: 'Skipped — no contact info', rows: [] },
  ]
  for (const c of bundle.candidates) {
    const k = candidateOutcome(c).kind
    groups.find(g => g.key === k)?.rows.push(c)
  }
  const specialties = run.targets ? run.targets.split(',').length : 0

  return (
    <div className="space-y-5">
      {/* Plain-English summary */}
      <div className="rounded-xl bg-zinc-900/50 px-4 py-4 ring-1 ring-zinc-700/40">
        <p className="text-[13px] leading-relaxed text-zinc-300">
          Reviewed <span className="font-semibold text-white">{run.candidatesSeen}</span> candidates
          {specialties ? <> across <span className="font-semibold text-white">{specialties}</span> specialties</> : null}.{' '}
          {run.createSkippedGuard + run.created > 0 ? (
            <>Found <span className="font-semibold text-cyan-300">{run.createSkippedGuard + run.created}</span> new for Salesforce. </>
          ) : (
            <>No new candidates this run. </>
          )}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric value={run.candidatesSeen} label="reviewed" />
          <Metric value={run.created + run.createSkippedGuard} label={run.writeMode === 'live' ? 'added' : 'new (held)'} tone="cyan" />
          <Metric value={run.duplicates} label="already in SF" />
          <Metric value={run.uncontactable} label="no contact" tone="amber" />
        </div>
        {run.writeMode !== 'live' && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300/90 ring-1 ring-amber-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Test mode — no records were created or changed in Salesforce
          </p>
        )}
      </div>

      {/* Candidate groups */}
      {groups.filter(g => g.rows.length).map(g => (
        <div key={g.key}>
          <p className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            <span className={cn('h-1.5 w-1.5 rounded-full', g.key === 'new' ? 'bg-cyan-400' : g.key === 'created' ? 'bg-emerald-400' : g.key === 'skipped' ? 'bg-amber-400' : 'bg-zinc-500')} />
            {g.title}
            <span className="text-zinc-600">· {g.rows.length}</span>
          </p>
          <div className="space-y-1.5">
            {g.rows.map(c => <CandidateRow key={c.candidateId} c={c} events={byCandidate.get(c.candidateId) ?? []} />)}
          </div>
        </div>
      ))}
      {bundle.candidates.length === 0 && (
        <p className="py-6 text-center text-[13px] text-zinc-600">No candidates were in scope for this run.</p>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Run row (collapsed) — clean, scannable, plain-English
   ───────────────────────────────────────────────────────────────────────── */

function RunRow({ run }: { run: DjcRunDetail }) {
  const [open, setOpen] = useState(false)
  const [bundle, setBundle] = useState<DjcRunDetailBundle | null>(null)
  const [loading, setLoading] = useState(false)
  const newCount = run.created + run.createSkippedGuard
  const interrupted = run.status === 'error' || run.status === 'session_expired'

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && !bundle) {
      setLoading(true)
      try {
        const res = await fetch(`/api/djc/run/${run.id}`)
        setBundle(await res.json())
      } catch {
        setBundle({ events: [], candidates: [] })
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-zinc-700/40">
      <button onClick={toggle} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-zinc-700/15">
        <StatusGlyph status={run.status} errorCount={run.errorCount} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-medium text-zinc-200">Run #{run.id}</span>
            <span className="text-[11px] text-zinc-500">{formatRelativeTime(run.startedAt)}</span>
            {!interrupted && <span className="text-[11px] text-zinc-600">· {formatDuration(run.durationSeconds)}</span>}
          </div>
          <p className="mt-0.5 truncate text-[12px] text-zinc-400">
            {interrupted ? (
              <span className="text-zinc-500">Did not finish — {run.errorCount > 0 ? 'errored partway' : 'interrupted'}</span>
            ) : run.candidatesSeen === 0 ? (
              <span className="text-zinc-500">No candidates reviewed</span>
            ) : (
              <>
                <span className="text-zinc-300">{run.candidatesSeen}</span> reviewed
                {newCount > 0 && <> · <span className="font-medium text-cyan-300">{newCount} new</span></>}
                {run.duplicates > 0 && <> · {run.duplicates} already in SF</>}
                {run.uncontactable > 0 && <> · {run.uncontactable} no contact</>}
              </>
            )}
          </p>
        </div>
        {run.writeMode !== 'live' && (
          <span className="hidden shrink-0 rounded-md bg-zinc-700/30 px-2 py-0.5 text-[10px] text-zinc-500 ring-1 ring-zinc-600/30 sm:inline">test mode</span>
        )}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={cn('shrink-0 text-zinc-600 transition-transform', open && 'rotate-180')}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-zinc-700/40 bg-zinc-900/30 p-4">
          {loading ? (
            <p className="py-6 text-center text-[13px] text-zinc-600">Loading…</p>
          ) : bundle ? (
            <RunDetailBody run={run} bundle={bundle} />
          ) : null}
        </div>
      )}
    </div>
  )
}

export default function DjcRunBreakdown({ runs }: { runs: DjcRunDetail[] }) {
  if (runs.length === 0) return <p className="px-3 py-6 text-center text-[13px] text-zinc-600">No runs yet.</p>
  return (
    <div className="space-y-2.5">
      {runs.map(run => <RunRow key={run.id} run={run} />)}
    </div>
  )
}
