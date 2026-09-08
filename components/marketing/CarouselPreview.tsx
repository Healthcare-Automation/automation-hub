'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

/** Swipeable carousel preview for an Instagram draft's rendered slides (2026-09-08 carousel
 * redesign). Falls back to the single legacy image when a draft has no carousel slides
 * (slideCount === 0, pre-redesign drafts) — same 4:5 aspect box either way so the grid
 * layout doesn't jump between cards. */
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
