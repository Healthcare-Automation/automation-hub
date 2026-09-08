/** Renders slideTemplates.ts HTML to PNG bytes via Playwright + system Chrome — replaces
 * gpt-image-1 prompting (imageGenerator.ts, retired) for Instagram graphics. See
 * docs/INSTAGRAM_IMAGE_REDESIGN.md for the rationale.
 *
 * Uses `playwright-core` (no bundled browser download) pointed at whatever Chrome/Chromium
 * is already on the host — the VPS already has google-chrome installed for the Mohamed
 * browser automation; Modal's image installs its own via CHROME_EXECUTABLE_PATH (see
 * modal/marketing_research.py). Never throws: callers must be able to save a draft with
 * no image rather than losing it, matching the old imageGenerator.ts contract.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { SlideInput, SlideRenderOptions } from './slideTemplates'
import { renderSlideHtml, SLIDE_WIDTH, SLIDE_HEIGHT } from './slideTemplates'

const FONTS_DIR = path.join(process.cwd(), 'assets', 'fonts')

function fontUrls() {
  const f = (name: string) => pathToFileURL(path.join(FONTS_DIR, name)).href
  return {
    regular: f('Geist-Regular.woff2'),
    medium: f('Geist-Medium.woff2'),
    semibold: f('Geist-SemiBold.woff2'),
    bold: f('Geist-Bold.woff2'),
  }
}

/** Explicit executable path resolution so this works the same on the VPS (system Chrome)
 * and on Modal (its own installed Chrome, path passed via env — see modal/marketing_research.py).
 * playwright-core has no bundled browser, so this MUST resolve to something real or every
 * render fails closed (caught by the caller, draft saved without an image). */
function chromeExecutablePath(): string | undefined {
  return (
    process.env.MARKETING_CHROME_PATH ||
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    '/usr/bin/google-chrome'
  )
}

/** Renders one slide to PNG bytes. Never throws — returns null on any failure (missing
 * Chrome binary, launch failure, render timeout) so the caller can proceed without this
 * slide rather than losing the whole draft. */
export async function renderSlideToPng(input: SlideInput, opts: SlideRenderOptions): Promise<Buffer | null> {
  let browser: import('playwright-core').Browser | null = null
  try {
    const { chromium } = await import('playwright-core')
    browser = await chromium.launch({
      executablePath: chromeExecutablePath(),
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    })
    const page = await browser.newPage({ viewport: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT }, deviceScaleFactor: 2 })
    const html = renderSlideHtml(input, opts, fontUrls())
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 15_000 })
    // Fonts are file:// @font-face — wait for them to actually be ready before the screenshot,
    // otherwise the first render can fall back to a system serif for a frame that gets captured.
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready)
    const screenshot = await page.screenshot({ type: 'png' })
    return Buffer.from(screenshot)
  } catch (err) {
    console.error('Slide render failed:', err instanceof Error ? err.message : err)
    return null
  } finally {
    if (browser) {
      try {
        await browser.close()
      } catch {
        // best-effort cleanup only
      }
    }
  }
}
