import { isMohamedLedgerConfigured, mohamedQuery } from './mohamedDb'

export type RunRequestStatus = 'pending' | 'claimed' | 'running' | 'done' | 'failed' | 'expired'

export type RunRequestRow = {
  id: number
  requestedAt: string
  requestedBy: string
  kind: 'fixture' | 'live'
  status: RunRequestStatus
  claimedAt: string | null
  finishedAt: string | null
  runId: string | null
  errorCode: string | null
  progress: string | null
  progressAt: string | null
}

type RawRow = {
  id: number
  requested_at: string | Date
  requested_by: string
  kind: string
  status: string
  claimed_at: string | Date | null
  finished_at: string | Date | null
  run_id: string | null
  error_code: string | null
  progress: string | null
  progress_at: string | Date | null
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

function toRow(raw: RawRow): RunRequestRow {
  return {
    id: raw.id,
    requestedAt: iso(raw.requested_at),
    requestedBy: raw.requested_by,
    kind: raw.kind as RunRequestRow['kind'],
    status: raw.status as RunRequestStatus,
    claimedAt: raw.claimed_at ? iso(raw.claimed_at) : null,
    finishedAt: raw.finished_at ? iso(raw.finished_at) : null,
    runId: raw.run_id,
    errorCode: raw.error_code,
    progress: raw.progress ?? null,
    progressAt: raw.progress_at ? iso(raw.progress_at) : null,
  }
}

/**
 * Human labels for the poller's machine progress codes
 * (mohamed repo, poll_worker.py `_progress`). Codes with a `:N_of_M` or
 * `:N` suffix get the count appended.
 */
export function describeRunProgress(progress: string | null): string | null {
  if (!progress) return null
  const [code, counter] = progress.split(':', 2)
  const labels: Record<string, string> = {
    waiting_for_portal_session: 'Portal session is being repaired automatically — run will start when it recovers',
    reading_csv: 'Reading the uploaded CSV',
    checking_portal_session: 'Checking the HCPF portal session',
    checking_eligibility: 'Checking member eligibility on HCPF',
    entering_claims_on_hcpf: 'Entering claims on the HCPF portal',
    claims_completed: 'Entering claims on the HCPF portal',
    saving_results: 'Saving results',
  }
  const label = labels[code] ?? code.replaceAll('_', ' ')
  if (!counter) return label
  const ofMatch = counter.match(/^(\d+)_of_(\d+)$/)
  if (ofMatch) return `${label} (${ofMatch[1]} of ${ofMatch[2]})`
  const plain = counter.match(/^(\d+)$/)
  if (plain) return `${label} (${plain[1]} done)`
  return label
}

export const PROGRESS_STAGES = [
  'reading_csv',
  'checking_portal_session',
  'checking_eligibility',
  'entering_claims_on_hcpf',
  'saving_results',
] as const
export type ProgressStageCode = (typeof PROGRESS_STAGES)[number]

const PROGRESS_STAGE_ALIASES: Record<string, ProgressStageCode> = {
  // The poller emits `claims_completed` when the last claim in the
  // entering_claims_on_hcpf stage finishes — same step, not a 6th stage.
  claims_completed: 'entering_claims_on_hcpf',
}

export type ProgressCounter = { done: number; total: number }
export type ProgressState = {
  paused: boolean
  stageIndex: number
  stageLabel: string
  counter: ProgressCounter | null
  percent: number
}

/** Structured view of a progress code for rendering a step list + percent
 * bar. `describeRunProgress` stays as the plain-text one-liner used
 * elsewhere; this is additive, not a replacement. */
export function parseRunProgress(progress: string | null): ProgressState | null {
  if (!progress) return null
  const [rawCode, counterPart] = progress.split(':', 2)

  if (rawCode === 'waiting_for_portal_session') {
    return { paused: true, stageIndex: -1, stageLabel: describeRunProgress(progress) ?? rawCode, counter: null, percent: 0 }
  }

  const code = PROGRESS_STAGE_ALIASES[rawCode] ?? (rawCode as ProgressStageCode)
  const stageIndex = PROGRESS_STAGES.indexOf(code)
  const ofMatch = counterPart?.match(/^(\d+)_of_(\d+)$/)
  const counter: ProgressCounter | null = ofMatch ? { done: Number(ofMatch[1]), total: Number(ofMatch[2]) } : null

  const stageCount = PROGRESS_STAGES.length
  let percent = 0
  if (stageIndex >= 0) {
    const fractionWithinStage = counter && counter.total > 0 ? counter.done / counter.total : 0.5
    percent = Math.round(((stageIndex + fractionWithinStage) / stageCount) * 100)
  }

  return {
    paused: false,
    stageIndex,
    stageLabel: describeRunProgress(progress) ?? rawCode.replaceAll('_', ' '),
    counter,
    percent: Math.min(100, Math.max(0, percent)),
  }
}

/** Only one un-finished request in flight at a time — a second press while a run is still
 * pending/claimed/running would just queue behind it anyway, so this makes that visible
 * to the button instead of silently accepting duplicate clicks. */
export async function getInFlightRunRequest(): Promise<RunRequestRow | null> {
  if (!isMohamedLedgerConfigured) return null
  const rows = await mohamedQuery(sql => sql<RawRow[]>`
    select *
    from mohamed_run_requests
    where status in ('pending', 'claimed', 'running')
    order by requested_at desc
    limit 1
  `)
  return rows[0] ? toRow(rows[0]) : null
}

export async function getLatestRunRequest(): Promise<RunRequestRow | null> {
  if (!isMohamedLedgerConfigured) return null
  const rows = await mohamedQuery(sql => sql<RawRow[]>`
    select *
    from mohamed_run_requests
    order by requested_at desc
    limit 1
  `)
  return rows[0] ? toRow(rows[0]) : null
}

export class EnqueueError extends Error {}

/** Enqueues a run request. Returns the new row. Throws EnqueueError if the table isn't
 * reachable/configured — callers should turn that into a clear "not set up yet" message,
 * not a silent no-op. */
export async function enqueueRunRequest(requestedBy: string, kind: 'fixture' | 'live'): Promise<RunRequestRow> {
  if (!isMohamedLedgerConfigured) throw new EnqueueError('Mohamed database is not configured.')
  const rows = await mohamedQuery(sql => sql<RawRow[]>`
    insert into mohamed_run_requests (requested_by, kind)
    values (${requestedBy}, ${kind})
    returning *
  `)
  return toRow(rows[0])
}
