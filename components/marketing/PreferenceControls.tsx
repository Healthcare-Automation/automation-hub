'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { PreferenceStatus } from '@/lib/marketing/types'

export function PreferenceControls({ id, status }: { id: string; status: PreferenceStatus }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function setStatus(next: PreferenceStatus) {
    startTransition(async () => {
      await fetch('/api/marketing/preferences/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: next }),
      })
      router.refresh()
    })
  }

  function remove() {
    startTransition(async () => {
      await fetch('/api/marketing/preferences/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status !== 'active' && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => setStatus('active')}
          className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
        >
          Reactivate
        </button>
      )}
      {status !== 'temporary' && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => setStatus('temporary')}
          className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
        >
          Mark temporary
        </button>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={remove}
        className="rounded border border-red-600/60 px-2 py-1 text-xs text-red-700 disabled:opacity-40 dark:text-red-400"
      >
        Remove
      </button>
    </div>
  )
}

export function ResetHistoryButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (confirm('Reset all learned preference history for this org?')) {
          startTransition(async () => {
            await fetch('/api/marketing/preferences/reset', { method: 'POST' })
            router.refresh()
          })
        }
      }}
      className="rounded border border-red-600/60 px-3 py-1 text-xs text-red-700 disabled:opacity-40 dark:text-red-400"
    >
      {isPending ? 'Resetting…' : 'Reset all history'}
    </button>
  )
}
