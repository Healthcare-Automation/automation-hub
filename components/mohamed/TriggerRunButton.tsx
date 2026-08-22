'use client'

import { useState } from 'react'

export function TriggerRunButton({ inFlight }: { inFlight: { status: string; requestedAt: string } | null }) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function trigger() {
    setPending(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/mohamed/trigger', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not queue the run.')
        return
      }
      // Nothing more to do here: LiveDashboardRefresh (mounted on the page)
      // soft-refreshes every 15s, so the "in flight" banner and eventual
      // result show up on their own — no manual refresh needed.
      setMessage('Run queued — the page updates on its own, no need to refresh.')
    } catch {
      setError('Network error — could not reach the hub.')
    } finally {
      setPending(false)
    }
  }

  if (inFlight) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
        A run is <span className="font-semibold">{inFlight.status}</span> (queued {inFlight.requestedAt.slice(11, 16)} UTC) —
        this updates on its own.
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={trigger}
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {pending ? 'Queuing…' : 'Run now'}
      </button>
      {message && <p className="max-w-xs text-right text-[11px] text-emerald-700">{message}</p>}
      {error && <p className="max-w-xs text-right text-[11px] text-red-700">{error}</p>}
    </div>
  )
}
