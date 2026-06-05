'use client'

import { useState } from 'react'
import type { DjcRunDetail, DjcRunDetailBundle, DjcEvent, DjcCandidateRow } from '@/lib/djcTypes'
import { cn, formatDuration, formatRelativeTime } from '@/lib/utils'

const LEVEL_DOT: Record<string, string> = { info: 'bg-zinc-500', warn: 'bg-amber-500', error: 'bg-red-500' }
const LEVEL_TEXT: Record<string, string> = { info: 'text-zinc-400', warn: 'text-amber-400', error: 'text-red-400' }

const RUN_STATUS: Record<string, { label: string; cls: string }> = {
  ok: { label: 'Completed', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  running: { label: 'Running', cls: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  error: { label: 'Error', cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
  session_expired: { label: 'Re-auth', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
}

function humanize(s: string): string {
  return s.replace(/_/g, ' ')
}

function Chip({ label, value, tone = 'zinc' }: { label: string; value: number; tone?: string }) {
  if (!value) return null
  const tones: Record<string, string> = {
    zinc: 'text-zinc-300 bg-zinc-700/40',
    cyan: 'text-cyan-300 bg-cyan-500/10',
    amber: 'text-amber-300 bg-amber-500/10',
    red: 'text-red-300 bg-red-500/10',
    emerald: 'text-emerald-300 bg-emerald-500/10',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums', tones[tone])}>
      <span className="font-semibold">{value}</span>
      <span className="opacity-70">{label}</span>
    </span>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</p>
      <p className="text-xs text-zinc-300 truncate" title={value ?? ''}>{value || '—'}</p>
    </div>
  )
}

function PayloadView({ payload }: { payload: Record<string, unknown> | null }) {
  if (!payload || Object.keys(payload).length === 0) return null
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[10px] text-zinc-600 hover:text-zinc-400">payload</summary>
      <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-black/40 p-2 text-[10px] leading-relaxed text-zinc-400">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  )
}

function EventRow({ e }: { e: DjcEvent }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', LEVEL_DOT[e.level])} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {e.stage && (
            <span className="rounded bg-zinc-700/40 px-1 py-px text-[9px] uppercase tracking-wide text-zinc-500">
              {e.stage}
            </span>
          )}
          <span className={cn('text-xs font-medium', LEVEL_TEXT[e.level])}>{humanize(e.eventType)}</span>
          {e.message && <span className="truncate text-[11px] text-zinc-500">— {e.message}</span>}
        </div>
        <PayloadView payload={e.payload} />
      </div>
    </div>
  )
}

function CandidateCard({ candidate, events }: { candidate: DjcCandidateRow; events: DjcEvent[] }) {
  const isNew = candidate.dedupStatus === 'new'
  const dedupBadge = isNew
    ? 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20'
    : candidate.dedupStatus === 'duplicate'
      ? 'text-zinc-400 bg-zinc-700/30 border-zinc-600/40'
      : 'text-amber-300 bg-amber-500/10 border-amber-500/20'
  return (
    <div className="rounded-lg border border-zinc-700/40 bg-zinc-800/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{candidate.name || candidate.candidateId}</p>
          <p className="text-[11px] text-zinc-500">{candidate.target}</p>
        </div>
        <span className={cn('shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium', dedupBadge)}>
          {candidate.dedupStatus === 'duplicate'
            ? `exists · ${candidate.dedupReason}`
            : candidate.dedupStatus === 'new'
              ? 'new'
              : 'uncontactable'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
        <Field label="Phone" value={candidate.phone} />
        <Field label="Email" value={candidate.email} />
        <Field label="Source" value={candidate.contactSource} />
        <Field label="CV" value={candidate.cvFilename} />
        <Field label="City" value={candidate.mailingCity} />
        <Field label="State" value={candidate.mailingState} />
        <Field label="Zip" value={candidate.mailingPostalCode} />
        <Field label="Licenses" value={candidate.stateLicenses} />
        <Field label="Position" value={candidate.positionTypes} />
        <Field label="Preferred" value={candidate.preferredStates} />
        {candidate.matchCount != null && <Field label="Matches" value={String(candidate.matchCount)} />}
        {candidate.sfContactId && <Field label="SF Contact" value={candidate.sfContactId} />}
      </div>

      {events.length > 0 && (
        <div className="mt-2 border-t border-zinc-700/40 pt-1.5">
          {events.map(e => <EventRow key={e.id} e={e} />)}
        </div>
      )}
    </div>
  )
}

function RunDetailBody({ bundle }: { bundle: DjcRunDetailBundle }) {
  const runLevel = bundle.events.filter(e => !e.candidateId)
  const byCandidate = new Map<string, DjcEvent[]>()
  for (const e of bundle.events) {
    if (!e.candidateId) continue
    const arr = byCandidate.get(e.candidateId) ?? []
    arr.push(e)
    byCandidate.set(e.candidateId, arr)
  }
  // Candidates with grabbed data first; then any candidate that has events but no saved row.
  const seen = new Set(bundle.candidates.map(c => c.candidateId))
  const orphanIds = [...byCandidate.keys()].filter(id => !seen.has(id))

  return (
    <div className="space-y-3">
      {runLevel.length > 0 && (
        <div className="rounded-lg border border-zinc-700/40 bg-black/20 px-3 py-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">Run events</p>
          {runLevel.map(e => <EventRow key={e.id} e={e} />)}
        </div>
      )}
      {bundle.candidates.map(c => (
        <CandidateCard key={c.candidateId} candidate={c} events={byCandidate.get(c.candidateId) ?? []} />
      ))}
      {orphanIds.map(id => (
        <div key={id} className="rounded-lg border border-zinc-700/40 bg-zinc-800/20 p-3">
          <p className="mb-1 text-xs font-medium text-zinc-400">Candidate {id}</p>
          {(byCandidate.get(id) ?? []).map(e => <EventRow key={e.id} e={e} />)}
        </div>
      ))}
      {bundle.candidates.length === 0 && orphanIds.length === 0 && (
        <p className="px-2 py-4 text-center text-xs text-zinc-600">No candidate events for this run.</p>
      )}
    </div>
  )
}

function RunRow({ run }: { run: DjcRunDetail }) {
  const [open, setOpen] = useState(false)
  const [bundle, setBundle] = useState<DjcRunDetailBundle | null>(null)
  const [loading, setLoading] = useState(false)
  const status = RUN_STATUS[run.status] ?? RUN_STATUS.ok

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
    <div className="rounded-lg border border-zinc-700/40 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-zinc-700/20 transition-colors"
      >
        <span className="text-xs text-zinc-500 tabular-nums w-10">#{run.id}</span>
        <span className={cn('shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium', status.cls)}>
          {status.label}
        </span>
        {run.writeMode === 'off' && (
          <span className="shrink-0 rounded-md border border-zinc-600/40 bg-zinc-700/20 px-1.5 py-0.5 text-[10px] text-zinc-400">
            read-only
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-zinc-300">
            {formatRelativeTime(run.startedAt)} · {formatDuration(run.durationSeconds)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Chip label="seen" value={run.candidatesSeen} />
            <Chip label="selected" value={run.candidatesSelected} tone="cyan" />
            <Chip label="contactable" value={run.contactable} tone="emerald" />
            <Chip label="dup" value={run.duplicates} />
            <Chip label="new" value={run.createSkippedGuard} tone="cyan" />
            <Chip label="created" value={run.created} tone="emerald" />
            <Chip label="uncontactable" value={run.uncontactable} tone="amber" />
            <Chip label="warn" value={run.warnCount} tone="amber" />
            <Chip label="err" value={run.errorCount} tone="red" />
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={cn('shrink-0 text-zinc-500 transition-transform', open && 'rotate-180')}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-zinc-700/40 bg-black/20 p-2.5">
          {loading ? (
            <p className="px-2 py-4 text-center text-xs text-zinc-600">Loading run detail…</p>
          ) : bundle ? (
            <RunDetailBody bundle={bundle} />
          ) : null}
        </div>
      )}
    </div>
  )
}

export default function DjcRunBreakdown({ runs }: { runs: DjcRunDetail[] }) {
  if (runs.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-zinc-600">No runs yet.</p>
  }
  return (
    <div className="space-y-2">
      {runs.map(run => <RunRow key={run.id} run={run} />)}
    </div>
  )
}
