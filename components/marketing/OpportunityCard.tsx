'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { BriefingCard } from '@/lib/marketingQueries'
import { ScoreBar } from './ScoreBar'
import { Sparkline } from './Sparkline'
import { SourceTypeChips } from './SourceTypeChips'
import { DemoBadge } from './DemoBadge'
import { EvidenceSidePanel } from './EvidenceSidePanel'

/** Briefing card: score bar, momentum sparkline, source-type chips, audience/confidence/
 * freshness, and the three inline actions — everything Andy asked for on one card, no
 * page jump to see more (clicking the title opens the evidence side panel instead). */
export function OpportunityCard({ card, isAdmin }: { card: BriefingCard; isAdmin: boolean }) {
  const router = useRouter()
  const [panelOpen, setPanelOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function setStatus(status: 'watching' | 'archived') {
    startTransition(async () => {
      await fetch('/api/marketing/opportunities/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId: card.id, status }),
      })
      router.refresh()
    })
  }

  return (
    <>
      <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button type="button" onClick={() => setPanelOpen(true)} className="min-w-0 flex-1 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[14px] font-semibold text-zinc-900 hover:underline dark:text-white">{card.title}</h3>
              {card.isDemoData && <DemoBadge />}
              {card.status === 'watching' && (
                <span className="rounded border border-cyan-400/60 px-1.5 py-0.5 text-[10px] text-cyan-700 dark:text-cyan-300">
                  Watching
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-[13px] text-zinc-600 dark:text-zinc-400">{card.signalSummary}</p>
          </button>
          {card.totalScore != null && <ScoreBar score={card.totalScore} />}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-zinc-500">
          <Sparkline values={card.sparkline} title="Items over the last 7 days" />
          <SourceTypeChips counts={card.sourceTypeCounts} />
          {card.audience && (
            <span className="rounded border border-zinc-200 px-1.5 py-0.5 dark:border-zinc-700/60">{card.audience}</span>
          )}
          {card.confidenceLabel && <span>{card.confidenceLabel} confidence</span>}
          <span>{card.freshnessLabel}</span>
          {card.generatedBy === 'llm' && (
            <span className="rounded border border-violet-400/50 px-1.5 py-0.5 text-violet-600 dark:text-violet-300">
              LLM-generated
            </span>
          )}
        </div>

        {isAdmin && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={`/marketing/story-workspace/${card.id}`}
              className="rounded border border-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-900 dark:border-white dark:text-white"
            >
              Create content
            </Link>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setStatus('watching')}
              className="rounded border border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
            >
              Watch
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setStatus('archived')}
              className="rounded border border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
            >
              Not relevant
            </button>
          </div>
        )}
      </li>
      {panelOpen && card.clusterId && <EvidenceSidePanel clusterId={card.clusterId} onClose={() => setPanelOpen(false)} />}
    </>
  )
}
