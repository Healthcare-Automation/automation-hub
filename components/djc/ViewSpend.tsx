'use client'

import { cn } from '@/lib/utils'
import { CHART } from '@/lib/chartTokens'
import type { ActivityBucket } from '@/lib/djcOps'

/**
 * How fresh the candidate pool is.
 *
 * This file also held a weekly views chart, which now lives in RoleSpend alongside the role filter
 * it needs — two copies of the same series was how the conversion line quietly disappeared from the
 * page when step 3 was rebuilt.
 */
export default function ViewSpend({ activity }: { activity: ActivityBucket[] }) {
  const total = activity.reduce((a, b) => a + b.count, 0)
  const max = Math.max(...activity.map(b => b.count), 1)
  const fresh = activity.filter(b => /this week|8-30/.test(b.label)).reduce((a, b) => a + b.count, 0)

  return (
    <section>
      <h3 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">When candidates were last active on DJC</h3>
      <p className="mt-0.5 text-[12px] text-zinc-500">
        Every candidate we have seen — {total.toLocaleString()} people.{' '}
        <span className="text-zinc-600 dark:text-zinc-400">
          {Math.round((fresh / (total || 1)) * 100)}% were active in the last month.
        </span>
      </p>
      <div className="mt-4 space-y-1.5">
        {activity.map(b => (
          <div key={b.label} className="flex items-center gap-3">
            <span className="w-36 shrink-0 text-[12px] text-zinc-700 dark:text-zinc-300">{b.label}</span>
            <span className={cn('relative h-5 grow rounded', CHART.track)}>
              <span className={cn('absolute inset-y-0 left-0 rounded', CHART.primary)}
                    style={{ width: `${Math.max((b.count / max) * 100, 1)}%` }} />
            </span>
            <span className="w-16 shrink-0 text-right text-[12px] font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
              {b.count.toLocaleString()}
            </span>
            <span className="w-14 shrink-0 text-right text-[12px] tabular-nums text-zinc-500">{b.pct}%</span>
          </div>
        ))}
      </div>
    </section>
  )
}
