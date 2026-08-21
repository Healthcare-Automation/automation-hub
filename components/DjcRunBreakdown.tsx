'use client'

import { useEffect, useState } from 'react'
import { isDjcFailedStatus, type DjcRunDetail, type DjcRunDetailBundle, type DjcEvent, type DjcCandidateRow } from '@/lib/djcTypes'
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
  session_reauthed: 'Automatic sign-in recovery succeeded',
  session_reauth_failed: 'Automatic sign-in recovery failed',
  otp_received: 'Verification code received', otp_delivery_timeout: 'Verification code timed out',
  otp_provider_error: 'Verification-code channel unavailable',
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

type OutcomeKind = 'new' | 'exists' | 'skipped' | 'created' | 'blocked' | 'error'

/**
 * Did this candidate actually cost a Profile View?
 *
 * A view is spent only when we OPEN the profile. Candidates matched by profile link or by the
 * conserve name pre-check are decided from list-view data and cost nothing; quota-blocked ones were
 * walled off before the reveal, so they cost nothing either. Reading this off contact_source alone
 * is what made "already checked" and "never checked" indistinguishable all day.
 */
function viewSpent(c: DjcCandidateRow): boolean {
  // Per-run, from this run's event log. Using the lifetime flags made the funnel disagree with the
  // run's own header — one said 0 views spent while the other said 2.
  return !!c.openedThisRun && !c.blockedThisRun
}
// How a later run settled a candidate this run errored on, in decisiveness order.
const RESOLUTION_COPY: [string, string][] = [
  ['contact_created', 'added to Salesforce'],
  ['dedup_match', 'already in Salesforce'],
  ['candidate_uncontactable', 'no contact details anywhere'],
  ['profile_scraped', 'profile opened fine'],
]

function candidateOutcome(c: DjcCandidateRow, events: DjcEvent[] = [], runId?: number): { kind: OutcomeKind; label: string; sub?: string } {
  // All judged on what happened IN THIS RUN, so the groups reconcile with the funnel above them.
  if (c.blockedThisRun) return { kind: 'blocked', label: 'Blocked', sub: 'Profile Views quota — not checked' }
  if (c.createdThisRun) return { kind: 'created', label: 'Added to Salesforce' }
  if (c.matchedThisRun) return { kind: 'exists', label: 'Already in Salesforce', sub: DEDUP_COPY[c.dedupReason ?? ''] }
  // A step errored before this candidate was decided (page timeout, résumé parse failure, …).
  // Without this branch they fell through to "no contact details found" — a data verdict the
  // run never actually reached. Scoped to THIS run's events: the trail spans all runs, and an
  // old failure must not overwrite what a later run actually decided.
  const err = events.find(e => e.level === 'error' && (runId == null || e.runId === runId))
  if (err) {
    const errCopy = EVENT_COPY[err.eventType] ?? err.eventType.replace(/_/g, ' ')
    const later = events.filter(e => runId != null && e.runId != null && e.runId > runId)
    const res = RESOLUTION_COPY.find(([type]) => later.some(e => e.eventType === type))
    if (res) return { kind: 'error', label: 'Error — resolved', sub: `retried in a later run: ${res[1]}` }
    return { kind: 'error', label: 'Error', sub: errCopy }
  }
  if (c.dedupStatus === 'new' && !c.sfContactId) return { kind: 'new', label: 'Ready for Salesforce', sub: 'held — test mode' }
  if (c.sfContactId && c.dedupStatus === 'new') return { kind: 'created', label: 'Added to Salesforce' }
  if (c.dedupStatus === 'duplicate') return { kind: 'exists', label: 'Already in Salesforce', sub: DEDUP_COPY[c.dedupReason ?? ''] }
  // A quota-blocked candidate was never actually checked — the reveal was walled off, so their
  // empty contact fields say nothing about them. Labelling that "no contact info" reads as a
  // finished verdict and hides real pending work.
  return { kind: 'skipped', label: 'Skipped', sub: 'no contact details found' }
}
const OUTCOME_STYLE: Record<OutcomeKind, string> = {
  new: 'text-cyan-300 bg-cyan-500/10 ring-cyan-500/25',
  created: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/25',
  exists: 'text-zinc-400 bg-zinc-600/15 ring-zinc-500/20',
  skipped: 'text-amber-300 bg-amber-500/10 ring-amber-500/25',
  blocked: 'text-sky-300 bg-sky-500/10 ring-sky-500/25',
  error: 'text-red-300 bg-red-500/10 ring-red-500/25',
}

