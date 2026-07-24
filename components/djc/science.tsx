'use client'

import { useState } from 'react'
import type { OddsFactor } from '@/lib/djcScience'

const CYAN = '#0891b2'
const EMERALD = '#059669'
const AMBER = '#d97706'

/** A real funnel: connected stage columns with flow ribbons narrowing by conversion.
 *  Counts are "applications that reached this stage" (dated in Salesforce). */
export function FunnelCascade({
  stages, medianDays,
}: {
  stages: { label: string; count: number }[]
  medianDays: (number | null)[] // between consecutive stages; length = stages.length - 1
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 900
  const H = 240
  const colW = 64
  const gap = (W - stages.length * colW) / (stages.length - 1)
  const max = Math.max(...stages.map(s => s.count), 1)
  const barH = (c: number) => Math.max((c / max) * (H - 90), 6)
  const mid = H - 60

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 280 }}>
        {stages.map((s, i) => {
          const x = i * (colW + gap)
          const h = barH(s.count)
          const y = mid - h / 2
          const next = stages[i + 1]
          // Edge columns anchor their text inward so long labels don't clip at the viewBox.
          const anchor = i === 0 ? 'start' : i === stages.length - 1 ? 'end' : 'middle'
          const tx = i === 0 ? x : i === stages.length - 1 ? x + colW : x + colW / 2
          // Stages are often skipped in data entry (e.g. Placed without a dated Offer), which can
          // make a later stage "larger" — suppress the % rather than show a nonsense >100%.
          const rawConv = next && s.count ? Math.round((next.count / s.count) * 100) : null
          const conv = rawConv !== null && rawConv <= 100 ? rawConv : null
          return (
            <g key={s.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* flow ribbon to the next stage */}
              {next && (
                <path
                  d={`M ${x + colW} ${mid - h / 2} C ${x + colW + gap / 2} ${mid - h / 2}, ${x + colW + gap / 2} ${mid - barH(next.count) / 2}, ${x + colW + gap} ${mid - barH(next.count) / 2}
                      L ${x + colW + gap} ${mid + barH(next.count) / 2} C ${x + colW + gap / 2} ${mid + barH(next.count) / 2}, ${x + colW + gap / 2} ${mid + h / 2}, ${x + colW} ${mid + h / 2} Z`}
                  fill={CYAN}
                  opacity={hover === i ? 0.35 : 0.16}
                />
              )}
              {/* stage column */}
              <rect
                x={x} y={y} width={colW} height={h} rx={5}
                fill={i === stages.length - 1 ? EMERALD : CYAN}
                opacity={hover === null || hover === i || hover === i - 1 ? 1 : 0.55}
              />
              {/* count above */}
              <text x={tx} y={y - 10} textAnchor={anchor} fill="#e4e4e7" fontSize={15} fontWeight={600}>
                {s.count.toLocaleString()}
              </text>
              {/* label below */}
              <text x={tx} y={H - 26} textAnchor={anchor} fill="#a1a1aa" fontSize={11}>
                {s.label}
              </text>
              {/* conversion + speed on the ribbon */}
              {next && (
                <>
                  {conv !== null && (
                    <text x={x + colW + gap / 2} y={mid - (h + barH(next.count)) / 4 - 10} textAnchor="middle" fill="#67e8f9" fontSize={11} fontWeight={600}>
                      {conv}%
                    </text>
                  )}
                  {medianDays[i] !== null && (
                    <text x={x + colW + gap / 2} y={H - 8} textAnchor="middle" fill="#71717a" fontSize={9.5}>
                      ~{medianDays[i]}d
                    </text>
                  )}
                </>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Forest plot: odds ratios with 95% CI whiskers on a log scale. The standard way to show
 *  "what predicts an outcome" honestly — point estimate, uncertainty, and the OR=1 line. */
export function ForestPlot({ factors }: { factors: OddsFactor[] }) {
  const W = 860
  const ROW = 34
  const H = factors.length * ROW + 34
  const X0 = 220
  const X1 = W - 150
  const LOG_MIN = Math.log(0.05)
  const LOG_MAX = Math.log(12)
  const x = (v: number) => X0 + ((Math.log(Math.max(v, 0.05)) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * (X1 - X0)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* reference line at OR = 1 */}
      <line x1={x(1)} y1={4} x2={x(1)} y2={H - 28} stroke="#52525b" strokeDasharray="3 3" />
      <text x={x(1)} y={H - 14} textAnchor="middle" fill="#71717a" fontSize={10}>no effect (OR 1)</text>
      <text x={x(0.2)} y={H - 14} textAnchor="middle" fill="#71717a" fontSize={10}>← less likely</text>
      <text x={x(6)} y={H - 14} textAnchor="middle" fill="#71717a" fontSize={10}>more likely →</text>
      {factors.map((f, i) => {
        const y = i * ROW + 22
        const sig = f.p < 0.05
        const color = !sig ? '#71717a' : f.or > 1 ? EMERALD : AMBER
        return (
          <g key={f.factor}>
            <text x={0} y={y + 4} fill={sig ? '#e4e4e7' : '#a1a1aa'} fontSize={12} fontWeight={sig ? 600 : 400}>
              {f.factor}
            </text>
            <line x1={x(f.lo)} y1={y} x2={x(f.hi)} y2={y} stroke={color} strokeWidth={2} />
            <line x1={x(f.lo)} y1={y - 4} x2={x(f.lo)} y2={y + 4} stroke={color} strokeWidth={2} />
            <line x1={x(f.hi)} y1={y - 4} x2={x(f.hi)} y2={y + 4} stroke={color} strokeWidth={2} />
            <circle cx={x(f.or)} cy={y} r={5} fill={color} stroke="#0e0e12" strokeWidth={1.5} />
            <text x={X1 + 12} y={y + 4} fill={sig ? '#e4e4e7' : '#71717a'} fontSize={11} className="tabular-nums">
              {f.or.toFixed(2)} [{f.lo.toFixed(2)}–{f.hi.toFixed(2)}]{sig ? ' ✓' : ''}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Quarterly area trend with a highlighted latest complete quarter. */
export function QuarterlyTrend({ series }: { series: { quarter: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  if (series.length < 2) return null
  const W = 860
  const H = 170
  const PAD = 24
  const max = Math.max(...series.map(s => s.count), 1)
  const x = (i: number) => PAD + (i / (series.length - 1)) * (W - PAD * 2)
  const y = (c: number) => H - 30 - (c / max) * (H - 60)
  const line = series.map((s, i) => `${x(i)},${y(s.count)}`).join(' ')
  const h = hover !== null ? series[hover] : null
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHover(null)}>
        <polygon points={`${x(0)},${H - 30} ${line} ${x(series.length - 1)},${H - 30}`} fill={`${CYAN}26`} />
        <polyline points={line} fill="none" stroke={CYAN} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        {series.map((s, i) => (
          <g key={s.quarter}>
            <rect
              x={x(i) - (W - PAD * 2) / (series.length - 1) / 2} y={0}
              width={(W - PAD * 2) / (series.length - 1)} height={H - 30}
              fill="transparent" onMouseEnter={() => setHover(i)}
            />
            {(i === hover || i % 4 === 0) && (
              <text x={x(i)} y={H - 12} textAnchor="middle" fill="#71717a" fontSize={9.5}>
                {s.quarter.replace(' ', '')}
              </text>
            )}
          </g>
        ))}
        {h && (
          <>
            <circle cx={x(hover!)} cy={y(h.count)} r={4.5} fill={CYAN} stroke="#0e0e12" strokeWidth={2} />
            <text x={x(hover!)} y={y(h.count) - 12} textAnchor="middle" fill="#e4e4e7" fontSize={13} fontWeight={600}>
              {h.count}
            </text>
          </>
        )}
      </svg>
    </div>
  )
}


/** Vertical column chart for short monthly series — time reads left→right, values labeled. */
export function ColumnChart({
  series, color = CYAN,
}: {
  series: { label: string; count: number }[]
  color?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 560
  const H = 150
  const max = Math.max(...series.map(s => s.count), 1)
  const colW = (W - 8 * (series.length - 1)) / series.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHover(null)}>
      {series.map((s, i) => {
        const h = Math.max((s.count / max) * (H - 44), 3)
        const x = i * (colW + 8)
        return (
          <g key={s.label} onMouseEnter={() => setHover(i)}>
            <rect x={x} y={H - 24 - h} width={colW} height={h} rx={4}
              fill={color} opacity={hover === null || hover === i ? 0.95 : 0.45} />
            <text x={x + colW / 2} y={H - 30 - h} textAnchor="middle" fill="#d4d4d8" fontSize={11.5} fontWeight={600}>
              {s.count}
            </text>
            <text x={x + colW / 2} y={H - 8} textAnchor="middle" fill="#71717a" fontSize={9.5}>
              {series.length > 8 && i % 2 === 1 && hover !== i ? '' : s.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
