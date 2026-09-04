/** Ported unchanged from marketing_content/lib/llm.ts. Single entry point for all LLM
 * calls — story-generator.ts and content-generator.ts check hasLLMProvider() first and
 * fall back to a deterministic local template when it's false. Not exercised with a
 * live key in this port (same as the standalone app). */

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
    super('LLM_API_KEY is not set — caller should use its local template fallback.')
    this.name = 'NoLLMProviderError'
  }
}

export function hasLLMProvider(): boolean {
  return Boolean(process.env.LLM_API_KEY)
}

export async function complete(req: LLMRequest): Promise<LLMResult> {
  const apiKey = process.env.LLM_API_KEY
  if (!apiKey) {
    throw new NoLLMProviderError()
  }
  const baseUrl = process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1'
  const model = process.env.LLM_MODEL ?? 'gpt-4o-mini'
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
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
