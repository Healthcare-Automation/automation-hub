/**
 * Pure helpers for the live per-member progress board.
 *
 * The VPS runner publishes a board at `GET {uploadUrl}/progress` while a run
 * is in flight: one entry per member (patient) with a machine state string.
 * Everything in here is parsing + translation only — no fetching, no React,
 * no DB — so it stays testable and safe to import from the browser bundle.
 *
 * Machine vocabulary (mohamed repo, progress board writer):
 *   waiting | checking_coverage | covered | no_coverage | lookup_failed |
 *   entering_claim | step:<label> | review_reached | claim_failed | blocked
 * Anything outside that list degrades to a readable phrase rather than
 * rendering a raw code at a non-technical reader.
 */

export type LivePhase = 'starting' | 'checking_coverage' | 'entering_claims' | 'finished' | 'failed' | 'cancelled'

export type LiveMember = {
  /** The member id is the human identifier — the only member data on this board. */
  memberId: string
  state: string
  /** claimRef -> per-claim state; used only for the "N claims" hint. */
  claims: Record<string, string>
}

export type LiveBoard = {
  requestId: number | null
  runId: string | null
  phase: string
  updatedAt: string | null
  members: LiveMember[]
  /** True claim counts from the runner (claim_assembly's actual output),
   * not derived from member count — a member can have more than one claim.
   * Both null until claim_assembly has run (nothing to show yet). */
  totalClaims: number | null
  claimsEntered: number
}

/** How far a member has got, per leg of the journey the client cares about. */
export type LegState = 'pending' | 'active' | 'done' | 'warn' | 'fail' | 'skipped'

export type StateTone = 'zinc' | 'blue' | 'emerald' | 'amber' | 'red'

export type MemberView = {
  label: string
  tone: StateTone
  /** True while the automation is actively working this member — drives the pulse. */
  busy: boolean
  /** Coverage → Claim entry → Review. */
  legs: [LegState, LegState, LegState]
  /** 0..1 share of this member's work that is behind them; terminal states count as 1. */
  weight: number
  /** Which summary bucket this member falls in. */
  bucket: 'waiting' | 'inProgress' | 'ready' | 'heldBack' | 'failed'
}

export const LEG_LABELS = ['Coverage', 'Claim entry', 'Review'] as const

const STEP_NAMES: Record<string, string> = {
  '01-member-info': 'member info',
  '02-diagnosis': 'diagnosis',
  '99-review': 'review',
  '99-failure': 'failure',
}

const SERVICE_LINE = /^03-service-line-(\d+)$/

/** "01-member-info" -> "member info", "03-service-line-2" -> "service line 2". */
export function describeStepLabel(label: string): string {
  if (STEP_NAMES[label]) return STEP_NAMES[label]
  const line = SERVICE_LINE.exec(label)
  if (line) return `service line ${line[1]}`
  return label.replace(/^\d+-/, '').replaceAll('-', ' ')
}

/** How far through the claim wizard a step label sits, 0..1 within the claim leg. */
function stepFraction(label: string): number {
  if (label.startsWith('01-')) return 0.2
  if (label.startsWith('02-')) return 0.45
  if (SERVICE_LINE.test(label)) return 0.7
  if (label.startsWith('99-')) return 0.95
  return 0.5
}

const WAITING: MemberView = {
  label: 'Waiting',
  tone: 'zinc',
  busy: false,
  legs: ['pending', 'pending', 'pending'],
  weight: 0,
  bucket: 'waiting',
}

/**
 * Translates one machine member state into everything the row needs to
 * render: plain-English label, colour, the three-leg tracker, and which
 * summary bucket it counts toward.
 */
export function describeMemberState(state: string): MemberView {
  if (state.startsWith('step:')) {
    const step = state.slice('step:'.length)
    return {
      label: `Entering claim — ${describeStepLabel(step)}`,
      tone: 'blue',
      busy: true,
      legs: ['done', 'active', 'pending'],
      weight: 0.5 + 0.45 * stepFraction(step),
      bucket: 'inProgress',
    }
  }

  switch (state) {
    case 'waiting':
      return WAITING
    case 'checking_coverage':
      return {
        label: 'Checking coverage…',
        tone: 'blue',
        busy: true,
        legs: ['active', 'pending', 'pending'],
        weight: 0.15,
        bucket: 'inProgress',
      }
    case 'covered':
      return {
        label: 'Coverage confirmed',
        tone: 'emerald',
        busy: false,
        legs: ['done', 'pending', 'pending'],
        weight: 0.35,
        bucket: 'inProgress',
      }
    case 'no_coverage':
      return {
        label: 'Missing required coverage',
        tone: 'amber',
        busy: false,
        legs: ['warn', 'skipped', 'skipped'],
        weight: 1,
        bucket: 'heldBack',
      }
    case 'lookup_failed':
      return {
        label: 'Coverage check failed',
        tone: 'red',
        busy: false,
        legs: ['fail', 'skipped', 'skipped'],
        weight: 1,
        bucket: 'failed',
      }
    case 'entering_claim':
      return {
        label: 'Entering claim…',
        tone: 'blue',
        busy: true,
        legs: ['done', 'active', 'pending'],
        weight: 0.5,
        bucket: 'inProgress',
      }
    case 'review_reached':
      return {
        label: 'Claim ready for review',
        tone: 'emerald',
        busy: false,
        legs: ['done', 'done', 'done'],
        weight: 1,
        bucket: 'ready',
      }
    case 'claim_failed':
      return {
        label: 'Claim entry failed',
        tone: 'red',
        busy: false,
        legs: ['done', 'fail', 'skipped'],
        weight: 1,
        bucket: 'failed',
      }
    case 'blocked':
      return {
        label: 'Held back by billing rules',
        tone: 'amber',
        busy: false,
        legs: ['done', 'warn', 'skipped'],
        weight: 1,
        bucket: 'heldBack',
      }
    default:
      // A state this build doesn't know about is still readable, and is
      // treated as in-flight rather than silently counted as finished.
      return {
        label: state.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase()),
        tone: 'zinc',
        busy: false,
        legs: ['pending', 'pending', 'pending'],
        weight: 0,
        bucket: 'inProgress',
      }
  }
}

