'use client'

import { useEffect, useState } from 'react'
import type { DjcRunDetail, DjcRunDetailBundle, DjcEvent, DjcCandidateRow } from '@/lib/djcTypes'
import { cn, formatDuration } from '@/lib/utils'

/* Specialties we scrape — for the filter dropdown. */
const TARGETS = [
  'Endodontist', 'General Dentistry', 'Oral and Maxillofacial',
  'Orthodontics/Dentofacial Orthopedics', 'Pediatrics', 'Periodontics',
  'Prosthodontics', 'Dental Assistant', 'Dental Hygienist',
]

/* ── Plain-language layer ─────────────────────────────────────────────── */

const EVENT_COPY: Record<string, string> = {
  run_started: 'Run started', run_finished: 'Run finished', run_failed: 'Run failed',
  session_valid: 'Signed in to Dentist Job Cafe', session_expired: 'Sign-in expired — needs re-authentication',
  target_started: 'Searched specialty', target_completed: 'Finished specialty',
  candidate_selected: 'Opened candidate', profile_scraped: 'Read the candidate profile',
  profile_scrape_failed: 'Could not open the profile', cv_downloaded: 'Downloaded résumé',
  cv_missing: 'No résumé on file', cv_parse_failed: 'Could not read the résumé',
  contact_from_profile: 'Found contact info on the profile',
  contact_from_cv: 'Recovered contact info from the résumé',
  contact_from_profile_and_cv: 'Combined contact info from profile + résumé',
  candidate_uncontactable: 'No phone or email anywhere — skipped',
  dedup_no_match: 'Not yet in Salesforce', dedup_match: 'Already in Salesforce',
  dedup_query_failed: 'Could not check Salesforce',
  contact_create_skipped_guard: 'Ready for Salesforce — held (test mode)',
  contact_created: 'Added to Salesforce', contact_create_failed: 'Failed to add to Salesforce',
  cv_uploaded: 'Attached résumé in Salesforce', match_validated: 'Verified in Salesforce',
  match_validation_flagged: 'Verification flagged — review',
}
const DEDUP_COPY: Record<string, string> = {
  phone: 'matched by phone', email: 'matched by email',
  'name+link': 'matched by name + profile', link: 'matched by profile link',
}

type OutcomeKind = 'new' | 'exists' | 'skipped' | 'created'
function candidateOutcome(c: DjcCandidateRow): { kind: OutcomeKind; label: string; sub?: string } {
  if (c.sfContactId && c.dedupStatus === 'new') return { kind: 'created', label: 'Added to Salesforce' }
  if (c.dedupStatus === 'new') return { kind: 'new', label: 'Ready for Salesforce', sub: 'held — test mode' }
  if (c.dedupStatus === 'duplicate') return { kind: 'exists', label: 'Already in Salesforce', sub: DEDUP_COPY[c.dedupReason ?? ''] }
  return { kind: 'skipped', label: 'Skipped', sub: 'no contact info' }
}
const OUTCOME_STYLE: Record<OutcomeKind, string> = {
  new: 'text-cyan-300 bg-cyan-500/10 ring-cyan-500/25',
  created: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/25',
  exists: 'text-zinc-400 bg-zinc-600/15 ring-zinc-500/20',
  skipped: 'text-amber-300 bg-amber-500/10 ring-amber-500/25',
}

/* ── Small pieces ─────────────────────────────────────────────────────── */

function StatusGlyph({ status, errorCount }: { status: string; errorCount: number }) {
  if (status === 'running')
    return <span className="relative flex h-2 w-2" title="Running"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" /></span>
  if (status === 'error' || status === 'session_expired') return <span className="h-2 w-2 rounded-full bg-red-500" title="Did not finish" />
  if (errorCount > 0) return <span className="h-2 w-2 rounded-full bg-amber-500" title="Completed with warnings" />
  return <span className="h-2 w-2 rounded-full bg-emerald-500" title="Completed" />
}

