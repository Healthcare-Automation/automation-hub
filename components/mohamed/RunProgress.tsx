import { PROGRESS_STAGES, parseRunProgress, type ProgressStageCode } from '@/lib/mohamedRunRequests'

const STEP_LABELS: Record<ProgressStageCode, string> = {
  reading_csv: 'Reading the uploaded CSV',
  checking_portal_session: 'Checking the HCPF portal session',
  checking_eligibility: 'Checking member eligibility',
  entering_claims_on_hcpf: 'Entering claims on HCPF',
  saving_results: 'Saving results',
}

/** Ordered step list + percent bar for an in-flight run's progress code.
 * `waiting_for_portal_session` renders as its own paused, amber state — it
 * isn't a step in the list, the run hasn't started stepping yet. */
export function RunProgress({ progress }: { progress: string | null }) {
  const state = parseRunProgress(progress)
  if (!state) return null

  if (state.paused) {
    return (
      <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
        <p className="text-xs font-medium text-amber-900">
          Portal session is being repaired automatically — your run will start when it recovers.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-3">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${state.percent}%` }} />
      </div>
      <ol className="mt-3 space-y-1.5">
        {PROGRESS_STAGES.map((stage, index) => {
          const isDone = index < state.stageIndex
          const isCurrent = index === state.stageIndex
          return (
            <li key={stage} className="flex items-center gap-2 text-xs">
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                  isDone
                    ? 'bg-emerald-600 text-white'
                    : isCurrent
                      ? 'border-2 border-emerald-500 bg-white text-emerald-600'
                      : 'border border-zinc-300 bg-white text-transparent'
                }`}
              >
                {isDone ? '✓' : ''}
              </span>
              <span className={isCurrent ? 'font-medium text-zinc-900' : isDone ? 'text-zinc-500' : 'text-zinc-400'}>
                {STEP_LABELS[stage]}
                {isCurrent && state.counter ? ` (${state.counter.done} of ${state.counter.total})` : ''}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
