/** Grounded web research via the OpenAI Responses API's web_search_preview tool — the
 * only research backend the Instagram content queue uses (INSTAGRAM_QUEUE_BRIEF.md decision
 * #5: no new paid API/key, reuse OPENAI_API_KEY). Separate from lib/marketing/llm.ts's
 * chat-completions helpers (complete/completeJSON) because tool calls + structured JSON mode
 * aren't combined in one request here — this does the grounded research pass, then
 * lib/marketing/instagramGenerator.ts hands the resulting text + citations to completeJSON
 * for a second, structured synthesis pass. */
import { hasLLMProvider } from './llm'

export interface WebSearchCitation {
  url: string
  title: string
}

export interface WebSearchResult {
  text: string
  citations: WebSearchCitation[]
}

function baseUrl(): string {
  return process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'
}

function model(): string {
  return process.env.OPENAI_RESEARCH_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
}

interface ResponsesOutputTextAnnotation {
  type: string
  url?: string
  title?: string
}

interface ResponsesOutputContent {
  type: string
  text?: string
  annotations?: ResponsesOutputTextAnnotation[]
}

interface ResponsesOutputItem {
  type: string
  content?: ResponsesOutputContent[]
}

interface ResponsesApiBody {
  output?: ResponsesOutputItem[]
}

/** Runs one grounded web-search query and returns the model's summary plus every URL it
 * actually cited (via the API's own url_citation annotations — not the model's prose, so a
 * URL can only appear here if the tool call actually surfaced it). Returns null (never
 * throws) on any failure — callers must not fabricate a research result when this fails. */
export async function researchWithWebSearch(query: string): Promise<WebSearchResult | null> {
  if (!hasLLMProvider()) return null
  const apiKey = process.env.OPENAI_API_KEY
  try {
    const response = await fetch(`${baseUrl()}/responses`, {
      method: 'POST',
      signal: AbortSignal.timeout(90_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model(),
        tools: [{ type: 'web_search_preview' }],
        input: query,
      }),
    })
    if (!response.ok) {
      console.error('web search request failed:', response.status, await response.text())
      return null
    }
    const data = (await response.json()) as ResponsesApiBody
    const citations: WebSearchCitation[] = []
    let text = ''
    for (const item of data.output ?? []) {
      if (item.type !== 'message') continue
      for (const block of item.content ?? []) {
        if (block.type !== 'output_text') continue
        text += (block.text ?? '') + '\n'
        for (const annotation of block.annotations ?? []) {
          if (annotation.type === 'url_citation' && annotation.url) {
            citations.push({ url: annotation.url, title: annotation.title ?? annotation.url })
          }
        }
      }
    }
    text = text.trim()
    if (!text) return null
    // Dedupe citations by URL, preserving first-seen order.
    const seen = new Set<string>()
    const dedupedCitations = citations.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
    return { text, citations: dedupedCitations }
  } catch (err) {
    console.error('web search request threw:', err instanceof Error ? err.message : err)
    return null
  }
}
