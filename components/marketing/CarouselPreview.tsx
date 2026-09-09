'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/** Swipeable carousel preview for an Instagram draft's rendered slides (2026-09-08 carousel
 * redesign). Falls back to the single legacy image when a draft has no carousel slides
 * (slideCount === 0, pre-redesign drafts) — same 4:5 aspect box either way so the grid
 * layout doesn't jump between cards.
 *
 * 2026-09-09 fix #1: this used to eagerly prefetch EVERY slide for EVERY draft the instant
 * its card mounted (`for (let i = 0; i < total; i++) new Image()...`). That was fine at the
 * original ~3-draft queue size, but at 23 drafts x 3-4 slides it fires ~85 simultaneous
 * DB-backed image requests on a single page load — each hitting Postgres through the
 * session-mode Supabase pooler, which is capped at 15 connections (EMAXCONNSESSION), so a
 * meaningful fraction of those requests failed/timed out and rendered as broken/blank
 * images. Fixed by only prefetching the ONE adjacent slide a user is actually about to see
 * (both neighbors on mount/swipe) rather than the whole carousel — bounds concurrent image
 * requests per card to ~2 regardless of how many slides or drafts are on screen.
 *
 * 2026-09-09 fix #2 (same day, recurred): a plain <img src=...> with no error handling means
 * ANY transient failure (a fresh pool-exhaustion spike, a cold Vercel function, a genuine
 * blip) renders as the browser's permanently-broken-image icon with zero recovery path —
 * the user has to hard-refresh and hope the transient condition has cleared by then. Combined
 * with the image route's Cache-Control: immutable header applying even to non-2xx responses
 * (fixed separately in app/api/marketing/instagram-image/[id]/route.ts), a single bad load
 * could get stuck in the browser's cache for 24h. Fixed here with a real retry: onError
 * bumps a cache-busting query param and retries automatically (bounded, with backoff) before
 * ever giving up and showing an explicit "failed to load — tap to retry" state instead of a
 * silent broken-image icon. This is the actual fix for "make sure this never happens
 * again" — not just narrowing the odds, but making a transient failure self-heal instead of
 * requiring a manual page reload. */
const MAX_AUTO_RETRIES = 3
const RETRY_DELAY_MS = 1500

function SlideImage({ src, onLoaded }: { src: string; onLoaded?: () => void }) {
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  // Reset retry state whenever the underlying src changes (new slide, new draft) — a stale
  // failed/retrying state from a previous image must never bleed into the next one.
  useEffect(() => {
    setAttempt(0)
    setFailed(false)
  }, [src])

  function handleError() {
    if (attempt < MAX_AUTO_RETRIES) {
      const next = attempt + 1
      setTimeout(() => setAttempt(next), RETRY_DELAY_MS * next)
    } else {
      setFailed(true)
    }
  }

  if (failed) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setAttempt(0)
          setFailed(false)
        }}
        className="flex h-full w-full flex-col items-center justify-center gap-1 bg-stone-100 text-[11px] text-stone-400 hover:text-stone-600 dark:bg-stone-900 dark:hover:text-stone-300"
      >
        <span>Image failed to load</span>
        <span className="underline">Tap to retry</span>
      </button>
    )
  }

  // Cache-busting only on a real retry (attempt > 0) — the first load still benefits from
  // the route's normal immutable caching on success.
  const finalSrc = attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}`

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={finalSrc} src={finalSrc} alt="" className="h-full w-full object-cover" onError={handleError} onLoad={onLoaded} />
  )
}

export function CarouselPreview({
  draftId,
  slideCount,
  legacyImageUrl,
  className,
}: {
  draftId: string
  slideCount: number
  legacyImageUrl: string | null
  className?: string
}) {
  const [index, setIndex] = useState(0)
  const hasCarousel = slideCount > 0
  const total = hasCarousel ? slideCount : legacyImageUrl ? 1 : 0

  // Prefetch only the slide(s) immediately adjacent to the current one — bounded to at most
  // 2 extra requests per card no matter how many slides/drafts exist, instead of the old
  // "every slide, every card, on every page load" behavior that exhausted the DB pool at
  // real queue volume. Still gives the instant-swipe feel for normal forward/back browsing.
  useEffect(() => {
    if (!hasCarousel || total <= 1) return
    const neighbors = [(index + 1) % total, (index - 1 + total) % total]
    for (const i of neighbors) {
      const img = new Image()
      img.src = `/api/marketing/instagram-image/${draftId}?slide=${i}`
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, hasCarousel, total, index])

  if (total === 0) {
    return (
      <div
        className={cn(
          'flex aspect-[4/5] w-full items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 text-center text-xs text-stone-400 dark:border-stone-700 dark:bg-stone-900/40',
          className,
        )}
      >
        No image generated yet
      </div>
    )
  }

  const src = hasCarousel ? `/api/marketing/instagram-image/${draftId}?slide=${index}` : legacyImageUrl!

  return (
    <div className={cn('group relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-900', className)}>
      <SlideImage src={src} />

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setIndex((i) => (i - 1 + total) % total)
            }}
            className="absolute left-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
            aria-label="Previous slide"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setIndex((i) => (i + 1) % total)
            }}
            className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
            aria-label="Next slide"
          >
            ›
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/50',
                )}
              />
            ))}
          </div>
          <div className="absolute right-2 top-2 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            {index + 1}/{total}
          </div>
        </>
      )}
    </div>
  )
}
