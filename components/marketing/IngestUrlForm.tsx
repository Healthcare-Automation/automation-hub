'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function IngestUrlForm() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await fetch('/api/marketing/sources/ingest-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.error === 'unauthorized' ? 'Sign in as admin to ingest a URL.' : 'Failed to ingest URL.')
        return
      }
      setUrl('')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
      <input
        type="url"
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://example.com/article"
        className="min-w-64 flex-1 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded border border-zinc-900 px-3 py-1 text-sm text-zinc-900 disabled:opacity-40 dark:border-white dark:text-white"
      >
        {isPending ? 'Ingesting…' : 'Ingest URL'}
      </button>
      {error && <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  )
}