/* ── Small pieces ─────────────────────────────────────────────────────── */

function StatusGlyph({ status, errorCount }: { status: string; errorCount: number }) {
  if (status === 'running')
    return <span className="relative flex h-2 w-2" title="Running"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" /></span>
  if (isDjcFailedStatus(status)) return <span className="h-2 w-2 rounded-full bg-red-500" title="Did not finish" />
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

function CandidateDetail({ c, events, runId }: { c: DjcCandidateRow; events: DjcEvent[]; runId?: number }) {
  const out = candidateOutcome(c, events, runId)
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


const TONES: Record<string, string> = {
  emerald: 'bg-emerald-400/70 text-emerald-300',
  amber: 'bg-amber-400/70 text-amber-300',
  cyan: 'bg-cyan-400/70 text-cyan-300',
  zinc: 'bg-zinc-500/60 text-zinc-400',
  red: 'bg-red-400/70 text-red-300',
}

/** One funnel line: label, count, and a bar showing its share — so the split reads at a glance. */
function FunnelRow({ label, n, total, tone, sub }: {
  label: string; n: number; total: number; tone: string; sub?: string
}) {
  const pct = total > 0 ? Math.round((n / total) * 100) : 0
  const [bar, text] = (TONES[tone] ?? TONES.zinc).split(' ')
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className={cn('w-8 shrink-0 text-right text-[13px] font-semibold tabular-nums', text)}>{n}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-300">{label}</span>
        <span className="shrink-0 text-[10px] tabular-nums text-zinc-600">{pct}%</span>
      </div>
      <div className="ml-10 mt-0.5 h-1 overflow-hidden rounded-full bg-zinc-700/40">
        <div className={cn('h-full rounded-full', bar)} style={{ width: `${pct}%` }} />
      </div>
      {sub && <p className="ml-10 mt-0.5 text-[10px] leading-snug text-zinc-600">{sub}</p>}
    </div>
  )
}

function CandidateRow({ c, events, runId }: { c: DjcCandidateRow; events: DjcEvent[]; runId?: number }) {
  const [open, setOpen] = useState(false)
  const out = candidateOutcome(c, events, runId)
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
        {viewSpent(c) ? (
          <span
            className="shrink-0 whitespace-nowrap rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/25"
            title="A Profile View was spent on this candidate"
          >
            1 VIEW
          </span>
        ) : (
          <span
            className="shrink-0 whitespace-nowrap rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-500/25"
            title="Decided from free list-view data — no Profile View spent"
          >
            FREE
          </span>
        )}
        <div className="flex shrink-0 flex-col items-end">
          <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium ring-1', OUTCOME_STYLE[out.kind])}>{out.label}</span>
          {out.sub && <span className="mt-0.5 text-[10px] text-zinc-600">{out.sub}</span>}
        </div>
      </div>
      {open && <CandidateDetail c={c} events={events} runId={runId} />}
    </div>
  )
}

/* Collapsible outcome group — collapsed by default so runs stay short/scannable. */
function CandidateGroup({ kind, title, rows, eventsBy, runId }: { kind: OutcomeKind; title: string; rows: DjcCandidateRow[]; eventsBy: Map<string, DjcEvent[]>; runId?: number }) {
  const [open, setOpen] = useState(false)
  const dot = kind === 'new' ? 'bg-cyan-400' : kind === 'created' ? 'bg-emerald-400' : kind === 'skipped' ? 'bg-amber-400' : kind === 'error' ? 'bg-red-400' : 'bg-zinc-500'
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-zinc-700/20">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cn('shrink-0 text-zinc-600 transition-transform', open && 'rotate-90')}><path d="m9 18 6-6-6-6" /></svg>
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} />
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">{title}</span>
        <span className="text-[11px] text-zinc-600">· {rows.length}</span>
      </button>
      {open && <div className="mt-1.5 space-y-1.5 pl-1">{rows.map(c => <CandidateRow key={c.candidateId} c={c} events={eventsBy.get(c.candidateId) ?? []} runId={runId} />)}</div>}
    </div>
  )
}

