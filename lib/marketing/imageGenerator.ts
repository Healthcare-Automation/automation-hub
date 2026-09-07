/** Generates the single stat/quote-card image for an Instagram draft via OpenAI's Images
 * API (`gpt-image-1`) — INSTAGRAM_IMAGE_BRIEF.md decision #1: reuse the existing
 * OPENAI_API_KEY, no new provider/key. Never throws: lib/marketingInstagramPipeline.ts
 * must save the draft even when image generation fails (billing/quota/model-not-available),
 * so every failure path here is caught, logged, and returns null rather than propagating. */
import { hasLLMProvider } from './llm'

function baseUrl(): string {
  return process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'
}

export interface StatCardImageInput {
  /** Base visual style, taken verbatim from the draft's own `image_prompt` (already
   * synthesized by instagramGenerator.ts to match the dark-navy/single-accent aesthetic). */
  stylePrompt: string
  /** The single concrete, resonant stat/quote to render large — must contain a real number,
   * percentage, dollar figure, or a punchy verbatim quote (instagramGenerator.ts's coreStat
   * field), never a generic rephrased question. Stripped of any URL/year before rendering
   * (see stripUnrenderableText) as a defensive second layer beyond the system prompt. */
  statOrQuote: string
  /** Citation is tracked for provenance but is intentionally NOT passed into the image
   * prompt — INSTAGRAM_IMAGE_BRIEF follow-up: rendering literal source URLs as visible text
   * in the graphic (including query strings like ?utm_source=) looked unprofessional and
   * broke the "elite" bar. The citation still lives on the draft row itself; this card is a
   * pure content visual, not a screenshot of a footnote. */
  citationSource: string | null
}

export interface GeneratedImage {
  bytes: Buffer
}

const URL_PATTERN = /\bhttps?:\/\/\S+/gi
const BARE_DOMAIN_PATTERN = /\b[a-z0-9-]+\.(com|org|net|io|co|gov|edu)\b\S*/gi
const CALENDAR_YEAR_PATTERN = /\b(19|20)\d{2}\b/g

/** Defensive cleanup applied to any text handed to the image model, independent of the
 * synthesis system prompt's own instructions — a second layer so a prompt-following slip
 * upstream can't put a raw URL or a stale year into the rendered graphic. */
function stripUnrenderableText(text: string): string {
  return text
    .replace(URL_PATTERN, '')
    .replace(BARE_DOMAIN_PATTERN, '')
    .replace(CALENDAR_YEAR_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function buildImagePrompt(input: StatCardImageInput): string {
  const cleanStat = stripUnrenderableText(input.statOrQuote)
  const lines = [
    input.stylePrompt,
    '',
    `Render ONE punchy, concrete stat/quote card as large, bold typography — the hero content is this ` +
      `exact line: "${cleanStat}"`,
    'A single stat/quote card only — NOT a dense multi-section infographic.',
    'Do NOT render any URL, website domain, tracking-parameter text, citation text, or calendar year ' +
      'anywhere in the image — no attribution line, no footer link, no date. The card is pure content: ' +
      'the stat/quote and nothing else identifying its source.',
    'Leave a small, subtle empty area in the bottom-right corner reserved for a future logo — ' +
      'do not draw any logo, wordmark, or brand name there.',
  ]
  return lines.join('\n')
}

/** Never throws — returns null on any failure (no key, request failure, empty response) so
 * the caller can save the draft with `image_url` null rather than losing it. */
export async function generateStatCardImage(input: StatCardImageInput): Promise<GeneratedImage | null> {
  if (!hasLLMProvider()) return null
  try {
    const response = await fetch(`${baseUrl()}/images/generations`, {
      method: 'POST',
      signal: AbortSignal.timeout(120_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: buildImagePrompt(input),
        size: '1024x1024',
        n: 1,
      }),
    })
    if (!response.ok) {
      console.error(`Instagram image generation failed: ${response.status} ${await response.text()}`)
      return null
    }
    const json = (await response.json()) as { data?: { b64_json?: string }[] }
    const b64 = json.data?.[0]?.b64_json
    if (!b64) {
      console.error('Instagram image generation returned no image data.')
      return null
    }
    return { bytes: Buffer.from(b64, 'base64') }
  } catch (err) {
    console.error('Instagram image generation failed:', err instanceof Error ? err.message : err)
    return null
  }
}
