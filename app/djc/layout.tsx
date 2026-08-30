import Link from 'next/link'
import { DjcTabs } from '@/components/djc/DjcTabs'

/** Shared shell for the DJC intelligence pages: brand header + top-level tabs.
 *  Information architecture is top-down: Overview (daily must-sees) → Pipeline (outcomes) →
 *  Candidates (who they are) → Acquisition (how they're sourced and what it costs). */
export default function DjcLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="text-xs text-zinc-500 transition-colors hover:text-zinc-800 dark:hover:text-zinc-300">
              ← Automation Hub
            </Link>
            <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">
              Proxi Automation — Intelligence
            </h1>
          </div>
          <DjcTabs />
        </header>
        {children}
      </div>
    </main>
  )
}
