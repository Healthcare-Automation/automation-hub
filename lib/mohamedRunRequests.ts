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
