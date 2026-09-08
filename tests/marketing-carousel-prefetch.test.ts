import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/** Andy (2026-09-08, screenshot of the Instagram queue board): "it takes too long to slide
 * over to the next carousel." Root cause: CarouselPreview served each slide from a DB-backed
 * route (getCarouselSlideImage) on demand, with nothing loading a slide's bytes until the
 * user actually clicked to it — so every swipe was a cold Postgres round trip before the
 * next frame could paint. No component-rendering harness exists in this repo (tests here are
 * pure-logic/string, see marketing-slide-renderer.test.ts) so this checks the fix is actually
 * present in source, the same pattern used for the vocab7 garden-effects source-assertion
 * tests: a real regression here silently removing the prefetch effect would fail this. */

const src = readFileSync(new URL('../components/marketing/CarouselPreview.tsx', import.meta.url), 'utf8')

test('every carousel slide is prefetched via new Image() when the card mounts, not on click', () => {
  assert.match(src, /useEffect\(\(\) => \{[\s\S]*?for \(let i = 0; i < total; i\+\+\) \{[\s\S]*?new Image\(\)[\s\S]*?\}, \[draftId, hasCarousel, total\]\)/)
  assert.match(src, /img\.src = `\/api\/marketing\/instagram-image\/\$\{draftId\}\?slide=\$\{i\}`/)
})

test('the prefetch effect does not depend on the current slide index (would re-fire on every swipe)', () => {
  const m = src.match(/\}, \[([^\]]*)\]\)\s*\n\s*if \(total === 0\)/)
  assert.ok(m, 'expected the prefetch useEffect deps array right before the total===0 branch')
  assert.doesNotMatch(m![1], /\bindex\b/)
})
