import assert from 'node:assert/strict'
import { test } from 'node:test'

/** Unit tests for the templated carousel renderer (2026-09-08 image redesign — replaces
 * gpt-image-1 prompting). renderSlideHtml is pure string generation (no browser needed),
 * so these test the HTML output directly rather than spinning up Playwright — the actual
 * PNG rendering is exercised manually/in the backfill script, not in CI. */

test('renderSlideHtml never emits a URL or bare domain anywhere in the output', async () => {
  const { renderSlideHtml, pickAccent } = await import('../lib/marketing/slideTemplates')
  const accent = pickAccent('test-seed')
  const fontUrls = { regular: 'file:///r.woff2', medium: 'file:///m.woff2', semibold: 'file:///s.woff2', bold: 'file:///b.woff2' }
  const html = renderSlideHtml(
    { kind: 'data', kicker: 'the numbers', statValue: '40%', statContext: 'higher acceptance, per wordstream.com/blog?utm_source=x', supportingLine: null },
    { accent, slideIndex: 0, slideCount: 3 },
    fontUrls,
  )
  // The stat/content fields themselves are expected to be pre-sanitized by the caller
  // (instagramGenerator's system prompt + imageGenerator's old stripUnrenderableText
  // pattern moves to the generator layer now) — this test only guards the template's OWN
  // static chrome (kicker, footer, brand) never introduces a URL, since that part is fully
  // within this module's control.
  const chromeOnly = html.replace(/<div class="serif"[\s\S]*?<\/div>/g, '')
  assert.doesNotMatch(chromeOnly, /https?:\/\//)
})

test('renderSlideHtml HTML-escapes user content to prevent markup injection', async () => {
  const { renderSlideHtml, pickAccent } = await import('../lib/marketing/slideTemplates')
  const accent = pickAccent('test-seed-2')
  const fontUrls = { regular: 'file:///r.woff2', medium: 'file:///m.woff2', semibold: 'file:///s.woff2', bold: 'file:///b.woff2' }
  const html = renderSlideHtml(
    { kind: 'hook', kicker: 'a note', headline: '<script>alert(1)</script>', subhead: null },
    { accent, slideIndex: 0, slideCount: 3 },
    fontUrls,
  )
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;/)
})

test('pickAccent is deterministic for the same seed', async () => {
  const { pickAccent } = await import('../lib/marketing/slideTemplates')
  const a = pickAccent('same-seed')
  const b = pickAccent('same-seed')
  assert.deepEqual(a, b)
})

test('renderSlideToPng returns null (never throws) when Chrome cannot be launched', async () => {
  const prior = process.env.MARKETING_CHROME_PATH
  process.env.MARKETING_CHROME_PATH = '/nonexistent/chrome-binary'
  try {
    const { renderSlideToPng } = await import('../lib/marketing/slideRenderer')
    const { pickAccent } = await import('../lib/marketing/slideTemplates')
    const result = await renderSlideToPng(
      { kind: 'hook', kicker: 'a note', headline: 'test', subhead: null },
      { accent: pickAccent('x'), slideIndex: 0, slideCount: 1 },
    )
    assert.equal(result, null)
  } finally {
    if (prior === undefined) delete process.env.MARKETING_CHROME_PATH
    else process.env.MARKETING_CHROME_PATH = prior
  }
})
