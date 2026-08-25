'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** localStorage key `UpdatedAgoIndicator` reads to render "Updated Xs ago" —
 * shared this way because the indicator lives elsewhere in the tree (next to
 * the status strip) while this component owns the refresh timer. */
export const LAST_REFRESH_KEY = 'mohamed:last-refresh-at'

function markRefreshed() {
  try {
    localStorage.setItem(LAST_REFRESH_KEY, String(Date.now()))
  } catch {}
}

/** Soft-refresh server-rendered dashboard data on an interval (and when tab becomes visible). */
export function LiveDashboardRefresh({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    markRefreshed()
    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      router.refresh()
      markRefreshed()
    }

    const id = setInterval(refresh, intervalMs)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [router, intervalMs])

  return null
}
