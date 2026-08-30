'use client'

import { useEffect, useState } from 'react'
import { LAST_REFRESH_KEY } from './LiveDashboardRefresh'

/** Small gray "Updated Xs ago" text next to the status strip — visual proof
 * the page is live, since LiveDashboardRefresh's polling is otherwise silent.
 * Starts as null (not "Updated just now") so server and pre-mount client
 * markup match; it fills in once mounted. */
export function UpdatedAgoIndicator() {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    const update = () => {
      const raw = localStorage.getItem(LAST_REFRESH_KEY)
      const at = raw ? Number(raw) : Date.now()
      const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000))
      setLabel(seconds < 2 ? 'Updated just now' : `Updated ${seconds}s ago`)
    }
    update()
    const id = setInterval(update, 1_000)
    return () => clearInterval(id)
  }, [])

  if (!label) return null
  return <span className="text-[11px] text-zinc-600 dark:text-zinc-400">{label}</span>
}
