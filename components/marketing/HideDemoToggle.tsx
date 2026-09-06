'use client'

import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

const COOKIE_NAME = 'mkt_hide_demo'

/** "Hide demo data" toggle — defaults to on once any live data exists (server computes
 * the default in app/marketing/page.tsx / trend-radar/page.tsx via hasLiveMarketingData),
 * but is always overridable here. Plain cookie + router.refresh(), no API round trip. */
export function HideDemoToggle({ hideDemo }: { hideDemo: boolean }) {
  const router = useRouter()

  function toggle() {
    const next = !hideDemo
    document.cookie = `${COOKIE_NAME}=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors',
        hideDemo
          ? 'border-zinc-300 bg-zinc-900/[0.04] text-zinc-700 dark:border-zinc-700/50 dark:bg-zinc-800/40 dark:text-zinc-300'
          : 'border-amber-400/60 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300',
      )}
    >
      <span
        className={cn(
          'inline-block h-2 w-2 rounded-full',
          hideDemo ? 'bg-zinc-400 dark:bg-zinc-600' : 'bg-amber-500',
        )}
      />
      {hideDemo ? 'Demo data hidden' : 'Showing demo data'}
    </button>
  )
}
