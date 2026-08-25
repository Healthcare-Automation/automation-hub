/**
 * Pure progress-code helpers, split out of mohamedRunRequests.ts so client
 * components can import them. mohamedRunRequests reaches mohamedDb (and
 * therefore `postgres`), which must never enter the browser bundle — the
 * run-history timeline renders an in-flight run's steps client-side, so this
 * module has to stay dependency-free.
 *
 * mohamedRunRequests re-exports everything here; existing importers are
 * unaffected.
 */

/** Human labels for the poller's machine progress codes (mohamed repo,
 * poll_worker.py `_progress`). Codes with a `:N_of_M` or `:N` suffix get the
 * count appended. */
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
