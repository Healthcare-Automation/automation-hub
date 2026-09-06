'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FeedbackForm } from './FeedbackForm'
import { ContentStudioPanel } from './ContentStudioPanel'
import type { AngleType, StoryAngleStructure } from '@/lib/marketing/types'

interface Angle {
  id: string
  angle_type: AngleType
  structure: StoryAngleStructure
  applied_preference_notes: string[]
}

const ANGLE_LABELS: Record<AngleType, string> = { practical: 'Practical', strategic: 'Strategic', human: 'Human' }

const SECTIONS: { key: keyof StoryAngleStructure; label: string }[] = [
  { key: 'audience', label: 'Audience' },
  { key: 'recognizableMoment', label: 'Recognizable moment' },
  { key: 'tensionOrMisconception', label: 'Tension / misconception' },
  { key: 'evidence', label: 'Evidence' },
  { key: 'ourInterpretation', label: 'Our interpretation' },
  { key: 'whyItMatters', label: 'Why it matters' },
  { key: 'takeaway', label: 'Takeaway' },
  { key: 'closingThoughtCta', label: 'Closing thought / CTA' },
]

/** Story Workspace: three angles side by side as columns with the narrative structure
 * labeled section by section. Picking one opens Content Studio inline, right below —
 * same panel flow, no page jump to a separate content-library route. */
export function AngleWorkspace({
  opportunityId,
  angles,
  selectedAngleId,
  isAdmin,
}: {
  opportunityId: string
  angles: Angle[]
  selectedAngleId: string | null
  isAdmin: boolean
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(selectedAngleId)
  const [isPending, startTransition] = useTransition()

  function pick(angleId: string) {
    startTransition(async () => {
      await fetch('/api/marketing/story/select-angle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId, angleId }),
      })
      setSelected(angleId)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {angles.map((angle) => {
          const isSelected = selected === angle.id
          return (
            <article
              key={angle.id}
              className={
                isSelected
                  ? 'rounded-lg border-2 border-zinc-900 p-4 dark:border-white'
                  : 'rounded-lg border border-zinc-200 p-4 dark:border-zinc-700/60'
              }
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-zinc-900 dark:text-white">{ANGLE_LABELS[angle.angle_type]}</h3>
                {angle.structure.isHypothetical && (
                  <span className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:border-zinc-700">
                    Hypothetical
                  </span>
                )}
              </div>

              <dl className="mt-3 space-y-2.5">
                {SECTIONS.map(({ key, label }) => (
                  <div key={key}>
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
                    <dd className="mt-0.5 text-[12px] leading-snug text-zinc-800 dark:text-zinc-200">
                      {String(angle.structure[key])}
                    </dd>
                  </div>
                ))}
                {angle.applied_preference_notes.length > 0 && (
                  <div>
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Learned-preference adjustments</dt>
                    <dd>
                      <ul className="mt-0.5 list-disc pl-4 text-[12px] text-zinc-800 dark:text-zinc-200">
                        {angle.applied_preference_notes.map((note, i) => (
                          <li key={i}>{note}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}
              </dl>

              {isAdmin && (
                <button
                  type="button"
                  disabled={isPending || isSelected}
                  onClick={() => pick(angle.id)}
                  className="mt-3 w-full rounded border border-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-900 disabled:opacity-40 dark:border-white dark:text-white"
                >
                  {isSelected ? 'Selected' : isPending ? 'Selecting…' : 'Pick this angle'}
                </button>
              )}

              <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700/60">
                <FeedbackForm targetType="story_angle" targetId={angle.id} isAdmin={isAdmin} />
              </div>
            </article>
          )
        })}
      </div>

      {selected && <ContentStudioPanel opportunityId={opportunityId} angleId={selected} />}
    </div>
  )
}
