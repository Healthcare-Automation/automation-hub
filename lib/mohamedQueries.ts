import mohamedSql from './mohamedDb'
import {
  LEDGER_STAGES,
  type LedgerStage,
  type RunEvent,
  type RunLedgerSnapshot,
  type StageSummary,
} from './mohamedLedger'

export type RunRow = {
  run_id: string
  mode: string
  source: string
  period_start: string
  period_end: string
  started_at: string
  finished_at: string | null
  status: RunLedgerSnapshot['status']
  event_count: number
}

export type EventRow = Omit<RunEvent, 'detail'> & { detail: unknown }

export type RunHistoryItem = {
  runId: string
  mode: string
  source: string
  periodStart: string
  periodEnd: string
  startedAt: string
  finishedAt: string | null
  status: RunLedgerSnapshot['status']
  eventCount: number
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function day(value: unknown): string {
  return iso(value).slice(0, 10)
}

function stageSummaries(events: RunEvent[]): StageSummary[] {
  return LEDGER_STAGES.map(stage => {
    const own = events.filter(event => event.stage === stage)
    if (own.length === 0) return { stage, status: 'not_run', events: 0 }
    const statuses = new Set(own.map(event => event.status))
    const status = statuses.has('failed') ? 'failed' : statuses.has('blocked') ? 'blocked' : 'passed'
    return { stage, status, events: own.length }
  })
}

/** Pure: rebuild the Python `RunLedger.to_dict()` shape from DB rows. */
export function buildSnapshot(run: RunRow, rows: EventRow[]): RunLedgerSnapshot {
  const events: RunEvent[] = [...rows]
    .sort((a, b) => a.seq - b.seq)
    .map(row => ({
      run_id: row.run_id,
      seq: Number(row.seq),
      at: iso(row.at),
      stage: row.stage as LedgerStage,
      step: row.step,
      status: row.status,
      claim_ref: row.claim_ref,
      action: row.action,
      field: row.field,
      code: row.code,
      detail: (row.detail && typeof row.detail === 'object' ? row.detail : {}) as Record<string, number | string>,
      duration_ms: row.duration_ms === null ? null : Number(row.duration_ms),
    }))
  return {
    run_id: run.run_id,
    mode: run.mode,
    source: run.source,
    period_start: day(run.period_start),
    period_end: day(run.period_end),
    started_at: iso(run.started_at),
    finished_at: run.finished_at ? iso(run.finished_at) : null,
    status: run.status,
    stages: stageSummaries(events),
    first_failure: events.find(event => event.status === 'failed') ?? null,
    events,
  }
}

export function toHistoryItem(run: RunRow): RunHistoryItem {
  return {
    runId: run.run_id,
    mode: run.mode,
    source: run.source,
    periodStart: day(run.period_start),
    periodEnd: day(run.period_end),
    startedAt: iso(run.started_at),
    finishedAt: run.finished_at ? iso(run.finished_at) : null,
    status: run.status,
    eventCount: Number(run.event_count),
  }
}

export async function getMohamedRunHistory(limit = 20): Promise<RunHistoryItem[]> {
  const sql = mohamedSql
  if (!sql) return []
  const rows = await sql<RunRow[]>`
    select run_id, mode, source, period_start, period_end, started_at, finished_at, status, event_count
    from mohamed_runs
    order by started_at desc
    limit ${limit}
  `
  return rows.map(toHistoryItem)
}

export async function getMohamedLedger(runId?: string): Promise<RunLedgerSnapshot | null> {
  const sql = mohamedSql
  if (!sql) return null
  const runs = runId
    ? await sql<RunRow[]>`select * from mohamed_runs where run_id = ${runId} limit 1`
    : await sql<RunRow[]>`select * from mohamed_runs order by started_at desc limit 1`
  const run = runs[0]
  if (!run) return null
  const events = await sql<EventRow[]>`
    select run_id, seq, at, stage, step, status, claim_ref, action, field, code, detail, duration_ms
    from mohamed_run_events
    where run_id = ${run.run_id}
    order by seq asc
  `
  return buildSnapshot(run, events)
}
