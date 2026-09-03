// DB-free presentation helpers for the portal-browser card. Client
// components import from here; lib/mohamedBrowser.ts (postgres) re-exports.

export type BrowserState = 'running' | 'stopped'

export type BrowserStatusRow = {
  browserState: BrowserState
  /** Session-keeper state code: authenticated, reauthentication_required,
   * stale_session, challenge_detected, no_tab, unknown (browser off). */
  hcpfState: string
  browserSince: string | null
  idleSince: string | null
  autoStopAt: string | null
  updatedAt: string
}

export type BrowserCommandRow = {
  id: number
  requestedAt: string
  requestedBy: string
  command: 'start' | 'stop'
  status: 'pending' | 'done' | 'failed' | 'rejected'
  finishedAt: string | null
  errorCode: string | null
}

export type BrowserPresentation = {
  tone: 'off' | 'starting' | 'ready' | 'attention' | 'busy'
  label: string
  detail: string | null
}

/**
 * One line the card shows. Rules, in priority order:
 *  - a pending command wins (the user just clicked, the poller hasn't ticked)
 *  - browser off -> "Off"
 *  - a run in flight -> "Running a batch" (stop disabled)
 *  - challenge_detected -> needs Andy (CAPTCHA/MFA), nothing automatic clears it
 *  - authenticated -> "Ready", with the auto-stop time when idle
 *  - anything else while running -> "Signing in…" (the keeper is on it)
 */
export function describeBrowser(
  status: BrowserStatusRow | null,
  latest: BrowserCommandRow | null,
  runInFlight: boolean,
  now: Date = new Date(),
): BrowserPresentation {
  if (latest?.status === 'pending') {
    return latest.command === 'start'
      ? { tone: 'starting', label: 'Starting…', detail: 'The runner picks this up within a minute.' }
      : { tone: 'starting', label: 'Stopping…', detail: 'The runner picks this up within a minute.' }
  }
  if (!status || status.browserState === 'stopped') {
    return { tone: 'off', label: 'Off', detail: 'Start it before uploading a billing report. Chrome only runs while you need it.' }
  }
  if (runInFlight) {
    return { tone: 'busy', label: 'Running a batch', detail: 'Stop is disabled until the run finishes.' }
  }
  if (status.hcpfState === 'challenge_detected') {
    return { tone: 'attention', label: 'Needs sign-in help', detail: 'The portal is asking for a CAPTCHA or MFA code. Andy has to clear it.' }
  }
  if (status.hcpfState === 'authenticated') {
    return {
      tone: 'ready',
      label: 'Ready',
      detail: status.autoStopAt
        ? `Signed in to HCPF. Stops on its own ${describeAutoStop(status.autoStopAt, now)} if unused.`
        : 'Signed in to HCPF.',
    }
  }
  return { tone: 'starting', label: 'Signing in…', detail: 'Chrome is up; the session keeper is logging in to HCPF (about 2 minutes).' }
}

export function describeAutoStop(autoStopAt: string, now: Date = new Date()): string {
  const ms = new Date(autoStopAt).getTime() - now.getTime()
  const mins = Math.round(ms / 60_000)
  if (mins <= 1) return 'in a minute'
  if (mins < 60) return `in ${mins} min`
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  return rest ? `in ${hours}h ${rest}m` : `in ${hours}h`
}

export function describeCommandOutcome(latest: BrowserCommandRow | null): string | null {
  if (!latest || latest.status === 'pending' || latest.status === 'done') return null
  if (latest.errorCode === 'run_in_flight') return 'Stop was refused: a billing run was in progress. Try again when it finishes.'
  if (latest.errorCode === 'systemctl_failed') return `Could not ${latest.command} the browser on the VPS. Andy needs to check the server.`
  return `The last ${latest.command} request ${latest.status}${latest.errorCode ? ` (${latest.errorCode})` : ''}.`
}
