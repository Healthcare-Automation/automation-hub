'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/marketing', label: 'Briefing' },
  { href: '/marketing/trend-radar', label: 'Trend Radar' },
  { href: '/marketing/story-workspace', label: 'Story Workspace' },
  { href: '/marketing/content-library', label: 'Content Library' },
  { href: '/marketing/voice-and-learning', label: 'Voice and Learning' },
  { href: '/marketing/sources', label: 'Sources' },
  { href: '/marketing/settings', label: 'Settings' },
]

/** Sub-nav within the Marketing tab, one route per Practice Story Engine page area —
 * mirrors components/djc/DjcTabs.tsx's pattern (active-tab detection via pathname). */
export function MarketingTabs() {
  const pathname = usePathname()
  return (
    <nav className="flex max-w-full flex-wrap gap-0.5 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-900/[0.04] p-0.5 dark:border-zinc-700/50 dark:bg-zinc-800/40">
      {TABS.map((t) => {
        const active = t.href === '/marketing' ? pathname === '/marketing' : pathname?.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700/70 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300',
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
