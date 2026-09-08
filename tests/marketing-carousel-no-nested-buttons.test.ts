import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/** Andy (2026-09-08, two screenshots, from two different browsers): "shits breaking" /
 * "Everything is broken it seems like" — the whole Marketing board crashed to "This page
 * couldn't load" with a different error digest each time. Traced live (headless Chrome with
 * a real admin session) to an uncaught "Minified React error #418" — a hydration mismatch.
 * Root cause: InstagramQueueBoard wrapped <CarouselPreview> in a <button onClick={onToggle}>
 * to make the whole card clickable, but CarouselPreview renders its OWN prev/next <button>s
 * once a draft has more than one slide. A <button> can never contain another <button> per
 * the HTML spec; the browser silently reparents the nested one while parsing the server's
 * HTML, so the DOM the client hydrates against doesn't match what React rendered on the
 * server -- exactly error #418. It only manifested once a draft actually had slideCount > 1
 * (so the carousel's own nav buttons rendered), which is why it looked intermittent /
 * "sometimes works" rather than a hard, always-reproducing bug.
 *
 * Fix: the clickable wrapper around CarouselPreview is a <div role="button"> (real click +
 * keyboard handling, valid HTML with real <button>s nested inside), not a <button>. This
 * guards the fix at the source level, in the same style as marketing-carousel-prefetch.test.ts
 * (no component-rendering harness exists in this repo). */

const boardSrc = readFileSync(new URL('../components/marketing/InstagramQueueBoard.tsx', import.meta.url), 'utf8')

test('the CarouselPreview wrapper in the card grid is a div, never a button (CarouselPreview renders its own nested buttons)', () => {
  const idx = boardSrc.indexOf('<CarouselPreview draftId={draft.id} slideCount={draft.slideCount} legacyImageUrl={draft.imageUrl} />')
  assert.notEqual(idx, -1, 'expected to find the card-grid CarouselPreview usage')
  const before = boardSrc.slice(Math.max(0, idx - 400), idx)
  // the nearest unclosed opening tag before this usage must be a div, not a button
  const lastOpenDiv = before.lastIndexOf('<div')
  const lastOpenButton = before.lastIndexOf('<button')
  assert.ok(lastOpenDiv > lastOpenButton, `expected the nearest wrapping element to be <div>, found a <button> more recently at offset ${lastOpenButton} vs <div> at ${lastOpenDiv}`)
})

test('the div wrapper is keyboard-accessible (role=button + tabIndex + Enter/Space handling), since it replaces a real <button>', () => {
  assert.match(boardSrc, /role="button"\s*\n\s*tabIndex=\{0\}\s*\n\s*onClick=\{onToggle\}\s*\n\s*onKeyDown=\{/)
  assert.match(boardSrc, /e\.key === 'Enter' \|\| e\.key === ' '/)
})
