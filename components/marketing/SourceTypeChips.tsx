import type { SourceType } from '@/lib/marketing/types'
import type { SourceTypeCount } from '@/lib/marketingQueries'

const LABELS: Record<SourceType, { singular: string; plural: string }> = {
  publication: { singular: 'publication', plural: 'publications' },
  government: { singular: 'gov source', plural: 'gov sources' },
  association: { singular: 'association', plural: 'associations' },
  social: { singular: 'Reddit thread', plural: 'Reddit' },
  video: { singular: 'YouTube video', plural: 'YouTube' },
  news: { singular: 'news result', plural: 'news' },
  manual: { singular: 'manual link', plural: 'manual links' },
  trend_feed: { singular: 'trend signal', plural: 'trend signals' },
  regulatory: { singular: 'regulatory source', plural: 'regulatory' },
  review: { singular: 'review', plural: 'reviews' },
  newsletter: { singular: 'newsletter', plural: 'newsletters' },
}

/** "3 publications, 2 Reddit, 1 gov" — human names, not source_type ids, per Andy's
 * "label things by human names not ids" note. */
export function SourceTypeChips({ counts }: { counts: SourceTypeCount[] }) {
  if (counts.length === 0) return null
  const sorted = [...counts].sort((a, b) => b.count - a.count)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sorted.map(({ sourceType, count }) => {
        const label = LABELS[sourceType] ?? { singular: sourceType, plural: sourceType }
        return (
          <span
            key={sourceType}
            className="rounded border border-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:border-zinc-700/60 dark:text-zinc-400"
          >
            {count} {count === 1 ? label.singular : label.plural}
          </span>
        )
      })}
    </div>
  )
}
