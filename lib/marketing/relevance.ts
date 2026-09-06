/** Dental/healthcare relevance scoring for real ingestion. Keyword scoring runs on every
 * item (same approach as adapters/manualUrl.ts, generalized); LLM classification refines
 * it when OPENAI_API_KEY is set, per MARKETING_V1_BRIEF.md section 1. Never blocks
 * ingestion — an LLM classification failure just falls back to the keyword score. */
import { complete, hasLLMProvider } from './llm'

const DENTAL_KEYWORDS = [
  'dental', 'dentist', 'dentistry', 'orthodont', 'hygienist', 'endodont', 'periodont',
  'oral health', 'oral surgery', 'tooth', 'teeth', 'cavity', 'invisalign', 'dso',
]
const HEALTHCARE_KEYWORDS = [
  'healthcare', 'health care', 'clinic', 'patient', 'medical', 'provider', 'hospital',
  'physician', 'practice management', 'telehealth', 'reimbursement',
]

export function keywordRelevance(text: string, keywords: string[]): number {
  const lower = text.toLowerCase()
  const hits = keywords.filter((k) => lower.includes(k)).length
  return Math.min(100, hits * 30)
}

export interface RelevanceScore {
  dentalRelevance: number
  healthcareRelevance: number
}

/** Blends the item's own keyword score with the feed-level prior hint (60/40) so a
 * single article on a dental trade publication isn't zeroed out just because it
 * doesn't happen to repeat "dental" — the feed itself is strong evidence. */
export function scoreRelevanceByKeyword(title: string, content: string, hint: RelevanceScore): RelevanceScore {
  const text = `${title} ${content}`
  const dentalKeywordScore = keywordRelevance(text, DENTAL_KEYWORDS)
  const healthcareKeywordScore = keywordRelevance(text, HEALTHCARE_KEYWORDS)
  return {
    dentalRelevance: Math.round(dentalKeywordScore * 0.6 + hint.dentalRelevance * 0.4),
    healthcareRelevance: Math.round(healthcareKeywordScore * 0.6 + hint.healthcareRelevance * 0.4),
  }
}

const LLM_SYSTEM_PROMPT =
  'You classify news/article items for a dental-practice marketing intelligence tool. ' +
  'Respond with ONLY a JSON object: {"dentalRelevance": <0-100>, "healthcareRelevance": <0-100>}. ' +
  'dentalRelevance: how relevant this is to dental practices/dentists/DSOs specifically. ' +
  'healthcareRelevance: how relevant to healthcare practice operations/marketing more broadly ' +
  '(dental items should also score reasonably high here). No prose, no markdown fences.'

function parseLLMRelevance(text: string): RelevanceScore | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0])
    const dental = Number(parsed.dentalRelevance)
    const healthcare = Number(parsed.healthcareRelevance)
    if (!Number.isFinite(dental) || !Number.isFinite(healthcare)) return null
    return {
      dentalRelevance: Math.max(0, Math.min(100, Math.round(dental))),
      healthcareRelevance: Math.max(0, Math.min(100, Math.round(healthcare))),
    }
  } catch {
    return null
  }
}

/** Returns null (never throws) when no key is configured or the call/parse fails —
 * callers fall back to scoreRelevanceByKeyword. */
export async function classifyRelevanceWithLLM(title: string, excerpt: string): Promise<RelevanceScore | null> {
  if (!hasLLMProvider()) return null
  try {
    const result = await complete({
      system: LLM_SYSTEM_PROMPT,
      prompt: `Title: ${title}\n\nExcerpt: ${excerpt.slice(0, 1000)}`,
    })
    return parseLLMRelevance(result.text)
  } catch {
    return null
  }
}

export async function scoreRelevance(title: string, content: string, hint: RelevanceScore): Promise<RelevanceScore> {
  const llmScore = await classifyRelevanceWithLLM(title, content)
  return llmScore ?? scoreRelevanceByKeyword(title, content, hint)
}
