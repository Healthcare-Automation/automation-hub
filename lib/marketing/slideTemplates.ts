/** HTML templates for Instagram carousel slides, rendered to PNG via Playwright
 * (see lib/marketing/slideRenderer.ts). Replaces gpt-image-1 prompting entirely —
 * see docs/INSTAGRAM_IMAGE_REDESIGN.md for the rationale (pixel-perfect layout control,
 * reliable long/precise text, a real reusable design system, no per-image model variance).
 *
 * Design system v2 (Andy, 2026-09-08): the first pass (dark navy, cold "MARKETING DATA"
 * kicker, giant hero-numeral stat) read as a corporate sales deck, not something that
 * resonates emotionally. Revised toward a warm editorial feel — a paper-like cream
 * background, ink-brown text, a warm terracotta accent, and a serif headline (evokes a
 * printed page / handwritten note, not a SaaS dashboard). The stat is now folded into a
 * sentence rather than flexed as giant standalone typography — the human context around
 * the number matters more than the number's visual size.
 *
 *   - 1080x1350 (4:5 portrait — Instagram's recommended feed/carousel ratio).
 *   - Warm paper (#F3ECE1) base, ink-brown (#2B241C) text, one warm accent per post
 *     (terracotta/clay/sage/ochre/dusty-rose — never the old cold blues), Liberation Serif
 *     for headlines (warmth/editorial), Geist for body/labels (still legible at small size).
 *   - Softer kicker: lowercase, small quote-mark glyph instead of a cold all-caps label.
 *   - A visible grid: generous outer margin, a thin top-left rule + label, a bottom-right
 *     slide index ("01 / 04"), a reserved bottom-right logo corner (per the existing brief).
 *
 * All text arrives pre-sanitized by the caller (slideRenderer / instagramCarouselGenerator)
 * — this module does no additional stripping. Every field is HTML-escaped here regardless,
 * since research/LLM text can contain characters that would break the markup otherwise.
 */

export type SlideKind = 'hook' | 'data' | 'cta'

export interface SlideAccent {
  /** Hex accent color for this post's whole carousel (consistent across all slides in one post). */
  color: string
  /** Readable name, used only for logging/debugging — never rendered. */
  name: string
}

// A small curated warm palette — editorial/human, never the old cold SaaS blues. Picked
// deterministically per-post (see pickAccent) so a single carousel stays consistent while
// different posts vary week to week.
export const ACCENT_PALETTE: SlideAccent[] = [
  { name: 'terracotta', color: '#C1633D' },
  { name: 'clay', color: '#B5533A' },
  { name: 'sage', color: '#6E7F5C' },
  { name: 'ochre', color: '#C08A2E' },
  { name: 'dusty-rose', color: '#B06A6A' },
]

export function pickAccent(seed: string): SlideAccent {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return ACCENT_PALETTE[hash % ACCENT_PALETTE.length]
}

export interface HookSlideInput {
  kind: 'hook'
  kicker: string // short label, e.g. "MARKETING DATA"
  headline: string // the hook line, large
  subhead: string | null // optional supporting line, smaller
}

export interface DataSlideInput {
  kind: 'data'
  kicker: string
  /** The hero stat — a short number/percentage/dollar figure, e.g. "40%" or "$1,200". */
  statValue: string
  /** Context sentence explaining the stat, sits under the hero number. */
  statContext: string
  /** Optional single supporting line (a second, smaller point) — omit if not needed. */
  supportingLine: string | null
}

export interface CtaSlideInput {
  kind: 'cta'
  kicker: string
  headline: string
  body: string
}

export type SlideInput = HookSlideInput | DataSlideInput | CtaSlideInput

