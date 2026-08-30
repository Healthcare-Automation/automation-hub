'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Site-wide theme control. Three modes, cycled by clicking:
 *
 *   light -> dark -> auto -> light
 *
 * `auto` follows the viewer's own clock (not the server's, not the OS colour scheme):
 * light from 06:00 to 20:59 local, dark from 21:00 to 05:59. It is re-evaluated every
 * minute so an open tab flips at 9pm without a reload.
 *
 * The choice lives in localStorage under `hub-theme`. The blocking script in app/layout.tsx
 * replays the same logic before first paint, so this component only has to keep the class
 * in sync after hydration — it never causes the initial theme.
 */

export type ThemeMode = 'light' | 'dark' | 'auto'

const STORAGE_KEY = 'hub-theme'
const CYCLE: ThemeMode[] = ['light', 'dark', 'auto']

/** Dark between 21:00 and 05:59 in whatever timezone the browser is in. */
function autoPrefersDark(): boolean {
  const hour = new Date().getHours()
  return hour >= 21 || hour < 6
}

function resolve(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'auto') return autoPrefersDark() ? 'dark' : 'light'
  return mode
}

function applyToDocument(mode: ThemeMode): 'light' | 'dark' {
  const resolved = resolve(mode)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  return resolved
}

function readStored(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw
  } catch {
    /* private mode / blocked storage — fall through to the default */
  }
  return 'auto'
}

const LABEL: Record<ThemeMode, string> = {
  light: 'Light theme',
  dark: 'Dark theme',
  auto: 'Auto theme (light 6am–9pm, dark 9pm–6am)',
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>('auto')
  const [mounted, setMounted] = useState(false)

  // Adopt whatever the pre-paint script already decided, so the icon matches the page.
  useEffect(() => {
    setMode(readStored())
    setMounted(true)
  }, [])

  // In auto mode the resolved theme is a function of the clock, so keep checking.
  useEffect(() => {
    if (!mounted) return
    applyToDocument(mode)
    if (mode !== 'auto') return
    const id = setInterval(() => applyToDocument('auto'), 60_000)
    return () => clearInterval(id)
  }, [mode, mounted])

  const cycle = useCallback(() => {
    setMode(prev => {
      const next = CYCLE[(CYCLE.indexOf(prev) + 1) % CYCLE.length]
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* not persisting is survivable; the session still switches */
      }
      return next
    })
  }, [])

  return (
    <button
      type="button"
      onClick={cycle}
      title={mounted ? LABEL[mode] : 'Theme'}
      aria-label={mounted ? LABEL[mode] : 'Theme'}
      className="fixed right-3 top-3 z-50 flex h-7 w-7 items-center justify-center rounded-full border border-zinc-300 bg-white/80 text-zinc-600 shadow-sm backdrop-blur transition-colors hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-400 dark:shadow-none dark:hover:border-zinc-600 dark:hover:text-zinc-100 print:hidden"
    >
      <span className={mounted ? '' : 'opacity-0'}>
        {mode === 'light' ? <SunIcon /> : mode === 'dark' ? <MoonIcon /> : <AutoIcon />}
      </span>
    </button>
  )
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  )
}

/** Half-filled disc — the usual shorthand for "follow something else". */
function AutoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
    </svg>
  )
}