/* ── Run detail ───────────────────────────────────────────────────────── */

function RunActivity({ events }: { events: DjcEvent[] }) {
  if (events.length === 0) return null
  return (
    <div className="rounded-lg bg-zinc-900/50 px-4 py-3 ring-1 ring-zinc-700/40">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-600">Run activity</p>
      <ol className="space-y-1.5">
        {events.map(e => (
          <li key={e.id} className="flex items-center gap-2 text-[12px]">
            <span className={cn('h-1 w-1 rounded-full', e.level === 'error' ? 'bg-red-500' : e.level === 'warn' ? 'bg-amber-500' : 'bg-zinc-600')} />
            <span className="text-zinc-400">{EVENT_COPY[e.eventType] ?? e.eventType.replace(/_/g, ' ')}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function RunDetailBody({ run, bundle }: { run: DjcRunDetail; bundle: DjcRunDetailBundle }) {
  const eventsBy = new Map<string, DjcEvent[]>()
  const runEvents = bundle.events.filter(e => e.candidateId == null)
  for (const e of bundle.events) { if (!e.candidateId) continue; const a = eventsBy.get(e.candidateId) ?? []; a.push(e); eventsBy.set(e.candidateId, a) }
  // Every OutcomeKind must have a group. 'blocked' was missing, so quota-blocked candidates fell
  // through find() and vanished — the groups then failed to sum to the number processed.
  const groups: { key: OutcomeKind; title: string; rows: DjcCandidateRow[] }[] = [
    { key: 'error', title: 'Errored — not checked', rows: [] },
    { key: 'created', title: 'Added to Salesforce', rows: [] },
    { key: 'exists', title: 'Already in Salesforce — no view needed', rows: [] },
    { key: 'skipped', title: 'No contact details found', rows: [] },
    { key: 'blocked', title: 'Blocked by the views quota — not checked', rows: [] },
    { key: 'new', title: 'Ready for Salesforce (held — test mode)', rows: [] },
  ]
  for (const c of bundle.candidates) groups.find(g => g.key === candidateOutcome(c, eventsBy.get(c.candidateId) ?? [], run.id).kind)?.rows.push(c)
  const errorRows = groups[0].rows
  const processed = bundle.candidates.length
  const viewsUsed = bundle.candidates.filter(viewSpent).length
  // Errored candidates were never decided, so they belong in neither "decided free" nor the
  // view-spent branches — without pulling them out, a page timeout read as a free decision.
  const erroredFree = errorRows.filter(c => !viewSpent(c)).length
  const erroredPaid = errorRows.length - erroredFree
  const freeDecisions = processed - viewsUsed - erroredFree
  const paid = bundle.candidates.filter(viewSpent)
  const addedCount = paid.filter(c => c.createdThisRun).length
  const dupAfterView = paid.filter(c => c.matchedThisRun && !c.createdThisRun).length
  const noContact = paid.length - addedCount - dupAfterView - erroredPaid
  const specialties = run.targets ? run.targets.split(',').length : 0

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-zinc-900/50 px-4 py-4 ring-1 ring-zinc-700/40">
        {/* One funnel, derived from the SAME candidate list as the groups below, so every number
            here reconciles. The run's own rollup counters are deliberately not mixed in — they
            count different things and reading them side by side is what made this unreadable. */}
        {run.status === 'running' && !run.finishedAt && (
          <p className="mb-3 rounded-md border border-cyan-500/25 bg-cyan-500/[0.07] px-3 py-2 text-[12px] text-cyan-200">
            This run is still going — the numbers below are partial and will keep changing.
          </p>
        )}
        <p className="text-[13px] leading-relaxed text-zinc-300">
          Scanned <span className="font-semibold text-white">{run.candidatesSeen.toLocaleString()}</span> listings
          {specialties ? <> across <span className="font-semibold text-white">{specialties}</span> specialties</> : null}
          {' '}(free) → worked through <span className="font-semibold text-white">{processed}</span> candidate{processed === 1 ? '' : 's'}.
        </p>

        <div className="mt-3 space-y-1.5">
          <FunnelRow
            label="Decided free — no Profile View spent"
            n={freeDecisions}
            total={processed}
            tone="emerald"
            sub="already in Salesforce by profile link or name, or blocked before the reveal"
          />
          {errorRows.length > 0 && (
            <FunnelRow
              label="Errored — not checked"
              n={errorRows.length}
              total={processed}
              tone="red"
              sub="a page failed to load or a step errored partway — nothing was decided"
            />
          )}
          <FunnelRow
            label="Profile Views spent"
            n={viewsUsed}
            total={processed}
            tone="amber"
            sub="the only step that costs — one view each"
          />
          <div className="border-l-2 border-zinc-700/60 pl-3 ml-1 space-y-1.5 pt-0.5">
            <FunnelRow label="→ added to Salesforce" n={addedCount} total={viewsUsed || 1} tone="cyan" />
            <FunnelRow label="→ turned out already on file" n={dupAfterView} total={viewsUsed || 1} tone="zinc" />
            <FunnelRow label="→ no contact details found" n={noContact} total={viewsUsed || 1} tone="zinc" />
          </div>
        </div>
        <div className="mt-4 hidden grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric value={run.candidatesSeen} label="reviewed" />
        </div>
        {run.writeMode !== 'live' && <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300/90 ring-1 ring-amber-500/20"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />Test mode — no records were created or changed in Salesforce</p>}
      </div>
      <RunActivity events={runEvents} />
      {bundle.candidates.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-zinc-600">No candidates were in scope for this run.</p>
      ) : (
        <div className="space-y-1">
          {groups.filter(g => g.rows.length).map(g => <CandidateGroup key={g.key} kind={g.key} title={g.title} rows={g.rows} eventsBy={eventsBy} runId={run.id} />)}
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

type DayHeader = { primary: string; secondary: string; isToday: boolean; recent: boolean }
function dayHeader(iso: string): DayHeader {
  const key = etDayKey(iso)
  const todayKey = new Date().toLocaleDateString('en-US', ET)
  const yesterdayKey = new Date(Date.now() - 86_400_000).toLocaleDateString('en-US', ET)
  const d = new Date(iso)
  const secondary = d.toLocaleDateString('en-US', { ...ET, month: 'short', day: 'numeric' })
  if (key === todayKey) return { primary: 'Today', secondary, isToday: true, recent: true }
  if (key === yesterdayKey) return { primary: 'Yesterday', secondary, isToday: false, recent: true }
  return { primary: d.toLocaleDateString('en-US', { ...ET, weekday: 'long' }), secondary, isToday: false, recent: false }
}

/** A day's headline numbers — what the header has to say while the runs underneath are folded away. */
type DayStats = {
  runs: number
  newCount: number
  duplicates: number
  views: number
  noContact: number
  errors: number       // unresolved only; recovered failures are not the day's story
  landed: number | null // % of Profile Views that became a Salesforce contact — the efficiency number
}
function dayStats(runs: DjcRunDetail[]): DayStats {
  const sum = (f: (r: DjcRunDetail) => number) => runs.reduce((s, r) => s + f(r), 0)
  const newCount = sum(r => r.created + r.createSkippedGuard)
  const views = sum(r => r.viewsSpent)
  const fromViews = sum(r => r.createdFromViews)
  return {
    runs: runs.length,
    newCount,
    duplicates: sum(r => r.duplicates),
    views,
    noContact: sum(r => r.uncontactable),
    errors: sum(r => r.unresolvedErrorCount),
    // Views are the scarce resource — 750 a month — so what a day's views bought is the number
    // that actually says whether the day went well. Undefined with no views: 0/0 is not 0%.
    landed: views > 0 ? Math.round((fromViews / views) * 100) : null,
  }
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

/* One grid for the column header and every day row, so the numbers stack into scannable columns
   instead of drifting with the width of the day's label. Zero renders as a dim dash rather than
   being dropped — an omitted chip shifts everything after it and breaks the column. */
// Column counts must match the number of VISIBLE cells at each breakpoint — cells marked sm-only
// are display:none below sm, so they leave the grid entirely rather than wrapping.
//
// Phone layout keeps only New / Views / Landed. The old one asked for ~390px of row before the
// card's own padding, which a 375px phone cannot give: the columns overflowed the card. Everything
// fixed here totals 150px, so the label column can shrink to nothing and still fit a 320px screen.
const DAY_GRID =
  'grid items-center gap-x-1.5 sm:gap-x-2 ' +
  'grid-cols-[14px_minmax(0,1fr)_40px_40px_44px_12px] ' +
  'sm:grid-cols-[14px_minmax(120px,1fr)_repeat(4,52px)_60px_68px_52px_14px]'

function DayCell({ children, className, title }: { children?: React.ReactNode; className?: string; title?: string }) {
  return <span className={cn('text-right text-[11px] tabular-nums', className)} title={title}>{children}</span>
}
const dash = <span className="text-zinc-700">–</span>

function DayColumnHeader() {
  return (
    <div className={cn(DAY_GRID, 'px-1 text-[9px] uppercase tracking-wider text-zinc-600')}>
      <span />
      <span />
      <span className="hidden text-right sm:block">Runs</span>
      <span className="text-right">New</span>
      <span className="hidden text-right sm:block">In SF</span>
      <span className="text-right">Views</span>
      <span className="text-right">Landed</span>
      <span className="hidden text-right sm:block">No contact</span>
      <span className="hidden text-right sm:block">Errors</span>
      <span />
    </div>
  )
}

/**
 * One day of runs. Today and yesterday open on arrival — that is the view you want without
 * clicking; everything older folds to a single summary line you can open when you need it.
 */
function DayGroup({ header, runs }: { header: DayHeader; runs: DjcRunDetail[] }) {
  const [open, setOpen] = useState(header.recent)
  const s = dayStats(runs)

  return (
    <div className="space-y-1.5">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(DAY_GRID, 'group w-full rounded px-1 py-1 text-left transition-colors hover:bg-zinc-800/40')}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
             strokeLinecap="round" strokeLinejoin="round"
             className={cn('shrink-0 text-zinc-600 transition-transform group-hover:text-zinc-400', open && 'rotate-90')}>
          <path d="m9 18 6-6-6-6" />
        </svg>
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className={cn('truncate text-[12px] font-semibold', header.isToday ? 'text-cyan-300' : 'text-zinc-300')}>{header.primary}</span>
          <span className="shrink-0 text-[11px] text-zinc-600">{header.secondary}</span>
          {s.errors > 0 && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500 sm:hidden"
                  title={`${s.errors} unresolved error${s.errors === 1 ? '' : 's'}`} />
          )}
        </span>
        <DayCell className="hidden text-zinc-600 sm:block">{s.runs}</DayCell>
        <DayCell className={s.newCount > 0 ? 'font-semibold text-cyan-300' : ''}>{s.newCount || dash}</DayCell>
        <DayCell className="hidden text-zinc-500 sm:block">{s.duplicates || dash}</DayCell>
        <DayCell className={s.views > 0 ? 'text-amber-300/80' : ''}>{s.views || dash}</DayCell>
        <DayCell
          className={cn('font-semibold',
            s.landed === null ? '' : s.landed >= 50 ? 'text-emerald-300' : s.landed >= 25 ? 'text-zinc-300' : 'text-zinc-500')}
          title="Share of the day's Profile Views that became a Salesforce contact"
        >
          {s.landed === null ? dash : `${s.landed}%`}
        </DayCell>
        <DayCell className="hidden text-zinc-600 sm:block">{s.noContact || dash}</DayCell>
        <DayCell className={cn('hidden sm:block', s.errors > 0 ? 'font-semibold text-red-400' : '')}>{s.errors || dash}</DayCell>
        <span />
      </button>
      {open && (
        <div className="overflow-hidden rounded-xl ring-1 ring-zinc-700/40 divide-y divide-zinc-800/70">
          {runs.map(run => <RunRow key={run.id} run={run} label={timeLabel(run.startedAt)} />)}
        </div>
      )}
    </div>
  )
}

function RunRow({ run, label }: { run: DjcRunDetail; label: string }) {
  const [open, setOpen] = useState(false)
  const [bundle, setBundle] = useState<DjcRunDetailBundle | null>(null)
  const [loading, setLoading] = useState(false)
  const newCount = run.created + run.createSkippedGuard
  const interrupted = isDjcFailedStatus(run.status)
  const running = run.status === 'running' && !run.finishedAt
  const runLanded = run.viewsSpent > 0 ? Math.round((run.createdFromViews / run.viewsSpent) * 100) : null

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
      {/* Same grid as the day header, so a run's numbers sit under the same column labels. A run
          has no "runs" count, so that cell stays empty rather than showing a dash — a dash means
          "none of this metric", which would be a lie here. */}
      <button onClick={toggle} className={cn(DAY_GRID, 'w-full px-3 py-2 text-left transition-colors hover:bg-zinc-700/15')}>
        <StatusGlyph status={run.status} errorCount={run.unresolvedErrorCount} />
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-[12px] font-semibold text-zinc-100 tabular-nums">{time}</span>
          {interrupted ? (
            <span className="truncate text-[11px] text-red-400">
              did not finish — {run.unresolvedErrorCount > 0 ? 'errored partway' : 'interrupted'}
            </span>
          ) : running ? (
            /* A run in flight has counters that are still filling in. Reporting "no new candidates"
               against a half-written row read as a finished, empty run while the detail below
               already showed nine people added. */
            <span className="truncate text-[11px] text-cyan-300">running now</span>
          ) : run.errorCount > 0 ? (
            /* A failure a later run undid is history, not a fault — stated plainly rather than
               deleted, so the record stays honest without reading as a live problem. */
            <span className="truncate text-[11px] text-zinc-600" title="A step failed here and a later run redid it successfully">recovered</span>
          ) : null}
          {run.trigger === 'backfill' && <span className="shrink-0 rounded bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-medium text-violet-300 ring-1 ring-violet-500/25">recovery</span>}
          {run.writeMode !== 'live' && <span className="hidden shrink-0 rounded bg-zinc-700/30 px-1.5 py-0.5 text-[9px] text-zinc-500 sm:inline">test</span>}
          {!interrupted && !running && (
            <span className="hidden shrink-0 text-[11px] text-zinc-700 tabular-nums sm:inline">{formatDuration(run.durationSeconds)}</span>
          )}
        </span>
        <DayCell className="hidden sm:block" />
        <DayCell className={newCount > 0 ? 'font-semibold text-cyan-300' : ''}>{newCount || dash}</DayCell>
        <DayCell className="hidden text-zinc-500 sm:block">{run.duplicates || dash}</DayCell>
        <DayCell className={run.viewsSpent > 0 ? 'text-amber-300/80' : ''}>{run.viewsSpent || dash}</DayCell>
        <DayCell className={cn(runLanded === null ? '' : runLanded >= 50 ? 'text-emerald-300' : 'text-zinc-500')}
                 title="Share of this run's Profile Views that became a Salesforce contact">
          {runLanded === null ? dash : `${runLanded}%`}
        </DayCell>
        <DayCell className="hidden text-zinc-600 sm:block">{run.uncontactable || dash}</DayCell>
        <DayCell className={cn('hidden sm:block', run.unresolvedErrorCount > 0 ? 'font-semibold text-red-400' : '')}>
          {run.unresolvedErrorCount || dash}
        </DayCell>
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
          <DayColumnHeader />
          {groupRunsByDay(runs).map(g => <DayGroup key={g.key} header={g.header} runs={g.runs} />)}
        </div>
      )}
    </div>
  )
}