export interface SlideRenderOptions {
  accent: SlideAccent
  slideIndex: number // 0-based
  slideCount: number
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const WIDTH = 1080
const HEIGHT = 1350

function baseStyles(accent: string): string {
  return `
    @font-face {
      font-family: 'Geist';
      src: url('FONT_REGULAR') format('woff2');
      font-weight: 400;
    }
    @font-face {
      font-family: 'Geist';
      src: url('FONT_MEDIUM') format('woff2');
      font-weight: 500;
    }
    @font-face {
      font-family: 'Geist';
      src: url('FONT_SEMIBOLD') format('woff2');
      font-weight: 600;
    }
    @font-face {
      font-family: 'Geist';
      src: url('FONT_BOLD') format('woff2');
      font-weight: 700;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${WIDTH}px;
      height: ${HEIGHT}px;
      background: #F3ECE1;
      font-family: 'Geist', sans-serif;
      overflow: hidden;
    }
    .serif {
      font-family: 'Liberation Serif', Georgia, serif;
    }
    .canvas {
      position: relative;
      width: ${WIDTH}px;
      height: ${HEIGHT}px;
      padding: 96px 96px 96px 96px;
      display: flex;
      flex-direction: column;
    }
    .kicker-row {
      display: flex;
      align-items: baseline;
      gap: 14px;
    }
    .kicker-mark {
      font-family: 'Liberation Serif', Georgia, serif;
      font-size: 40px;
      font-style: italic;
      color: ${accent};
      line-height: 1;
    }
    .kicker {
      font-size: 24px;
      font-weight: 500;
      letter-spacing: 0.01em;
      color: #6B6155;
      font-style: italic;
    }
    .corner-tick {
      position: absolute;
      top: 96px;
      right: 96px;
      width: 26px;
      height: 26px;
      border-top: 2px solid rgba(43,36,28,0.16);
      border-right: 2px solid rgba(43,36,28,0.16);
    }
    .footer-row {
      position: absolute;
      left: 96px;
      right: 96px;
      bottom: 68px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .footer-brand {
      font-size: 19px;
      font-weight: 500;
      letter-spacing: 0.06em;
      color: rgba(43,36,28,0.4);
      text-transform: uppercase;
    }
    .slide-index {
      font-size: 19px;
      font-weight: 400;
      color: rgba(43,36,28,0.4);
      font-variant-numeric: tabular-nums;
    }
    .rule {
      width: 100%;
      height: 1px;
      background: rgba(43,36,28,0.14);
      margin: 36px 0;
    }
  `
}

function withFontUrls(css: string, fontUrls: { regular: string; medium: string; semibold: string; bold: string }): string {
  return css
    .replace('FONT_REGULAR', fontUrls.regular)
    .replace('FONT_MEDIUM', fontUrls.medium)
    .replace('FONT_SEMIBOLD', fontUrls.semibold)
    .replace('FONT_BOLD', fontUrls.bold)
}

function footer(accent: string, opts: SlideRenderOptions): string {
  return `
    <div class="corner-tick"></div>
    <div class="footer-row">
      <div class="footer-brand">UZU Studio</div>
      <div class="slide-index">${String(opts.slideIndex + 1).padStart(2, '0')} / ${String(opts.slideCount).padStart(2, '0')}</div>
    </div>
  `
}

function kickerHtml(kicker: string): string {
  return `
    <div class="kicker-row">
      <div class="kicker-mark">&ldquo;</div>
      <div class="kicker">${esc(kicker)}</div>
    </div>
  `
}

function hookBody(input: HookSlideInput, accent: string): string {
  return `
    ${kickerHtml(input.kicker)}
    <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
      <div class="serif" style="font-size: 76px; line-height: 1.18; font-weight: 700; color: #2B241C; letter-spacing: -0.01em;">
        ${esc(input.headline)}
      </div>
      ${
        input.subhead
          ? `<div style="margin-top: 40px; font-size: 32px; line-height: 1.5; font-weight: 400; color: #6B6155; max-width: 800px;">${esc(input.subhead)}</div>`
          : ''
      }
    </div>
  `
}

function dataBody(input: DataSlideInput, accent: string): string {
  // The stat is folded into a plain sentence rather than blown up as giant standalone
  // typography — v2 direction (Andy, 2026-09-08): the human context around a number
  // matters more than flexing the number's visual size. Only the stat token itself gets
  // the accent color + serif emphasis, inline within the sentence.
  return `
    ${kickerHtml(input.kicker)}
    <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
      <div class="serif" style="font-size: 58px; line-height: 1.32; font-weight: 700; color: #2B241C; letter-spacing: -0.01em; max-width: 880px;">
        <span style="color: ${accent};">${esc(input.statValue)}</span> ${esc(input.statContext)}
      </div>
      ${
        input.supportingLine
          ? `<div class="rule" style="max-width: 780px;"></div><div style="font-size: 28px; line-height: 1.6; font-weight: 400; color: #6B6155; max-width: 760px;">${esc(input.supportingLine)}</div>`
          : ''
      }
    </div>
  `
}

function ctaBody(input: CtaSlideInput, accent: string): string {
  return `
    ${kickerHtml(input.kicker)}
    <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
      <div class="serif" style="font-size: 60px; line-height: 1.22; font-weight: 700; color: #2B241C; letter-spacing: -0.01em;">
        ${esc(input.headline)}
      </div>
      <div style="margin-top: 32px; font-size: 30px; line-height: 1.55; font-weight: 400; color: #6B6155; max-width: 800px;">
        ${esc(input.body)}
      </div>
    </div>
  `
}

/** Builds the full standalone HTML document for one slide. `fontUrls` are file:// URLs
 * to the bundled Geist woff2 assets (see slideRenderer.ts) — resolved by the caller rather
 * than hardcoded here so the renderer controls asset paths. */
export function renderSlideHtml(
  input: SlideInput,
  opts: SlideRenderOptions,
  fontUrls: { regular: string; medium: string; semibold: string; bold: string },
): string {
  const accent = opts.accent.color
  const body = input.kind === 'hook' ? hookBody(input, accent) : input.kind === 'data' ? dataBody(input, accent) : ctaBody(input, accent)
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${withFontUrls(baseStyles(accent), fontUrls)}</style>
</head>
<body>
  <div class="canvas">
    ${body}
    ${footer(accent, opts)}
  </div>
</body>
</html>`
}

export const SLIDE_WIDTH = WIDTH
export const SLIDE_HEIGHT = HEIGHT
