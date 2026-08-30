import Link from 'next/link'

export type HubTab = 'proxi' | 'mohamed' | 'outreach'

const TABS: { key: HubTab; href: string; label: string }[] = [
  { key: 'proxi', href: '/', label: 'Proxi' },
  { key: 'mohamed', href: '/mohamed', label: 'Mohamed' },
  { key: 'outreach', href: '/outreach', label: 'Outreach' },
]

/** Shared tab switcher shown identically on all hub tabs (admin view).
 *  Active tab is a solid pill; the rest are quiet links. */
export function HubNav({ active }: { active: HubTab }) {
  return (
    <nav className="flex rounded-lg border border-zinc-200 bg-white p-1 text-xs shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/60 dark:shadow-none">
      {TABS.map((t) =>
        t.key === active ? (
          <a key={t.key} href={t.href} className="rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white dark:bg-white dark:text-zinc-900">
            {t.label}
          </a>
        ) : (
          <Link
            key={t.key}
            href={t.href}
            prefetch
            className="rounded-md px-3 py-1.5 text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          >
            {t.label}
          </Link>
        ),
      )}
    </nav>
  )
}
