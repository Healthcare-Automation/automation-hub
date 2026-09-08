import Link from 'next/link'
import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { MarketingTabs } from '@/components/marketing/MarketingTabs'
import { HubNav } from '@/components/HubNav'

/** Shared shell for the Marketing tab: brand header, top-level hub nav, and the 2-page
 * sub-nav (Instagram Queue + Settings). Rebuilt Instagram-only on 2026-09-08
 * (MARKETING_TAB_REBUILD_BRIEF.md) — mirrors app/djc/layout.tsx's pattern. Header/nav
 * visually refreshed the same day alongside the carousel image redesign to carry the warm
 * editorial identity (paper background, serif title, terracotta accent) into the shell
 * that frames it, rather than leaving it inside a generic dark-navy hub chrome. */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const isAdmin = await verifyAdminCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value)

  return (
    <main className="min-h-screen bg-[#F8F4EC] dark:bg-stone-950">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <Link href="/" className="text-xs text-stone-500 transition-colors hover:text-stone-800 dark:hover:text-stone-300">
              ← Automation Hub
            </Link>
            <h1 className="mt-2 font-serif text-2xl font-bold tracking-tight text-stone-800 dark:text-white">
              <span className="text-orange-700/80 dark:text-orange-400/80">&ldquo;</span> Marketing — Instagram
            </h1>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              UZU&apos;s brand-account Instagram content queue — generated Mon/Wed/Fri, reviewed here.
            </p>
          </div>
          {isAdmin && <HubNav active="marketing" />}
        </header>
        <div className="mb-6">
          <MarketingTabs />
        </div>
        {children}
      </div>
    </main>
  )
}
