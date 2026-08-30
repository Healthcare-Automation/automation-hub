import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Proxi — Client Report',
  robots: { index: false, follow: false },
}

/** Standalone shell for the client portal — no hub navigation, nothing to wander into. */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#eceef1] text-zinc-900 dark:bg-black dark:text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</div>
    </main>
  )
}
