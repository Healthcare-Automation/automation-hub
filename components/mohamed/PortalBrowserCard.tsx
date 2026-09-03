'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  describeBrowser,
  describeCommandOutcome,
  type BrowserCommandRow,
  type BrowserStatusRow,
} from '@/lib/mohamedBrowserPresentation'

type Snapshot = {
  status: BrowserStatusRow | null
  latest: BrowserCommandRow | null
  runInFlight: boolean
  notMigrated?: boolean
}

const toneStyles = {
  off: { dot: 'bg-zinc-400', text: 'text-zinc-600 dark:text-zinc-400' },
  starting: { dot: 'bg-amber-500 animate-pulse', text: 'text-amber-800 dark:text-amber-300' },
  ready: { dot: 'bg-emerald-500', text: 'text-emerald-800 dark:text-emerald-300' },
  attention: { dot: 'bg-red-500', text: 'text-red-800 dark:text-red-300' },
  busy: { dot: 'bg-emerald-500 animate-pulse', text: 'text-emerald-800 dark:text-emerald-300' },
} as const

/**
 * Start / Stop for the VPS portal browser (Andy 2026-09-03). Chrome used to
 * run 24/7 and collided with other agents on the server; billing is weekly,
 * so it now runs only while needed and stops itself after 4h idle. Polls
 * /api/mohamed/browser every 10s so the "Starting…" -> "Ready" transition
 * shows up without a reload. Buttons are admin-only; Mohamed sees the state.
 */
export function PortalBrowserCard({ canControl, initial }: { canControl: boolean; initial: Snapshot | null }) {
  const [snap, setSnap] = useState<Snapshot | null>(initial)
  const [pending, setPending] = useState<'start' | 'stop' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/mohamed/browser')
      const data = await res.json()
      if (data.ok) setSnap({ status: data.status, latest: data.latest, runInFlight: data.runInFlight, notMigrated: data.notMigrated })
    } catch {
      // Best-effort: keep the last known state rather than flicker.
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(refresh, 10_000)
    return () => clearInterval(id)
  }, [refresh])

  async function send(command: 'start' | 'stop') {
    setPending(command)
    setError(null)
    try {
      const res = await fetch('/api/mohamed/browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      })
      const data = await res.json().catch(() => ({ ok: false }))
      if (!res.ok || !data.ok) setError(data.error ?? 'Could not send the request.')
      await refresh()
    } catch {
      setError('Network error — try again.')
    } finally {
      setPending(null)
    }
  }

  if (snap?.notMigrated) return null

  const view = snap
    ? describeBrowser(snap.status, snap.latest, snap.runInFlight)
    : { tone: 'off' as const, label: 'Checking…', detail: null }
  const styles = toneStyles[view.tone]
  const outcome = describeCommandOutcome(snap?.latest ?? null)
  const isOff = view.tone === 'off'
  const waiting = pending !== null || snap === null || snap.latest?.status === 'pending'
  const stopBlocked = view.tone === 'busy'

  return (
    <section data-section="browser" className="mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Portal browser</h2>
          <p className={`mt-1 flex items-center gap-2 text-xs font-medium ${styles.text}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${styles.dot}`} aria-hidden />
            {view.label}
          </p>
          {view.detail && <p className="mt-1 text-xs text-zinc-500">{view.detail}</p>}
          {outcome && <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">{outcome}</p>}
          {error && <p className="mt-1 text-xs text-red-700 dark:text-red-400">{error}</p>}
        </div>
        {canControl && (
          <div className="flex shrink-0 items-center gap-2">
            {isOff ? (
              <button
                type="button"
                onClick={() => send('start')}
                disabled={waiting}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {pending === 'start' ? 'Starting…' : 'Start browser'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => send('stop')}
                disabled={waiting || stopBlocked}
                title={stopBlocked ? 'A run is in progress' : undefined}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {pending === 'stop' ? 'Stopping…' : 'Stop browser'}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
