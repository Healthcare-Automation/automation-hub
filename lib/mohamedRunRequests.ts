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
  }
}

/** Only one un-finished request in flight at a time — a second press while a run is still
 * pending/claimed/running would just queue behind it anyway, so this makes that visible
 * to the button instead of silently accepting duplicate clicks. */
export async function getInFlightRunRequest(): Promise<RunRequestRow | null> {
  if (!isMohamedLedgerConfigured) return null
  const rows = await mohamedQuery(sql => sql<RawRow[]>`
    select id, requested_at, requested_by, kind, status, claimed_at, finished_at, run_id, error_code
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
    select id, requested_at, requested_by, kind, status, claimed_at, finished_at, run_id, error_code
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
    returning id, requested_at, requested_by, kind, status, claimed_at, finished_at, run_id, error_code
  `)
  return toRow(rows[0])
}
