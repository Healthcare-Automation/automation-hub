'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/marketing', label: 'Instagram Queue' },
  { href: '/marketing/settings', label: 'Settings' },
]

/** Sub-nav within the Marketing tab. Rebuilt Instagram-only on 2026-09-08
 * (MARKETING_TAB_REBUILD_BRIEF.md) — the old 8-tab Practice Story Engine nav (Briefing,
 * Trend Radar, Story Workspace, Content Library, Voice and Learning, Sources) is gone;
 * the Instagram Queue is now the tab's landing page. Restyled the same day (warm
 * paper/terracotta pill instead of the generic dark-navy hub look) to match the carousel
 * redesign's editorial identity — active-tab detection via pathname is unchanged. */
export function MarketingTabs() {
  const pathname = usePathname()
  return (
    <nav className="flex max-w-full flex-wrap gap-0.5 overflow-x-auto rounded-full border border-stone-200 bg-stone-900/[0.04] p-1 dark:border-stone-700/50 dark:bg-stone-800/40">
      {TABS.map((t) => {
        const active = t.href === '/marketing' ? pathname === '/marketing' : pathname?.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'bg-orange-700 text-white shadow-sm dark:bg-orange-600'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300',
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
