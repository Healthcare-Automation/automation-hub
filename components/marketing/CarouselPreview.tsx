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
  const [loaded, setLoaded] = useState(false)

  // Reset retry state whenever the underlying src changes (new slide, new draft) — a stale
  // failed/retrying state from a previous image must never bleed into the next one.
  useEffect(() => {
    setAttempt(0)
    setFailed(false)
    setLoaded(false)
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

  // Andy's 2026-09-10 screenshot: the browser's broken-image glyph was visible the whole
  // time the auto-retry loop ran (up to ~30s) before "tap to retry" ever appeared. The <img>
  // is now invisible until it has genuinely loaded — the card's gray box shows in the
  // meantime, which reads as "loading", not "broken". loading="lazy" means off-screen cards
  // don't fetch at all until scrolled near (see CarouselPreview's prefetch note).
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={finalSrc}
      src={finalSrc}
      alt=""
      loading="lazy"
      className={cn('h-full w-full object-cover transition-opacity duration-200', loaded ? 'opacity-100' : 'opacity-0')}
      onError={handleError}
      onLoad={() => {
        setLoaded(true)
        onLoaded?.()
      }}
    />
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
  // 2026-09-10 fix #3: prefetch NOTHING until the user actually engages with this card.
  // Yesterday's "only prefetch neighbors" change still fired visible + 2 neighbors on mount
  // = 3 requests x 27 cards = 81 DB-backed requests per page load against a 15-connection
  // pool. It went from ~100 to 81 — both saturate the pool every single time the queue page
  // opens, which is why this "kept breaking" (4 EMAXCONNSESSION events in 2 days, each one
  // lining up with Andy opening the page). Now: the visible slide loads lazily (native
  // loading="lazy" in SlideImage — off-screen cards fetch nothing), and neighbors prefetch
  // only after hover/touch/swipe. Page load = roughly the 6-9 cards in the viewport. Under
  // the cap with room to spare.
  const [interacted, setInteracted] = useState(false)
  const hasCarousel = slideCount > 0
  const total = hasCarousel ? slideCount : legacyImageUrl ? 1 : 0

  useEffect(() => {
    if (!interacted || !hasCarousel || total <= 1) return
    const neighbors = [(index + 1) % total, (index - 1 + total) % total]
    for (const i of neighbors) {
      const img = new Image()
      img.src = `/api/marketing/instagram-image/${draftId}?slide=${i}`
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, hasCarousel, total, index, interacted])

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
    <div
      className={cn('group relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-900', className)}
      onMouseEnter={() => setInteracted(true)}
      onTouchStart={() => setInteracted(true)}
    >
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
