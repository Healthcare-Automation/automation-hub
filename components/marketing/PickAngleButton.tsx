'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function PickAngleButton({
  opportunityId,
  angleId,
  isSelected,
  isAdmin,
}: {
  opportunityId: string
  angleId: string
  isSelected: boolean
  isAdmin: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!isAdmin) return null

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={isPending || isSelected}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const res = await fetch('/api/marketing/story/select-angle', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ opportunityId, angleId }),
            })
            if (!res.ok) {
              setError('Could not select — try again.')
              return
            }
            router.refresh()
          })
        }
        className="rounded border border-zinc-900 px-3 py-1 text-xs text-zinc-900 disabled:opacity-40 dark:border-white dark:text-white"
      >
        {isSelected ? 'Selected' : isPending ? 'Selecting…' : 'Pick this angle'}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  )
}
