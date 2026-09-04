'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { FeedbackTargetType } from '@/lib/marketing/types'

const TAGS: { value: string; label: string }[] = [
  { value: 'strong_idea', label: 'Strong idea' },
  { value: 'weak_idea', label: 'Weak idea' },
  { value: 'too_generic', label: 'Too generic' },
  { value: 'too_promotional', label: 'Too promotional' },
  { value: 'too_clinical', label: 'Too clinical' },
  { value: 'too_obvious', label: 'Too obvious' },
  { value: 'wrong_audience', label: 'Wrong audience' },
  { value: 'wrong_tone', label: 'Wrong tone' },
  { value: 'not_credible_enough', label: 'Not credible enough' },
  { value: 'good_hook', label: 'Good hook' },
  { value: 'good_story', label: 'Good story' },
  { value: 'save_this_style', label: 'Save this style' },
  { value: 'do_not_use_this_style_again', label: 'Do not use this style again' },
]

/** Ported from marketing_content/components/feedback-form.tsx. Server Actions -> API
 * route + router.refresh(), matching this hub's convention (no "use server" anywhere
 * in the codebase — see components/outreach/CompanyPanel.tsx). Admin-gated server-side
 * by app/api/marketing/feedback/route.ts. */
export function FeedbackForm({
  targetType,
  targetId,
  isAdmin,
}: {
  targetType: FeedbackTargetType
  targetId: string
  isAdmin: boolean
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const [freeText, setFreeText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!isAdmin) return null

  function toggle(tag: string) {
    setSelected((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const res = await fetch('/api/marketing/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, tags: selected, freeText: freeText || undefined }),
      })
      if (!res.ok) {
        setError('Could not save feedback — try again.')
        return
      }
      setSubmitted(true)
      setSelected([])
      setFreeText('')
      router.refresh()
    })
  }

  return (
    <div className="border-t border-zinc-200 pt-4 text-sm dark:border-zinc-700/60">
      <p className="font-medium text-zinc-900 dark:text-white">Feedback</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {TAGS.map((tag) => (
          <button
            key={tag.value}
            type="button"
            onClick={() => toggle(tag.value)}
            className={
              selected.includes(tag.value)
                ? 'rounded border border-zinc-900 bg-zinc-900 px-2 py-1 text-xs text-white dark:border-white dark:bg-white dark:text-zinc-900'
                : 'rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'
            }
          >
            {tag.label}
          </button>
        ))}
      </div>
      <textarea
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
        placeholder="Optional free-text notes"
        className="mt-2 w-full rounded border border-zinc-300 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        rows={2}
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || selected.length === 0}
        className="mt-2 rounded border border-zinc-900 px-3 py-1 text-xs text-zinc-900 disabled:opacity-40 dark:border-white dark:text-white"
      >
        {isPending ? 'Submitting…' : 'Submit feedback'}
      </button>
      {submitted && !isPending && <p className="mt-1 text-xs text-zinc-500">Feedback recorded.</p>}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