function Metric({ value, label, tone = 'default' }: { value: number; label: string; tone?: 'default' | 'cyan' | 'amber' }) {
  const tones = { default: 'text-zinc-100', cyan: 'text-cyan-300', amber: 'text-amber-300' }
  return <div className="flex flex-col"><span className={cn('text-xl font-semibold tabular-nums leading-none', tones[tone])}>{value}</span><span className="mt-1 text-[11px] text-zinc-500">{label}</span></div>
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="min-w-0"><p className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</p><p className="truncate text-[13px] text-zinc-200" title={value ?? ''}>{value || '—'}</p></div>
}

// A date-only ('YYYY-MM-DD') or timestamp → short 'Mon D, YYYY' in ET; null-safe.
function fmtDate(s: string | null | undefined): string | null {
  if (!s) return null
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00Z` : s
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function ProfileLink({ url }: { url: string | null }) {
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-zinc-500 ring-1 ring-zinc-700/50 transition-colors hover:text-cyan-300 hover:ring-cyan-500/30" title="Open DJC profile">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
      DJC
    </a>
  )
}

function SfLink({ id }: { id: string | null }) {
  if (!id) return null
  return (
    <a href={`https://proxi.my.salesforce.com/${id}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-zinc-500 ring-1 ring-zinc-700/50 transition-colors hover:text-emerald-300 hover:ring-emerald-500/30" title="Open Salesforce contact">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
      SF
    </a>
  )
}

function contactSourceCopy(s: string | null): string | null {
  return s === 'profile' ? 'On profile' : s === 'cv' ? 'In résumé' : s === 'profile+cv' ? 'Profile + résumé' : s === 'skipped (already in SF)' ? 'Not collected (already in SF)' : null
}

/* ── Candidate row + detail ───────────────────────────────────────────── */

