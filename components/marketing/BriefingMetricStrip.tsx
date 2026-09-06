import { freshnessLabelFromMs } from '@/lib/marketingQueries'

export interface BriefingMetricStripProps {
  signalsIngested24h: number
  activeClusters: number
  newOpportunities7d: number
  lastRunAt: string | null
  lastRunStatus: string | null
}

/** Top-of-page metric strip — same flat/ringed-card house style as components/MetricStrip
 * (divide-x, ring-1, no gradients/shadows beyond the one quiet shadow-sm), but a fixed set
 * of four metrics rather than a 7d/all-time toggle, since these four don't share a time axis. */
export function BriefingMetricStrip(props: BriefingMetricStripProps) {
  const freshness = props.lastRunAt ? freshnessLabelFromMs(new Date(props.lastRunAt).getTime()) : 'Never run'
  const items = [
    { value: String(props.signalsIngested24h), label: 'Signals, 24h' },
    { value: String(props.activeClusters), label: 'Active clusters' },
    { value: String(props.newOpportunities7d), label: 'New opportunities, 7d' },
    { value: freshness, label: props.lastRunStatus === 'failed' ? 'Last run (failed)' : 'Last run' },
  ]
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-zinc-200 overflow-hidden rounded-lg bg-white ring-1 ring-zinc-200 shadow-sm sm:grid-cols-4 sm:divide-y-0 dark:divide-zinc-700/40 dark:bg-zinc-800/40 dark:ring-zinc-700/40 dark:shadow-none">
      {items.map((m) => (
        <div key={m.label} className="px-3 py-3 text-center">
          <div className="text-[17px] font-semibold leading-none tabular-nums text-zinc-900 dark:text-zinc-100">
            {m.value}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">{m.label}</div>
        </div>
      ))}
    </div>
  )
}
