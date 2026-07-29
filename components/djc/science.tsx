'use client'

import { useState } from 'react'
import type { OddsFactor } from '@/lib/djcScience'

const CYAN = '#0891b2'
const EMERALD = '#059669'
const AMBER = '#d97706'

/** A real funnel: connected stage columns with flow ribbons narrowing by conversion.
 *  Counts are "applications that reached this stage" (dated in Salesforce). */
export function FunnelCascade({
  stages, medianDays, onSelect,
}: {
  stages: { label: string; count: number }[]
  medianDays: (number | null)[] // between consecutive stages; length = stages.length - 1
  /** When provided, each stage becomes clickable and opens its underlying rows. */
  onSelect?: (stage: string) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 900
  const H = 240
  const colW = 64
  const gap = (W - stages.length * colW) / (stages.length - 1)
  const max = Math.max(...stages.map(s => s.count), 1)
  // Bars live strictly between the count labels (top) and stage labels (bottom) so the
  // tallest bar can never run over its own caption.
  const TOP = 26
  const BOT = H - 46
  const barH = (c: number) => Math.max((c / max) * (BOT - TOP), 6)
  const mid = (TOP + BOT) / 2

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[540px]" style={{ maxHeight: 280 }}>
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
            <g
              key={s.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={onSelect ? () => onSelect(s.label) : undefined}
              style={onSelect ? { cursor: 'pointer' } : undefined}
            >
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
  const ROW = 40
  const H = factors.length * ROW + 34
  const X0 = 220
  const X1 = W - 150
  const LOG_MIN = Math.log(0.05)
  const LOG_MAX = Math.log(12)
  const x = (v: number) => X0 + ((Math.log(Math.max(v, 0.05)) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * (X1 - X0)

  return (
    <div className="overflow-x-auto">
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]">
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
            {f.caveat && (
              <text x={0} y={y + 17} fill="#d97706" fontSize={9.5}>
                ⚠ {f.caveat}
                {f.caveatDetail && <title>{f.caveatDetail}</title>}
              </text>
            )}
          </g>
        )
      })}
    </svg>
    </div>
  )
}

/** Quarterly area trend with a highlighted latest complete quarter. */
export function QuarterlyTrend({ series }: { series: { quarter: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  if (series.length < 2) return null

  // The final quarter is still in progress, so its low value is not a decline — drawing it as a
  // solid part of the trend made the chart read as a collapse. It is dashed and labelled instead.
  const complete = series.slice(0, -1)
  const current = series[series.length - 1]

  const W = 860
  const H = 210
  const PAD_L = 34
  const PAD_R = 34
  const PAD_T = 30   // headroom so value labels above the peak are never clipped
  const PAD_B = 46   // room for quarter labels plus the "in progress" note
  const max = Math.max(...series.map(s => s.count), 1)
  const niceMax = Math.ceil(max / 10) * 10
  const x = (i: number) => PAD_L + (i / (series.length - 1)) * (W - PAD_L - PAD_R)
  const y = (c: number) => PAD_T + (1 - c / niceMax) * (H - PAD_T - PAD_B)
  const solid = complete.map((s, i) => `${x(i)},${y(s.count)}`).join(' ')
  const tail = `${x(complete.length - 1)},${y(complete[complete.length - 1].count)} ${x(series.length - 1)},${y(current.count)}`
  const peak = complete.reduce((a, s, i) => (s.count > complete[a].count ? i : a), 0)
  const h = hover !== null ? series[hover] : null
  const band = (W - PAD_L - PAD_R) / (series.length - 1)

  // Label the peak, the first and last complete quarters, plus whatever is hovered — enough to read
  // the shape without a wall of numbers.
  const labelled = new Set([0, peak, complete.length - 1, series.length - 1])
  if (hover !== null) labelled.add(hover)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(niceMax * f)} y2={y(niceMax * f)}
                  stroke="#3f3f46" strokeWidth={1} strokeDasharray="2 4" opacity={0.5} />
            <text x={PAD_L - 8} y={y(niceMax * f) + 3.5} textAnchor="end" fill="#52525b" fontSize={10}>
              {Math.round(niceMax * f)}
            </text>
          </g>
        ))}

        <polygon points={`${x(0)},${y(0)} ${solid} ${x(complete.length - 1)},${y(0)}`} fill={`${CYAN}1f`} />
        <polyline points={solid} fill="none" stroke={CYAN} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        <polyline points={tail} fill="none" stroke={CYAN} strokeWidth={2.5} strokeDasharray="5 4"
                  opacity={0.55} vectorEffect="non-scaling-stroke" />

        {series.map((s, i) => {
          const isCurrent = i === series.length - 1
          return (
            <g key={s.quarter}>
              <circle cx={x(i)} cy={y(s.count)} r={hover === i ? 5 : i === peak || isCurrent ? 4 : 2.5}
                      fill={isCurrent ? '#0e0e12' : CYAN} stroke={CYAN}
                      strokeWidth={isCurrent ? 2 : 0} />
              {labelled.has(i) && (
                <text x={x(i)} y={y(s.count) - 11} textAnchor="middle"
                      fill={hover === i ? '#e4e4e7' : '#a1a1aa'}
                      fontSize={hover === i ? 13 : 11} fontWeight={600}>
                  {s.count}
                </text>
              )}
            </g>
          )
        })}

        {series.map((s, i) => (
          <g key={`x-${s.quarter}`}>
            <rect x={x(i) - band / 2} y={0} width={band} height={H - PAD_B + 10}
                  fill="transparent" onMouseEnter={() => setHover(i)} />
            {/* Enforce spacing: the every-4th rule and the always-label-the-last rule collided at
                the end, stacking "2026Q1 2026Q2 2026Q3" on top of each other. */}
            {(i === hover
              || i === series.length - 1
              || (i % 4 === 0 && i < series.length - 2 && i !== hover! - 1 && i !== hover! + 1)) && (
              <text x={x(i)} y={H - PAD_B + 22} textAnchor={i === series.length - 1 ? 'end' : 'middle'}
                    fill={hover === i ? '#d4d4d8' : '#71717a'} fontSize={10}>
                {s.quarter.replace(' ', '')}
              </text>
            )}
          </g>
        ))}

        <text x={W - PAD_R} y={H - 6} textAnchor="end" fill="#52525b" fontSize={10}>
          dashed = {current.quarter.replace(' ', '')} still in progress
        </text>
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
