'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** Soft-refresh server-rendered dashboard data on an interval (and when tab becomes visible). */
export function LiveDashboardRefresh({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      router.refresh()
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
