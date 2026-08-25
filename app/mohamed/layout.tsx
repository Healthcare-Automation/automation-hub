import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Mohamed Billing Review | Automation Hub',
  robots: { index: false, follow: false },
}

export default function MohamedLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-stone-100 text-stone-900">{children}</main>
}