const PHASE_LABELS: Record<LivePhase, string> = {
  starting: 'Getting started',
  checking_coverage: 'Checking coverage for each client',
  entering_claims: 'Entering claims on the HCPF portal',
  finished: 'Run finished',
  failed: 'Run stopped',
  cancelled: 'Run stopped — cancelled from the hub',
}

export function describePhase(phase: string): string {
  return PHASE_LABELS[phase as LivePhase] ?? phase.replaceAll('_', ' ')
}

export function isTerminalPhase(phase: string): boolean {
  return phase === 'finished' || phase === 'failed' || phase === 'cancelled'
}

/** How many claims have finished claim entry (reached HCPF review or
 * failed), out of the true claim total for this run — the "N of M" Andy
 * asked to see next to "Entering claims on the HCPF portal" so the phase
 * label isn't just a static sentence while a run works through a long
 * member list. Sourced directly from the runner's claims_entered /
 * total_claims (claim_assembly's actual drafted-claim count), NOT derived
 * from member states: a member can have more than one claim in a period,
 * so counting members under-reports M whenever that happens. Returns null
 * before claim_assembly has run (total_claims still unknown) or for an
 * empty board. */
export function enteringClaimsCount(board: Pick<LiveBoard, 'totalClaims' | 'claimsEntered'>): { done: number; total: number } | null {
  if (board.totalClaims === null || board.totalClaims === 0) return null
  return { done: board.claimsEntered, total: board.totalClaims }
}

export type BoardSummary = {
  total: number
  waiting: number
  inProgress: number
  ready: number
  heldBack: number
  failed: number
  /** Whole-board completion, 0..100. */
  percent: number
}

export function summariseBoard(members: LiveMember[]): BoardSummary {
  const summary: BoardSummary = { total: members.length, waiting: 0, inProgress: 0, ready: 0, heldBack: 0, failed: 0, percent: 0 }
  if (members.length === 0) return summary
  let weight = 0
  for (const member of members) {
    const view = describeMemberState(member.state)
    summary[view.bucket] += 1
    weight += view.weight
  }
  summary.percent = Math.round((weight / members.length) * 100)
  return summary
}

/** The board is written on every state change; nothing for ~3 minutes means
 * the runner is wedged or gone, and a frozen board must not keep pretending
 * to be live. */
export const STALE_AFTER_MS = 3 * 60_000

export function isBoardStale(updatedAt: string | null, nowMs: number): boolean {
  if (!updatedAt) return true
  const then = Date.parse(updatedAt)
  if (Number.isNaN(then)) return true
  return nowMs - then > STALE_AFTER_MS
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/**
 * Defensively parses a `/progress` response body. Returns null for
 * `{ok: true, progress: null}` (no live board) and for anything malformed —
 * a half-written board must degrade to the coarse step bar, not throw
 * inside a render.
 */
export function parseProgressPayload(payload: unknown): LiveBoard | null {
  const root = asRecord(payload)
  if (!root || root.ok !== true) return null
  const progress = asRecord(root.progress)
  if (!progress) return null

  const rawMembers = asRecord(progress.members) ?? {}
  const members: LiveMember[] = []
  for (const [memberId, value] of Object.entries(rawMembers)) {
    const entry = asRecord(value)
    if (!entry) continue
    const claimsRecord = asRecord(entry.claims) ?? {}
    const claims: Record<string, string> = {}
    for (const [claimRef, claimState] of Object.entries(claimsRecord)) {
      if (typeof claimState === 'string') claims[claimRef] = claimState
    }
    members.push({
      memberId,
      state: typeof entry.state === 'string' && entry.state ? entry.state : 'waiting',
      claims,
    })
  }
  members.sort((a, b) => a.memberId.localeCompare(b.memberId))

  return {
    requestId: typeof progress.request_id === 'number' ? progress.request_id : null,
    runId: typeof progress.run_id === 'string' ? progress.run_id : null,
    phase: typeof progress.phase === 'string' ? progress.phase : 'starting',
    updatedAt: typeof progress.updated_at === 'string' ? progress.updated_at : null,
    members,
    totalClaims: typeof progress.total_claims === 'number' ? progress.total_claims : null,
    claimsEntered: typeof progress.claims_entered === 'number' ? progress.claims_entered : 0,
  }
}
