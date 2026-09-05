import { isMohamedLedgerConfigured, mohamedQuery } from './mohamedDb'
import {
  LEDGER_STAGES,
  type LedgerStage,
  type RunEvent,
  type RunLedgerSnapshot,
  type StageSummary,
} from './mohamedLedger'
import {
  OUTCOME_SIGNAL_STEPS,
  computeRunOutcome,
  type OutcomeSignal,
  type RunOutcome,
} from './mohamedRunSummary'

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
  /** Plain-English outcome (claims ready, visits blocked + why) used as the
   * headline of each run card. Additive and nullable: when the outcome
   * query degrades, the card falls back to fetching the run's ledger on
   * expand rather than showing nothing. */
  outcome?: RunOutcome | null
}

export type OutcomeSignalRow = OutcomeSignal & { run_id: string }

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


/** Failed events not superseded by that same claim later reaching review.
 *  Mirrors RunLedger.unrecovered_failures() on the VPS: a per-claim blip the
 *  continuation retry recovered from is history, not outcome. Run-level
 *  failures (no claim_ref) are never "recovered". */
export function unrecoveredFailures<T extends { status: string; step: string; claim_ref: string | null }>(events: T[]): T[] {
  const reached = new Set(events.filter(e => e.step === 'reached_review' && e.status === 'ok' && e.claim_ref).map(e => e.claim_ref as string))
  return events.filter(e => e.status === 'failed' && !(e.claim_ref && reached.has(e.claim_ref)))
}

/** The status a run SHOULD carry given its events. The stored column is a
 *  write-time snapshot; older ledgers (before 2026-09-03) wrote 'failed' for
 *  any failed event, including ones the run recovered from. Derive here so
 *  the hub never shows "Run stopped before it finished" over a run whose
 *  every claim reached review (live 2026-09-03, run 90a10026, 57/57). */
export function effectiveRunStatus(stored: RunLedgerSnapshot['status'], events: { status: string; step: string; claim_ref: string | null }[]): RunLedgerSnapshot['status'] {
  if (stored !== 'failed') return stored
  if (unrecoveredFailures(events).length > 0) return 'failed'
  // No real failure left: fall back to the same blocked/review_ready split the VPS uses.
  const reachedReview = events.some(e => e.step === 'reached_review' && e.status === 'ok')
  const anyBlocked = events.some(e => e.status === 'blocked')
  return reachedReview ? 'review_ready' : anyBlocked ? 'blocked' : 'review_ready'
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
    status: effectiveRunStatus(run.status, events),
    stages: stageSummaries(events),
    first_failure: unrecoveredFailures(events)[0] ?? null,
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

/** Pure: fold a flat, multi-run signal projection into one outcome per run. */
export function attachRunOutcomes(items: RunHistoryItem[], signals: OutcomeSignalRow[]): RunHistoryItem[] {
  const byRun = new Map<string, OutcomeSignal[]>()
  for (const signal of signals) {
    const bucket = byRun.get(signal.run_id) ?? []
    bucket.push(signal)
    byRun.set(signal.run_id, bucket)
  }
  return items.map(item => {
    const signals = byRun.get(item.runId) ?? []
    // The projection carries every failed event and every reached_review, which
    // is exactly what effectiveRunStatus needs.
    const status = effectiveRunStatus(item.status, signals)
    return { ...item, status, outcome: computeRunOutcome(status, signals, item.mode) }
  })
}

export async function getMohamedRunHistory(limit = 200): Promise<RunHistoryItem[]> {
  if (!isMohamedLedgerConfigured) return []
  const rows = await mohamedQuery(sql => sql<RunRow[]>`
    select run_id, mode, source, period_start, period_end, started_at, finished_at, status, event_count
    from mohamed_runs
    order by started_at desc
    limit ${limit}
  `)
  const items = rows.map(toHistoryItem)
  if (items.length === 0) return items

  // One extra round trip for the whole page of runs, not one per run: the
  // history cards lead with a human outcome ("12 claims ready for your
  // review"), and that needs a handful of counting events per run. The
  // projection is deliberately narrow — the counting steps plus anything
  // that failed — so a busy run's few hundred portal_action rows never
  // cross the wire here. Degrading is fine: RunHistory falls back to
  // fetching a run's full ledger when its outcome is missing.
  try {
    const runIds = items.map(item => item.runId)
    const signals = await mohamedQuery(sql => sql<OutcomeSignalRow[]>`
      select run_id, step, status, claim_ref, code, detail
      from mohamed_run_events
      where run_id in ${sql(runIds)}
        and (step in ${sql([...OUTCOME_SIGNAL_STEPS])} or status = 'failed')
      order by run_id, seq asc
    `)
    return attachRunOutcomes(items, signals)
  } catch {
    return items
  }
}

export async function getMohamedLedger(runId?: string): Promise<RunLedgerSnapshot | null> {
  if (!isMohamedLedgerConfigured) return null
  // Two queries (run row, then its events) instead of one join: mohamed_run_events
  // can be a few hundred rows for a busy run, and a join would repeat every run
  // column on every event row over the wire for no benefit — cheaper to fetch the
  // one run row separately. They still run back-to-back on the SAME awaited call
  // here, but this function itself now runs in parallel with getMohamedRunHistory
  // and getInFlightRunRequest (see app/mohamed/page.tsx's Promise.all), which is
  // where the real serialization was.
  const runs = runId
    ? await mohamedQuery(sql => sql<RunRow[]>`select * from mohamed_runs where run_id = ${runId} limit 1`)
    : await mohamedQuery(sql => sql<RunRow[]>`select * from mohamed_runs order by started_at desc limit 1`)
  const run = runs[0]
  if (!run) return null
  const events = await mohamedQuery(sql => sql<EventRow[]>`
    select run_id, seq, at, stage, step, status, claim_ref, action, field, code, detail, duration_ms
    from mohamed_run_events
    where run_id = ${run.run_id}
    order by seq asc
  `)
  return buildSnapshot(run, events)
}
