'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function GenerateContentForm({ opportunityId, angleId }: { opportunityId: string; angleId: string }) {
  const router = useRouter()
  const [format, setFormat] = useState<'linkedin_post' | 'video_script'>('linkedin_post')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-700/60">
      <p className="text-sm font-medium text-zinc-900 dark:text-white">Choose a format</p>
      <div className="flex gap-4 text-sm text-zinc-700 dark:text-zinc-300">
        <label className="flex items-center gap-1.5">
          <input type="radio" name="format" checked={format === 'linkedin_post'} onChange={() => setFormat('linkedin_post')} />
          LinkedIn post
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="format" checked={format === 'video_script'} onChange={() => setFormat('video_script')} />
          Short-form video script
        </label>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const res = await fetch('/api/marketing/content/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ opportunityId, angleId, format }),
            })
            if (!res.ok) {
              setError('Could not generate — try again.')
              return
            }
            const { draftId } = await res.json()
            router.push(`/marketing/content-library/${draftId}`)
          })
        }
        className="rounded border border-zinc-900 px-3 py-1 text-xs text-zinc-900 disabled:opacity-40 dark:border-white dark:text-white"
      >
        {isPending ? 'Generating…' : 'Generate'}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
