'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/** Swipeable carousel preview for an Instagram draft's rendered slides (2026-09-08 carousel
 * redesign). Falls back to the single legacy image when a draft has no carousel slides
 * (slideCount === 0, pre-redesign drafts) — same 4:5 aspect box either way so the grid
 * layout doesn't jump between cards.
 *
 * Andy (2026-09-08, screenshot of this exact component): "it takes too long to slide over
 * to the next carousel." Root cause: each slide is served by its own DB-backed route
 * (getCarouselSlideImage reads image_data bytes from marketing_content_draft_images on
 * every request) and nothing loaded a slide's bytes until the user actually clicked to it —
 * so every swipe was a cold round trip to Postgres before the next frame could even start
 * painting. The route's `Cache-Control: immutable` only helps once a slide has been fetched
 * once; it never prefetched anything ahead of a click. Now every OTHER slide for this draft
 * is prefetched into the browser's HTTP cache the moment the card mounts, so by the time a
 * user clicks next/prev the image is already local and the swap is instant. */
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

  // Prefetch every slide's bytes as soon as this card is on screen, not on
  // demand. `new Image()` fires a real GET and the browser caches the
  // response per the route's Cache-Control header, so a later <img src=...>
  // pointed at the same URL resolves from cache instead of hitting the DB
  // again. Runs once per draft (not on every swipe) — after the first pass,
  // every slide is already cached, so there is nothing left to prefetch.
  useEffect(() => {
    if (!hasCarousel || total <= 1) return
    for (let i = 0; i < total; i++) {
      const img = new Image()
      img.src = `/api/marketing/instagram-image/${draftId}?slide=${i}`
    }
    // no cleanup needed: letting an in-flight prefetch finish is exactly
    // the point, and the browser cache is what we're populating
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, hasCarousel, total])

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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" />

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
