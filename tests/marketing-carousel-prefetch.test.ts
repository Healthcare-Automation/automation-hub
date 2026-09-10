import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/** History on this file:
 *
 * 2026-09-08 (superseded below): CarouselPreview served each slide from a DB-backed route
 * on demand, with nothing loading a slide's bytes until the user actually clicked to it —
 * every swipe was a cold Postgres round trip. Fixed by prefetching ALL slides for a draft
 * the instant its card mounted.
 *
 * 2026-09-09 (this version): that full-carousel-prefetch fix became its own regression at
 * real queue volume. 23 drafts x 3-4 slides = ~85 simultaneous DB-backed image requests
 * firing on a single page load, each against the session-mode Supabase pooler (capped at
 * 15 connections — EMAXCONNSESSION), so a chunk of requests failed and rendered as blank/
 * broken slides (Andy's screenshot: slide 3/3 blank, siblings fine — the classic partial-
 * failure signature of pool exhaustion, not corrupted data). Fixed by only prefetching the
 * slide(s) immediately adjacent to the one currently shown — re-running as `index` changes
 * so it stays just-in-time instead of front-loading the whole carousel. Bounds concurrent
 * requests per card to ~2 regardless of slide/draft count, while keeping the instant-swipe
 * feel for normal forward/back browsing.
 *
 * No component-rendering harness exists in this repo (tests here are pure-logic/string, see
 * marketing-slide-renderer.test.ts), so this checks the fix is present in source — the same
 * pattern used for the vocab7 garden-effects source-assertion tests. */

const src = readFileSync(new URL('../components/marketing/CarouselPreview.tsx', import.meta.url), 'utf8')

test('only the neighboring slides are prefetched via new Image(), not the whole carousel', () => {
  assert.match(
    src,
    /useEffect\(\(\) => \{[\s\S]*?const neighbors = \[[\s\S]*?for \(const i of neighbors\) \{[\s\S]*?new Image\(\)[\s\S]*?\}, \[draftId, hasCarousel, total, index, interacted\]\)/,
  )
  assert.match(src, /img\.src = `\/api\/marketing\/instagram-image\/\$\{draftId\}\?slide=\$\{i\}`/)
})

test('the prefetch effect re-runs on index change (bounded, just-in-time — not a one-shot full-carousel load)', () => {
  const m = src.match(/\}, \[([^\]]*)\]\)\s*\n\s*if \(total === 0\)/)
  assert.ok(m, 'expected the prefetch useEffect deps array right before the total===0 branch')
  assert.match(m![1], /\bindex\b/)
})

test('the prefetch effect never loops over every slide (that was the pool-exhaustion regression)', () => {
  const effectBody = src.match(/const neighbors[\s\S]*?\}, \[draftId, hasCarousel, total, index, interacted\]\)/)
  assert.ok(effectBody, 'expected to find the prefetch effect body')
  assert.doesNotMatch(effectBody![0], /for \(let i = 0; i < total; i\+\+\)/)
})

// 2026-09-10 (third pass): even neighbor-prefetch on mount was 3 x 27 = 81 requests per page
// load against a 15-connection pool. Nothing prefetches until the user hovers/touches the
// card, and the visible slide itself is loading="lazy" so off-screen cards fetch nothing.
test('nothing is prefetched until the user interacts with the card', () => {
  assert.match(src, /if \(!interacted \|\| !hasCarousel \|\| total <= 1\) return/)
  assert.match(src, /onMouseEnter=\{\(\) => setInteracted\(true\)\}/)
  assert.match(src, /onTouchStart=\{\(\) => setInteracted\(true\)\}/)
})

test('the visible slide is lazy-loaded and hidden until it has actually loaded (no broken glyph mid-retry)', () => {
  assert.match(src, /loading="lazy"/)
  assert.match(src, /loaded \? 'opacity-100' : 'opacity-0'/)
})