function CandidateDetail({ c, events }: { c: DjcCandidateRow; events: DjcEvent[] }) {
  const out = candidateOutcome(c)
  const willSend = out.kind === 'new' || out.kind === 'created'
  return (
    <div className="border-t border-zinc-800/80 px-4 pb-4 pt-3">
      {willSend && <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-cyan-400/80">{out.kind === 'created' ? 'Sent to Salesforce' : 'Prepared for Salesforce'}</p>}
      <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
        <Field label="Name" value={c.name} />
        <Field label="Specialty" value={c.target} />
        <Field label="Position type" value={c.positionTypes?.replace(/;/g, ', ')} />
        <Field label="Phone" value={c.phone} />
        <Field label="Email" value={c.email} />
        <Field label="Contact found" value={contactSourceCopy(c.contactSource)} />
        <Field label="Location" value={[c.mailingCity, c.mailingState].filter(Boolean).join(', ') || null} />
        <Field label="Zip" value={c.mailingPostalCode} />
        <Field label="Job matches" value={c.matchCount != null ? String(c.matchCount) : null} />
        <Field label="State license" value={c.stateLicenses?.replace(/;/g, ', ')} />
        <Field label="Preferred states" value={c.preferredStates?.replace(/;/g, ', ')} />
        <Field label="Résumé" value={c.cvFilename ? 'Attached' : 'None'} />
        <Field label="Added to SF" value={fmtDate(c.addedAt)} />
        <Field label="Last reviewed" value={fmtDate(c.lastReviewedOn)} />
        <Field label="DJC candidate id" value={c.candidateId} />
      </div>
      {events.length > 0 && (
        <div className="mt-4 border-t border-zinc-800/80 pt-3">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-600">Activity</p>
          <ol className="space-y-1.5">
            {events.map(e => (
              <li key={e.id} className="flex items-center gap-2 text-[12px]">
                <span className={cn('h-1 w-1 rounded-full', e.level === 'error' ? 'bg-red-500' : e.level === 'warn' ? 'bg-amber-500' : 'bg-zinc-600')} />
                <span className="text-zinc-400">{EVENT_COPY[e.eventType] ?? e.eventType.replace(/_/g, ' ')}</span>
                {e.eventType === 'dedup_match' && e.payload?.reason ? <span className="text-zinc-600">({DEDUP_COPY[String(e.payload?.reason)] ?? String(e.payload?.reason)})</span> : null}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

function CandidateRow({ c, events }: { c: DjcCandidateRow; events: DjcEvent[] }) {
  const [open, setOpen] = useState(false)
  const out = candidateOutcome(c)
  return (
    <div className="overflow-hidden rounded-lg bg-zinc-800/30 ring-1 ring-zinc-700/40">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <button onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cn('shrink-0 text-zinc-600 transition-transform', open && 'rotate-90')}><path d="m9 18 6-6-6-6" /></svg>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-zinc-100">{c.name || c.candidateId}</p>
            <p className="truncate text-[11px] text-zinc-500">{[c.target, [c.mailingCity, c.mailingState].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</p>
          </div>
        </button>
        <ProfileLink url={c.profileUrl} />
        <SfLink id={c.sfContactId} />
        <div className="flex shrink-0 flex-col items-end">
          <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium ring-1', OUTCOME_STYLE[out.kind])}>{out.label}</span>
          {out.sub && <span className="mt-0.5 text-[10px] text-zinc-600">{out.sub}</span>}
        </div>
      </div>
      {open && <CandidateDetail c={c} events={events} />}
    </div>
  )
}

/* Collapsible outcome group — collapsed by default so runs stay short/scannable. */
function CandidateGroup({ kind, title, rows, eventsBy }: { kind: OutcomeKind; title: string; rows: DjcCandidateRow[]; eventsBy: Map<string, DjcEvent[]> }) {
  const [open, setOpen] = useState(false)
  const dot = kind === 'new' ? 'bg-cyan-400' : kind === 'created' ? 'bg-emerald-400' : kind === 'skipped' ? 'bg-amber-400' : 'bg-zinc-500'
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-zinc-700/20">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cn('shrink-0 text-zinc-600 transition-transform', open && 'rotate-90')}><path d="m9 18 6-6-6-6" /></svg>
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} />
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">{title}</span>
        <span className="text-[11px] text-zinc-600">· {rows.length}</span>
      </button>
      {open && <div className="mt-1.5 space-y-1.5 pl-1">{rows.map(c => <CandidateRow key={c.candidateId} c={c} events={eventsBy.get(c.candidateId) ?? []} />)}</div>}
    </div>
  )
}

/* ── Run detail ───────────────────────────────────────────────────────── */

function RunDetailBody({ run, bundle }: { run: DjcRunDetail; bundle: DjcRunDetailBundle }) {
  const eventsBy = new Map<string, DjcEvent[]>()
  for (const e of bundle.events) { if (!e.candidateId) continue; const a = eventsBy.get(e.candidateId) ?? []; a.push(e); eventsBy.set(e.candidateId, a) }
  const groups: { key: OutcomeKind; title: string; rows: DjcCandidateRow[] }[] = [
    { key: 'new', title: 'New — ready for Salesforce', rows: [] },
    { key: 'created', title: 'Added to Salesforce', rows: [] },
    { key: 'exists', title: 'Already in Salesforce', rows: [] },
    { key: 'skipped', title: 'Skipped — no contact', rows: [] },
  ]
  for (const c of bundle.candidates) groups.find(g => g.key === candidateOutcome(c).kind)?.rows.push(c)
  const specialties = run.targets ? run.targets.split(',').length : 0

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-zinc-900/50 px-4 py-4 ring-1 ring-zinc-700/40">
        <p className="text-[13px] leading-relaxed text-zinc-300">
          Reviewed <span className="font-semibold text-white">{run.candidatesSeen}</span> candidates
          {specialties ? <> across <span className="font-semibold text-white">{specialties}</span> specialties</> : null}.{' '}
          {run.createSkippedGuard + run.created > 0 ? <>Found <span className="font-semibold text-cyan-300">{run.createSkippedGuard + run.created}</span> new for Salesforce. </> : <>No new candidates this run. </>}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric value={run.candidatesSeen} label="reviewed" />
          <Metric value={run.created + run.createSkippedGuard} label={run.writeMode === 'live' ? 'added' : 'new (held)'} tone="cyan" />
          <Metric value={run.duplicates} label="already in SF" />
          <Metric value={run.uncontactable} label="no contact" tone="amber" />
        </div>
        {run.writeMode !== 'live' && <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300/90 ring-1 ring-amber-500/20"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />Test mode — no records were created or changed in Salesforce</p>}
      </div>
      {bundle.candidates.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-zinc-600">No candidates were in scope for this run.</p>
      ) : (
        <div className="space-y-1">
          {groups.filter(g => g.rows.length).map(g => <CandidateGroup key={g.key} kind={g.key} title={g.title} rows={g.rows} eventsBy={eventsBy} />)}
        </div>
      )}
    </div>
  )
}

/* Runs are grouped under a date header (Today / Yesterday / weekday), so each row only needs its
   own time-of-day — no opaque "Run #N", no fixed-cadence "k/3" that breaks on manual/test runs. */
const ET = { timeZone: 'America/New_York' } as const
const etDayKey = (s: string) => new Date(s).toLocaleDateString('en-US', ET)

function timeLabel(s: string): string {
  return new Date(s).toLocaleTimeString('en-US', { ...ET, hour: 'numeric', minute: '2-digit' }) + ' ET'
}

type DayHeader = { primary: string; secondary: string; isToday: boolean }
function dayHeader(iso: string): DayHeader {
  const key = etDayKey(iso)
  const todayKey = new Date().toLocaleDateString('en-US', ET)
  const yesterdayKey = new Date(Date.now() - 86_400_000).toLocaleDateString('en-US', ET)
  const d = new Date(iso)
  const secondary = d.toLocaleDateString('en-US', { ...ET, month: 'short', day: 'numeric' })
  if (key === todayKey) return { primary: 'Today', secondary, isToday: true }
  if (key === yesterdayKey) return { primary: 'Yesterday', secondary, isToday: false }
  return { primary: d.toLocaleDateString('en-US', { ...ET, weekday: 'long' }), secondary, isToday: false }
}

/* Group consecutive same-day runs (runs arrive newest-first, so same-day rows are contiguous). */
function groupRunsByDay(runs: DjcRunDetail[]): { key: string; header: DayHeader; runs: DjcRunDetail[] }[] {
  const groups: { key: string; header: DayHeader; runs: DjcRunDetail[] }[] = []
  for (const run of runs) {
    const key = etDayKey(run.startedAt)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.runs.push(run)
    else groups.push({ key, header: dayHeader(run.startedAt), runs: [run] })
  }
  return groups
}

function RunRow({ run, label }: { run: DjcRunDetail; label: string }) {
  const [open, setOpen] = useState(false)
  const [bundle, setBundle] = useState<DjcRunDetailBundle | null>(null)
  const [loading, setLoading] = useState(false)
  const newCount = run.created + run.createSkippedGuard
  const interrupted = run.status === 'error' || run.status === 'session_expired'

  async function toggle() {
    const next = !open; setOpen(next)
    if (next && !bundle) {
      setLoading(true)
      try { const res = await fetch(`/api/djc/run/${run.id}`); setBundle(await res.json()) }
      catch { setBundle({ events: [], candidates: [] }) }
      finally { setLoading(false) }
    }
  }

  const time = label.replace(' ET', '')
  return (
    <div className={cn('transition-colors', open && 'bg-zinc-800/40')}>
      <button onClick={toggle} className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-zinc-700/15">
        <StatusGlyph status={run.status} errorCount={run.errorCount} />
        <span className="w-[74px] shrink-0 text-[12px] font-semibold text-zinc-100 tabular-nums">{time}</span>
        <span className="min-w-0 flex-1 truncate text-[12px]">
          {interrupted ? (
            <span className="text-red-400">Did not finish — {run.errorCount > 0 ? 'errored partway' : 'interrupted'}</span>
          ) : (
            <>
              {newCount > 0 ? <span className="font-semibold text-cyan-300">{newCount} new</span>
                : <span className="text-zinc-600">no new candidates</span>}
              {run.duplicates > 0 && <span className="text-zinc-500"> · {run.duplicates} in SF</span>}
              {run.uncontactable > 0 && <span className="text-zinc-500"> · {run.uncontactable} no contact</span>}
            </>
          )}
        </span>
        {run.trigger === 'backfill' && <span className="shrink-0 rounded bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-medium text-violet-300 ring-1 ring-violet-500/25">recovery</span>}
        {run.writeMode !== 'live' && <span className="hidden shrink-0 rounded bg-zinc-700/30 px-1.5 py-0.5 text-[9px] text-zinc-500 sm:inline">test</span>}
        {!interrupted && <span className="shrink-0 text-[11px] text-zinc-600 tabular-nums">{formatDuration(run.durationSeconds)}</span>}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cn('shrink-0 text-zinc-600 transition-transform', open && 'rotate-180')}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && <div className="border-t border-cyan-500/15 bg-zinc-900/40 p-4">{loading ? <p className="py-6 text-center text-[13px] text-zinc-600">Loading…</p> : bundle ? <RunDetailBody run={run} bundle={bundle} /> : null}</div>}
    </div>
  )
}

/* ── Search mode ──────────────────────────────────────────────────────── */

function SearchResults({ q, specialty }: { q: string; specialty: string }) {
  const [rows, setRows] = useState<DjcCandidateRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams()
        if (q) params.set('q', q)
        if (specialty) params.set('specialty', specialty)
        const res = await fetch(`/api/djc/candidates?${params}`)
        const data = await res.json()
        if (!cancelled) setRows(data.candidates ?? [])
      } catch { if (!cancelled) setRows([]) } finally { if (!cancelled) setLoading(false) }
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, specialty])

  if (loading) return <p className="py-6 text-center text-[13px] text-zinc-600">Searching…</p>
  if (!rows || rows.length === 0) return <p className="py-6 text-center text-[13px] text-zinc-600">No candidates match.</p>
  return (
    <div className="space-y-1.5">
      <p className="px-1 text-[11px] text-zinc-500">{rows.length} candidate{rows.length === 1 ? '' : 's'} found</p>
      {rows.map(c => <CandidateRow key={c.candidateId} c={c} events={[]} />)}
    </div>
  )
}

/* ── Filter bar + root ────────────────────────────────────────────────── */

export default function DjcRunBreakdown({ runs }: { runs: DjcRunDetail[] }) {
  const [q, setQ] = useState('')
  const [specialty, setSpecialty] = useState('')
  const searching = q.trim().length > 0 || specialty.length > 0

  return (
    <div className="space-y-3">
      {/* Filter / search bar */}
      <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or DJC id…"
            className="w-full rounded-lg bg-zinc-800/50 py-2 pl-9 pr-8 text-[13px] text-zinc-200 placeholder:text-zinc-600 ring-1 ring-zinc-700/50 outline-none focus:ring-cyan-500/40" />
          {q && <button onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300">✕</button>}
        </div>
        <select value={specialty} onChange={e => setSpecialty(e.target.value)}
          className="rounded-lg bg-zinc-800/50 px-3 py-2 text-[13px] text-zinc-300 ring-1 ring-zinc-700/50 outline-none focus:ring-cyan-500/40">
          <option value="">All specialties</option>
          {TARGETS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {searching ? (
        <SearchResults q={q.trim()} specialty={specialty} />
      ) : runs.length === 0 ? (
        <p className="px-3 py-6 text-center text-[13px] text-zinc-600">No runs yet.</p>
      ) : (
        <div className="space-y-4">
          {groupRunsByDay(runs).map(g => {
            const dayNew = g.runs.reduce((s, r) => s + r.created + r.createSkippedGuard, 0)
            const dayDup = g.runs.reduce((s, r) => s + r.duplicates, 0)
            return (
              <div key={g.key} className="space-y-1.5">
                <div className="flex items-center gap-2 px-1">
                  <span className={cn('text-[12px] font-semibold', g.header.isToday ? 'text-cyan-300' : 'text-zinc-300')}>{g.header.primary}</span>
                  <span className="text-[11px] text-zinc-600">{g.header.secondary}</span>
                  <span className="text-[11px] text-zinc-700">· {g.runs.length} run{g.runs.length === 1 ? '' : 's'}</span>
                  {dayNew > 0 && <span className="text-[11px] font-medium text-cyan-300">· {dayNew} new</span>}
                  {dayDup > 0 && <span className="text-[11px] text-zinc-600">· {dayDup} in SF</span>}
                  <div className="ml-1 h-px flex-1 bg-zinc-800/70" />
                </div>
                <div className="overflow-hidden rounded-xl ring-1 ring-zinc-700/40 divide-y divide-zinc-800/70">
                  {g.runs.map(run => <RunRow key={run.id} run={run} label={timeLabel(run.startedAt)} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
