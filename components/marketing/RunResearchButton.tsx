'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface PipelineResult {
  itemsIngested: number
  itemsEnriched: number
  feedsProcessed: number
  feedsSkippedForBudget: number
  itemsEmbedded: number
  clustersAttached: number
  clustersCreated: number
  clustersRescored: number
  opportunitiesCreated: number
  feedResults: { feedId: string; name: string; itemsFound: number; itemsInserted: number; error: string | null }[]
}

/** "Run research now" — triggers the same ingest→embed→cluster→score→opportunities
 * pipeline as the cron, on demand, with a live inline result summary once it finishes
 * (this can take a while: RSS fetches for ~20 feeds plus article-page enrichment). */
export function RunResearchButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<PipelineResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function run() {
    setError(null)
    setResult(null)
    startTransition(async () => {
      const res = await fetch('/api/marketing/research', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        setError(body?.error ?? 'Run failed — try again.')
        return
      }
      setResult(body)
      router.refresh()
    })
  }

  const failedFeeds = result?.feedResults.filter((f) => f.error) ?? []

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={isPending}
        onClick={run}
        className="rounded border border-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-900 disabled:opacity-40 dark:border-white dark:text-white"
      >
        {isPending ? 'Running research…' : 'Run research now'}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {result && (
        <div className="rounded-lg border border-zinc-200 p-3 text-xs text-zinc-600 dark:border-zinc-700/60 dark:text-zinc-400">
          <p>
            Processed {result.feedsProcessed} feed{result.feedsProcessed === 1 ? '' : 's'}
            {result.feedsSkippedForBudget > 0 ? ` (${result.feedsSkippedForBudget} deferred to the next run)` : ''} —{' '}
            {result.itemsIngested} new item{result.itemsIngested === 1 ? '' : 's'} ingested, {result.itemsEnriched} enriched,{' '}
            {result.itemsEmbedded} embedded. Clusters: {result.clustersAttached} attached, {result.clustersCreated} created,{' '}
            {result.clustersRescored} rescored. {result.opportunitiesCreated} new opportunit
            {result.opportunitiesCreated === 1 ? 'y' : 'ies'}.
          </p>
          {failedFeeds.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-amber-700 dark:text-amber-400">
              {failedFeeds.map((f) => (
                <li key={f.feedId}>
                  {f.name}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
