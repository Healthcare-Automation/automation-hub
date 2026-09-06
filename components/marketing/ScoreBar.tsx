import { CHART, CHART_TEXT } from '@/lib/chartTokens'

function toneFor(score: number): { fill: string; text: string } {
  if (score >= 70) return { fill: CHART.good, text: CHART_TEXT.good }
  if (score >= 40) return { fill: CHART.primary, text: 'text-cyan-700 dark:text-cyan-300' }
  return { fill: CHART.warn, text: CHART_TEXT.warn }
}

/** Score as a flat horizontal bar out of 100 — the visual treatment Andy asked for
 * ("score as a visual bar/ring"); a bar reads faster than a number in a scannable list of
 * cards than an SVG ring would, so bar it is, everywhere a score appears. */
export function ScoreBar({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const tone = toneFor(score)
  const height = size === 'sm' ? 'h-1.5' : 'h-2'
  return (
    <div className="flex items-center gap-2">
      <div className={`w-16 overflow-hidden rounded-full ${CHART.track} ${height}`}>
        <div className={`h-full rounded-full ${tone.fill}`} style={{ width: `${Math.max(4, score)}%` }} />
      </div>
      <span className={`text-[13px] font-semibold tabular-nums ${tone.text}`}>{score}</span>
    </div>
  )
}

/** One row of the score breakdown in the evidence side panel — same bar treatment, one
 * factor at a time, with its weight in the formula labeled. */
export function ScoreBreakdownRow({ label, value, weight }: { label: string; value: number; weight: string }) {
  const tone = toneFor(value)
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-40 shrink-0 text-zinc-600 dark:text-zinc-400">
        {label} <span className="text-zinc-400 dark:text-zinc-600">({weight})</span>
      </span>
      <div className={`h-1.5 flex-1 overflow-hidden rounded-full ${CHART.track}`}>
        <div className={`h-full rounded-full ${tone.fill}`} style={{ width: `${Math.max(4, value)}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right font-medium tabular-nums text-zinc-700 dark:text-zinc-300">{value}</span>
    </div>
  )
}
