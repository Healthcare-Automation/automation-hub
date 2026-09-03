import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeAutoStop, describeBrowser, describeCommandOutcome, type BrowserCommandRow, type BrowserStatusRow } from '../lib/mohamedBrowserPresentation'

const NOW = new Date('2026-09-03T09:00:00Z')

function status(over: Partial<BrowserStatusRow> = {}): BrowserStatusRow {
  return {
    browserState: 'running',
    hcpfState: 'authenticated',
    browserSince: '2026-09-03T08:00:00Z',
    idleSince: '2026-09-03T08:00:00Z',
    autoStopAt: '2026-09-03T12:00:00Z',
    updatedAt: '2026-09-03T08:59:30Z',
    ...over,
  }
}

function command(over: Partial<BrowserCommandRow> = {}): BrowserCommandRow {
  return { id: 1, requestedAt: '2026-09-03T08:59:00Z', requestedBy: 'hub_admin', command: 'start', status: 'done', finishedAt: null, errorCode: null, ...over }
}

test('no status row yet reads as Off', () => {
  assert.equal(describeBrowser(null, null, false, NOW).tone, 'off')
})

test('a pending command wins over the stale status row', () => {
  const view = describeBrowser(status({ browserState: 'stopped', hcpfState: 'unknown' }), command({ status: 'pending' }), false, NOW)
  assert.equal(view.tone, 'starting')
  assert.equal(view.label, 'Starting…')
  const stopping = describeBrowser(status(), command({ command: 'stop', status: 'pending' }), false, NOW)
  assert.equal(stopping.label, 'Stopping…')
})

test('authenticated + idle shows Ready with the auto-stop time', () => {
  const view = describeBrowser(status(), null, false, NOW)
  assert.equal(view.tone, 'ready')
  assert.match(view.detail ?? '', /Stops on its own in 3h/)
})

test('a run in flight is busy and takes priority over portal state', () => {
  const view = describeBrowser(status({ hcpfState: 'reauthentication_required' }), null, true, NOW)
  assert.equal(view.tone, 'busy')
})

test('challenge_detected needs Andy', () => {
  assert.equal(describeBrowser(status({ hcpfState: 'challenge_detected' }), null, false, NOW).tone, 'attention')
})

test('any other running state is Signing in', () => {
  for (const s of ['reauthentication_required', 'stale_session', 'no_tab', 'discovery_incomplete']) {
    assert.equal(describeBrowser(status({ hcpfState: s }), null, false, NOW).label, 'Signing in…', s)
  }
})

test('auto-stop wording', () => {
  assert.equal(describeAutoStop('2026-09-03T09:00:30Z', NOW), 'in a minute')
  assert.equal(describeAutoStop('2026-09-03T09:25:00Z', NOW), 'in 25 min')
  assert.equal(describeAutoStop('2026-09-03T11:00:00Z', NOW), 'in 2h')
  assert.equal(describeAutoStop('2026-09-03T11:30:00Z', NOW), 'in 2h 30m')
})

test('rejected stop explains itself; done/pending say nothing', () => {
  assert.equal(describeCommandOutcome(command()), null)
  assert.equal(describeCommandOutcome(command({ status: 'pending' })), null)
  assert.match(describeCommandOutcome(command({ command: 'stop', status: 'rejected', errorCode: 'run_in_flight' })) ?? '', /run was in progress/)
  assert.match(describeCommandOutcome(command({ status: 'failed', errorCode: 'systemctl_failed' })) ?? '', /Could not start/)
})
