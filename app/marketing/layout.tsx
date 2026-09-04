import Link from 'next/link'
import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { MarketingTabs } from '@/components/marketing/MarketingTabs'
import { HubNav } from '@/components/HubNav'

/** Shared shell for the Marketing tab (Practice Story Engine port): brand header,
 *  top-level hub nav, and the 7-page sub-nav. Mirrors app/djc/layout.tsx's pattern. */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const isAdmin = await verifyAdminCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)

  return (
    <main className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="text-xs text-zinc-500 transition-colors hover:text-zinc-800 dark:hover:text-zinc-300">
              ← Automation Hub
            </Link>
            <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">
              Marketing — Practice Story Engine
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              Signal → trend cluster → scored story opportunity → three angles → content → feedback.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {isAdmin && <HubNav active="marketing" />}
            <MarketingTabs />
          </div>
        </header>
        {children}
      </div>
    </main>
  )
}
