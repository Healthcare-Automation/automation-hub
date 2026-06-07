import { cn } from '@/lib/utils'

export interface Metric {
  value: string
  label: string
  accent?: 'cyan' | 'emerald' | 'amber'
}

const ACCENT: Record<string, string> = {
  cyan: 'text-cyan-300',
  emerald: 'text-emerald-300',
  amber: 'text-amber-300',
}

/** Compact per-automation KPI strip — keeps each card self-contained. */
export default function MetricStrip({ items }: { items: Metric[] }) {
  return (
    <div className="grid grid-cols-4 divide-x divide-zinc-700/40 overflow-hidden rounded-lg bg-zinc-800/40 ring-1 ring-zinc-700/40">
      {items.map(m => (
        <div key={m.label} className="px-2 py-2.5 text-center">
          <div className={cn('text-[17px] font-semibold leading-none tabular-nums', m.accent ? ACCENT[m.accent] : 'text-zinc-100')}>
            {m.value}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">{m.label}</div>
        </div>
      ))}
    </div>
  )
}
