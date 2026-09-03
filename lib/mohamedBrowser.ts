import { isMohamedLedgerConfigured, mohamedQuery } from './mohamedDb'
import type { BrowserCommandRow, BrowserState, BrowserStatusRow } from './mohamedBrowserPresentation'

// Pure helpers live in a DB-free module so client components can import
// them; re-exported here so server code has one import.
export {
  describeAutoStop,
  describeBrowser,
  describeCommandOutcome,
  type BrowserCommandRow,
  type BrowserPresentation,
  type BrowserState,
  type BrowserStatusRow,
} from './mohamedBrowserPresentation'

/**
 * On-demand portal browser (Andy 2026-09-03). The Chrome session on the VPS
 * used to run 24/7 and collided with other agents until the server fell
 * over; billing is weekly, so the browser now runs only while needed. Same
 * no-inbound-port pattern as run requests: the hub INSERTs a command row,
 * the VPS poll tick (every ~1 min) executes it and rewrites the status row.
 * Schema: /root/projects/mohamed/sql/009_browser_control.sql.
 */

type RawStatus = {
  browser_state: string
  hcpf_state: string
  browser_since: string | Date | null
  idle_since: string | Date | null
  auto_stop_at: string | Date | null
  updated_at: string | Date
}

type RawCommand = {
  id: number
  requested_at: string | Date
  requested_by: string
  command: string
  status: string
  finished_at: string | Date | null
  error_code: string | null
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

function toStatus(raw: RawStatus): BrowserStatusRow {
  return {
    browserState: raw.browser_state as BrowserState,
    hcpfState: raw.hcpf_state,
    browserSince: raw.browser_since ? iso(raw.browser_since) : null,
    idleSince: raw.idle_since ? iso(raw.idle_since) : null,
    autoStopAt: raw.auto_stop_at ? iso(raw.auto_stop_at) : null,
    updatedAt: iso(raw.updated_at),
  }
}

function toCommand(raw: RawCommand): BrowserCommandRow {
  return {
    id: raw.id,
    requestedAt: iso(raw.requested_at),
    requestedBy: raw.requested_by,
    command: raw.command as BrowserCommandRow['command'],
    status: raw.status as BrowserCommandRow['status'],
    finishedAt: raw.finished_at ? iso(raw.finished_at) : null,
    errorCode: raw.error_code,
  }
}

export class BrowserNotMigratedError extends Error {}

function isUndefinedTable(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01'
}

/** Null when the poller has never written a status row yet (or the DB is unset). */
export async function getBrowserStatus(): Promise<BrowserStatusRow | null> {
  if (!isMohamedLedgerConfigured) return null
  try {
    const rows = await mohamedQuery(sql => sql<RawStatus[]>`
      select browser_state, hcpf_state, browser_since, idle_since, auto_stop_at, updated_at
      from mohamed_browser_status
      where id = 1
    `)
    return rows[0] ? toStatus(rows[0]) : null
  } catch (err) {
    if (isUndefinedTable(err)) throw new BrowserNotMigratedError('mohamed_browser_status is not migrated yet')
    throw err
  }
}

/** The most recent command, so the card can show "starting…" between the
 * click and the poller's next tick, and surface a rejected stop. */
export async function getLatestBrowserCommand(): Promise<BrowserCommandRow | null> {
  if (!isMohamedLedgerConfigured) return null
  try {
    const rows = await mohamedQuery(sql => sql<RawCommand[]>`
      select id, requested_at, requested_by, command, status, finished_at, error_code
      from mohamed_browser_commands
      order by requested_at desc
      limit 1
    `)
    return rows[0] ? toCommand(rows[0]) : null
  } catch (err) {
    if (isUndefinedTable(err)) throw new BrowserNotMigratedError('mohamed_browser_commands is not migrated yet')
    throw err
  }
}

export class BrowserCommandError extends Error {}

/** Enqueues start/stop. A pending command of ANY kind blocks a new one:
 * the poller drains all of them in order every tick, so a second press
 * within the same minute is only ever a double-click. */
export async function enqueueBrowserCommand(command: 'start' | 'stop', requestedBy: string): Promise<BrowserCommandRow> {
  if (!isMohamedLedgerConfigured) throw new BrowserCommandError('Mohamed database is not configured.')
  const rows = await mohamedQuery(sql => sql<RawCommand[]>`
    insert into mohamed_browser_commands (requested_by, command)
    select ${requestedBy}, ${command}
    where not exists (select 1 from mohamed_browser_commands where status = 'pending')
    returning id, requested_at, requested_by, command, status, finished_at, error_code
  `)
  if (!rows[0]) throw new BrowserCommandError('A browser command is already waiting for the runner — give it a minute.')
  return toCommand(rows[0])
}
