import Link from 'next/link'

export type HubTab = 'proxi' | 'mohamed' | 'outreach' | 'marketing'

const TABS: { key: HubTab; href: string; label: string }[] = [
  { key: 'proxi', href: '/', label: 'Proxi' },
  { key: 'mohamed', href: '/mohamed', label: 'Mohamed' },
  { key: 'outreach', href: '/outreach', label: 'Outreach' },
  { key: 'marketing', href: '/marketing', label: 'Marketing' },
]

/** Shared tab switcher shown identically on all hub tabs (admin view).
 *  Active tab is a solid pill; the rest are quiet links. On narrow
 *  viewports the row scrolls horizontally instead of clipping tabs off
 *  the edge of the screen (Andy, 2026-09-26: "tabs at the top still goes
 *  out of screen" on mobile) -- each tab is shrink-0 so flexbox never
 *  squeezes a label, and the row itself owns the overflow so it never
 *  forces the page wider than the viewport. */
export function HubNav({ active }: { active: HubTab }) {
  return (
    <nav className="flex min-w-0 gap-0.5 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-1 text-xs shadow-sm [-webkit-overflow-scrolling:touch] [scrollbar-width:none] dark:border-zinc-700/60 dark:bg-zinc-900/60 dark:shadow-none [&::-webkit-scrollbar]:hidden">
      {TABS.map((t) =>
        t.key === active ? (
          <a key={t.key} href={t.href} className="shrink-0 rounded-md bg-zinc-900 px-3 py-1.5 font-medium whitespace-nowrap text-white dark:bg-white dark:text-zinc-900">
            {t.label}
          </a>
        ) : (
          <Link
            key={t.key}
            href={t.href}
            prefetch
            className="shrink-0 rounded-md px-3 py-1.5 whitespace-nowrap text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          >
            {t.label}
          </Link>
        ),
      )}
    </nav>
  )
}
