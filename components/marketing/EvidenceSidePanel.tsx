'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ScoreBreakdownRow } from './ScoreBar'
import { DemoBadge } from './DemoBadge'

interface EvidenceItem {
  id: string
  source_url: string
  title: string
  reliability_classification: string
  is_demo_data: boolean
  supporting_excerpt: string
  source_type: string
}

interface AngleStructure {
  audience: string
  recognizableMoment: string
  tensionOrMisconception: string
  evidence: string
  ourInterpretation: string
  whyItMatters: string
  takeaway: string
  closingThoughtCta: string
  isHypothetical: boolean
}

interface Angle {
  id: string
  angle_type: 'practical' | 'strategic' | 'human'
  structure: AngleStructure
}

interface EvidenceResponse {
  cluster: { id: string; title: string; summary: string; is_demo_data: boolean }
  score: {
    total_score: number
    dental_healthcare_relevance_score: number
    momentum_recency_score: number
    evidence_strength_score: number
    cross_source_confirmation_score: number
    story_potential_score: number
    learned_interest_fit_score: number
    explanation: string
  } | null
  evidence: EvidenceItem[]
  opportunity: { id: string; title: string; status: string } | null
  angles: Angle[]
}

const ANGLE_LABELS: Record<string, string> = { practical: 'Practical', strategic: 'Strategic', human: 'Human' }

/** Evidence + score-breakdown + angles side panel — shared drill-down for a Briefing card
 * click and a Trend Radar row click (same clusterId, same endpoint). Side panel, not a
 * page jump, per Andy's "drill-downs in side panels not page jumps" note. */
export function EvidenceSidePanel({ clusterId, onClose }: { clusterId: string; onClose: () => void }) {
  const [data, setData] = useState<EvidenceResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    setData(null)
    setFailed(false)
    fetch(`/api/marketing/evidence/${clusterId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [clusterId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-900/40 backdrop-blur-[2px] dark:bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
              {data?.cluster.title ?? 'Loading…'}
            </h3>
            {data?.cluster.is_demo_data && (
              <div className="mt-1">
                <DemoBadge />
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-[12px] text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            Close
          </button>
        </div>

        {failed ? (
          <p className="px-5 py-10 text-center text-[12px] text-amber-700 dark:text-amber-300/80">
            Could not load this signal — close and try again.
          </p>
        ) : !data ? (
          <p className="px-5 py-10 text-center text-[12px] text-zinc-500 dark:text-zinc-600">Loading…</p>
        ) : (
          <div className="space-y-6 px-5 py-4">
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400">{data.cluster.summary}</p>

            {data.score && (
              <section>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Score breakdown — {data.score.total_score}/100
                </h4>
                <div className="mt-2.5 space-y-2">
                  <ScoreBreakdownRow label="Dental/healthcare relevance" value={data.score.dental_healthcare_relevance_score} weight="30%" />
                  <ScoreBreakdownRow label="Momentum / recency" value={data.score.momentum_recency_score} weight="20%" />
                  <ScoreBreakdownRow label="Evidence strength" value={data.score.evidence_strength_score} weight="20%" />
                  <ScoreBreakdownRow label="Cross-source confirmation" value={data.score.cross_source_confirmation_score} weight="15%" />
                  <ScoreBreakdownRow label="Story potential" value={data.score.story_potential_score} weight="10%" />
                  <ScoreBreakdownRow label="Learned interest fit" value={data.score.learned_interest_fit_score} weight="5%" />
                </div>
                <p className="mt-2.5 text-[11px] leading-relaxed text-zinc-500">{data.score.explanation}</p>
              </section>
            )}

            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Evidence ({data.evidence.length})
              </h4>
              <ul className="mt-2.5 space-y-2.5">
                {data.evidence.map((item) => (
                  <li key={item.id} className="rounded-lg border border-zinc-200 p-2.5 text-xs dark:border-zinc-700/60">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                      >
                        {item.title}
                      </a>
                      <span className="rounded border border-zinc-300 px-1 py-0.5 text-[10px] text-zinc-500 dark:border-zinc-700">
                        {item.reliability_classification.replace(/_/g, ' ')}
                      </span>
                      {item.is_demo_data && <DemoBadge />}
                    </div>
                    <p className="mt-1 text-zinc-500">{item.supporting_excerpt}</p>
                  </li>
                ))}
              </ul>
            </section>

            {data.angles.length > 0 && (
              <section>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Story angles
                </h4>
                <ul className="mt-2.5 space-y-2">
                  {data.angles.map((angle) => (
                    <li key={angle.id} className="rounded-lg border border-zinc-200 p-2.5 text-xs dark:border-zinc-700/60">
                      <p className="font-medium text-zinc-800 dark:text-zinc-200">{ANGLE_LABELS[angle.angle_type]}</p>
                      <p className="mt-1 text-zinc-500">{angle.structure.takeaway}</p>
                    </li>
                  ))}
                </ul>
                {data.opportunity && (
                  <Link
                    href={`/marketing/story-workspace/${data.opportunity.id}`}
                    className="mt-2.5 inline-block text-xs font-medium text-zinc-900 hover:underline dark:text-white"
                  >
                    Open in Story Workspace →
                  </Link>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
