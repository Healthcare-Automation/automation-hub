import { CHART } from '@/lib/chartTokens'

/** 7-day momentum sparkline — flat bars, no axis/gridlines/gradients, matching the house
 * chart style (lib/chartTokens.ts). Values are oldest (6 days ago) to newest (today). */
export function Sparkline({ values, title }: { values: number[]; title?: string }) {
  const max = Math.max(1, ...values)
  return (
    <div className="flex h-6 items-end gap-0.5" title={title}>
      {values.map((v, i) => (
        <div
          key={i}
          className={`w-1.5 rounded-[1px] ${v > 0 ? CHART.primary : CHART.track}`}
          style={{ height: `${Math.max(v > 0 ? 15 : 8, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}
