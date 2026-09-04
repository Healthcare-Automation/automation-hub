/** Ported unchanged from marketing_content/lib/adapters/manual-url.ts — real fetch()
 * against the pasted URL, HTML title/text extraction, keyword-based relevance scoring. */
import type { RawItem, SourceAdapter } from '../types'

const DENTAL_KEYWORDS = ['dental', 'dentist', 'dentistry', 'orthodont', 'hygienist']
const HEALTHCARE_KEYWORDS = ['healthcare', 'health care', 'clinic', 'patient', 'medical', 'provider']

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return match ? match[1].trim() : 'Untitled'
}

function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function keywordRelevance(text: string, keywords: string[]): number {
  const lower = text.toLowerCase()
  const hits = keywords.filter((k) => lower.includes(k)).length
  return Math.min(100, hits * 40)
}

async function fetchOne(url: string): Promise<RawItem> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`)
  }
  const html = await response.text()
  const title = extractTitle(html)
  const text = extractText(html)

  return {
    sourceUrl: url,
    title,
    rawContent: text,
    publishedAt: null,
    authorOrOrg: null,
    sourceType: 'manual',
    supportingExcerpt: text.slice(0, 280),
    reliabilityClassification: 'reported_opinion',
    dentalRelevance: keywordRelevance(text + ' ' + title, DENTAL_KEYWORDS),
    healthcareRelevance: keywordRelevance(text + ' ' + title, HEALTHCARE_KEYWORDS),
    geographicRelevance: 'national',
    topicClassification: [],
    isDemoData: false,
  }
}

export const manualUrlAdapter: SourceAdapter = {
  id: 'manual-url',
  async fetch(url?: string) {
    if (!url) throw new Error('manual-url adapter requires a URL argument.')
    return [await fetchOne(url)]
  },
}
