import { isMohamedLedgerConfigured, mohamedQuery } from './mohamedDb'

// The pure progress helpers now live in a DB-free module so client
// components can import them; re-exported here so every existing importer
// (and test) keeps working unchanged.
export {
  PROGRESS_STAGES,
  describeRunProgress,
  parseRunProgress,
  type ProgressCounter,
  type ProgressStageCode,
  type ProgressState,
} from './mohamedRunProgress'

export type RunRequestStatus = 'pending' | 'claimed' | 'running' | 'done' | 'failed' | 'expired' | 'cancelled'

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
  cancelRequestedAt: string | null
  /** True when this request was uploaded with the Submission toggle on
   * (mohamed_run_requests.submit_mode, sql/012). Older rows: false. */
  submitMode: boolean
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
  cancel_requested_at: string | Date | null
  submit_mode?: boolean | null
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
    cancelRequestedAt: raw.cancel_requested_at ? iso(raw.cancel_requested_at) : null,
    submitMode: raw.submit_mode === true,
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

export class CancelError extends Error {}

/** Flags an in-flight request for cooperative cancellation — the VPS
 * poller (already mid-run) is the only thing that actually stops it; this
 * only sets the flag it watches for. Returns false (not an error) when
 * there's nothing to cancel: the request already finished, or a cancel is
 * already in flight. The `where` clause is the same guard the poller's SQL
 * enforces, so a stale double-click can't ever set the flag twice. */
export async function requestRunCancel(requestId: number, requestedBy: string): Promise<boolean> {
  if (!isMohamedLedgerConfigured) throw new CancelError('Mohamed database is not configured.')
  const rows = await mohamedQuery(sql => sql<{ id: number }[]>`
    update mohamed_run_requests
    set cancel_requested_at = now(), cancel_requested_by = ${requestedBy}
    where id = ${requestId}
      and status in ('pending', 'claimed', 'running')
      and cancel_requested_at is null
    returning id
  `)
  return rows.length > 0
}
