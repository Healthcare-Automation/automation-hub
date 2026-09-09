import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/** Andy, 2026-09-09 (second incident same day): "also this is breaking again. Make sure this
 * never happens again." Two real, independent gaps found:
 *
 * 1. app/api/marketing/instagram-image/[id]/route.ts's success-path response used
 *    Cache-Control: immutable, max-age=86400 unconditionally — a thrown DB error (pool
 *    exhaustion, transient timeout) or a 404 fell through without an explicit no-cache
 *    header, so some browsers/CDN layers could cache a FAILURE as if it were the real,
 *    permanent image. Once cached, a transient failure "sticks" for the full immutable
 *    window even after the underlying data is fine again.
 *
 * 2. components/marketing/CarouselPreview.tsx rendered a plain <img src=...> with no
 *    onError handling at all — any transient load failure rendered as the browser's
 *    permanently-broken-image icon with zero recovery path short of a manual hard refresh.
 *
 * Fixed: the route now wraps its DB reads in try/catch and sends Cache-Control: no-store on
 * every non-2xx path (db_error, not_found) — only a genuine success gets the long-lived
 * immutable header. The component now has a SlideImage wrapper with bounded auto-retry
 * (cache-busting query param + backoff) and an explicit "failed to load — tap to retry"
 * state, so a transient failure self-heals instead of requiring a manual reload.
 *
 * No component-rendering harness exists in this repo (tests here are pure-logic/string, same
 * convention as marketing-carousel-prefetch.test.ts). */

const routeSrc = readFileSync(
  new URL('../app/api/marketing/instagram-image/[id]/route.ts', import.meta.url),
  'utf8',
)
const previewSrc = readFileSync(new URL('../components/marketing/CarouselPreview.tsx', import.meta.url), 'utf8')

test('the image route never sends the immutable cache header on a non-2xx path', () => {
  // Every branch that returns before the final success response must carry no-store.
  const notFoundBranch = routeSrc.match(/if \(!bytes\) \{[\s\S]*?status: 404[\s\S]*?\}\)\s*\}/)
  assert.ok(notFoundBranch, 'expected the not-found branch')
  assert.match(notFoundBranch![0], /no-store/)

  const catchBranch = routeSrc.match(/\} catch \(err\) \{[\s\S]*?status: 503[\s\S]*?\}\)\s*\}/)
  assert.ok(catchBranch, 'expected a catch branch around the DB reads')
  assert.match(catchBranch![0], /no-store/)
})

test('the image route wraps its DB reads in try/catch (a thrown pool error must not crash the route)', () => {
  assert.match(routeSrc, /try \{[\s\S]*?getCarouselSlideImage[\s\S]*?getInstagramDraftImage[\s\S]*?\} catch/)
})

test('the success response still uses the long-lived immutable cache header', () => {
  const successBranch = routeSrc.slice(routeSrc.indexOf('return new NextResponse'))
  assert.match(successBranch, /immutable/)
})

test('CarouselPreview retries a failed slide image instead of leaving a permanently broken icon', () => {
  assert.match(previewSrc, /onError=\{handleError\}/)
  assert.match(previewSrc, /MAX_AUTO_RETRIES/)
})

test('CarouselPreview shows an explicit retry affordance after exhausting auto-retries, not a silent broken image', () => {
  assert.match(previewSrc, /Image failed to load/)
  assert.match(previewSrc, /Tap to retry/)
})
