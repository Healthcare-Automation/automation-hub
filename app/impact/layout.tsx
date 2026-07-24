import Link from 'next/link'
import { DjcTabs } from '@/components/djc/DjcTabs'

/** Same shell as the DJC intelligence pages so Impact reads as part of one product,
 *  but titled for the whole operation — this tab spans both automations. */
export default function ImpactLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="text-xs text-zinc-500 transition-colors hover:text-zinc-300">
              ← Automation Hub
            </Link>
            <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-white">
              Proxi Automation — Impact
            </h1>
          </div>
          <DjcTabs />
        </header>
        {children}
      </div>
    </main>
  )
}
