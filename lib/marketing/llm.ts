/** Single entry point for all LLM calls. Reads OPENAI_API_KEY — NOT OPENAI_ADMIN_KEY,
 * which is a billing-read key scoped for cost reporting (see lib/costs.ts /
 * app/api/cron/sync-notion-costs) and must never be used to call the completions API.
 * story-generator.ts and content-generator.ts check hasLLMProvider() first and fall back
 * to a deterministic local template when it's false — see app/marketing/settings for
 * which mode is live. Model defaults to gpt-4o-mini, overridable via OPENAI_MODEL. */
import type { ZodType } from 'zod'

export interface LLMRequest {
  system: string
  prompt: string
}

export interface LLMResult {
  text: string
  provider: 'template' | 'external'
  isDemo: boolean
}

export class NoLLMProviderError extends Error {
  constructor() {
    super('OPENAI_API_KEY is not set — caller should use its local template fallback.')
    this.name = 'NoLLMProviderError'
  }
}

export function hasLLMProvider(): boolean {
  return Boolean(process.env.OPENAI_API_KEY)
}

function requireApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new NoLLMProviderError()
  return apiKey
}

function baseUrl(): string {
  return process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'
}

function model(): string {
  return process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
}

export async function complete(req: LLMRequest): Promise<LLMResult> {
  const apiKey = requireApiKey()
  const response = await fetch(`${baseUrl()}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model(),
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.prompt },
      ],
    }),
  })
  if (!response.ok) {
    throw new Error(`LLM provider request failed: ${response.status} ${await response.text()}`)
  }
  const data = await response.json()
  const text = data.choices?.[0]?.message?.content ?? ''
  return { text, provider: 'external', isDemo: false }
}

/** Structured-output variant: forces JSON mode and validates the parsed response against
 * a zod schema before returning it. Throws (never returns fabricated/unvalidated shapes)
 * if the model's JSON doesn't match — callers should catch and fall back to template
 * generation, same as a NoLLMProviderError. */
export async function completeJSON<T>(req: LLMRequest, schema: ZodType<T>): Promise<T> {
  const apiKey = requireApiKey()
  const response = await fetch(`${baseUrl()}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model(),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.prompt },
      ],
    }),
  })
  if (!response.ok) {
    throw new Error(`LLM provider request failed: ${response.status} ${await response.text()}`)
  }
  const data = await response.json()
  const text = data.choices?.[0]?.message?.content ?? ''
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`LLM did not return valid JSON: ${text.slice(0, 200)}`)
  }
  return schema.parse(parsed)
}
