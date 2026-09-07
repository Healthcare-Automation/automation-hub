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
  /** The single shareable stat/quote to render large — the draft's hookLine, which is
   * already synthesized as the sharpest one-line takeaway of its cited research. Reusing
   * it means no second extraction pass over the caption is needed. */
  statOrQuote: string
  /** First cited source URL, if any, so the model can render a real small attribution
   * line instead of inventing one. */
  citationSource: string | null
}

export interface GeneratedImage {
  bytes: Buffer
}

function buildImagePrompt(input: StatCardImageInput): string {
  const lines = [
    input.stylePrompt,
    '',
    `Render ONE punchy stat/quote card as large, bold typography — the hero content is this ` +
      `exact line: "${input.statOrQuote}"`,
    'A single stat/quote card only — NOT a dense multi-section infographic.',
    'Leave a small, subtle empty area in the bottom-right corner reserved for a future logo — ' +
      'do not draw any logo, wordmark, or brand name there.',
  ]
  if (input.citationSource) {
    lines.push(`If you add an attribution line, keep it small and reference only: ${input.citationSource}`)
  }
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
