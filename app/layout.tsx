import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import ThemeToggle from '@/components/ThemeToggle'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Automation Hub',
  description: 'Real-time status of automation pipelines',
  icons: { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='14' fill='%2322c55e'/></svg>" },
}

/**
 * Runs before first paint so the page never flashes the wrong theme. Mirrors the logic in
 * components/ThemeToggle.tsx: stored `hub-theme` wins, and `auto` (the default) means dark
 * between 21:00 and 05:59 in the viewer's own timezone.
 */
const THEME_BOOTSTRAP = `(function(){try{var m=localStorage.getItem('hub-theme');if(m!=='light'&&m!=='dark')m='auto';var h=new Date().getHours();var d=m==='dark'||(m==='auto'&&(h>=21||h<6));var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light'}catch(_){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-screen bg-[#f4f5f7] text-zinc-900 antialiased dark:bg-black dark:text-white">
        <ThemeToggle />
        {children}
      </body>
    </html>
  )
}
