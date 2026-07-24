'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/djc/overview', label: 'Overview' },
  { href: '/djc/pipeline', label: 'Pipeline' },
  { href: '/djc/candidates', label: 'Candidates' },
  { href: '/djc/acquisition', label: 'Acquisition' },
  { href: '/impact', label: 'Impact' },
]

export function DjcTabs() {
  const pathname = usePathname()
  return (
    <nav className="inline-flex max-w-full overflow-x-auto rounded-lg border border-zinc-700/50 bg-zinc-800/40 p-0.5">
      {TABS.map(t => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            'whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors',
            pathname?.startsWith(t.href)
              ? 'bg-zinc-700/70 text-white shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
