/** Ported from marketing_content/lib/adapters/manual-url.ts — real fetch() against the
 * pasted URL, HTML title/text extraction, keyword-based relevance scoring. HTML extraction
 * and keyword scoring were factored out to htmlText.ts/relevance.ts so the RSS ingestion
 * pipeline (lib/marketingResearch.ts) shares the same logic instead of duplicating it. */
import type { RawItem, SourceAdapter } from '../types'
import { extractText, extractTitle } from '../htmlText'
import { keywordRelevance } from '../relevance'

const DENTAL_KEYWORDS = ['dental', 'dentist', 'dentistry', 'orthodont', 'hygienist']
const HEALTHCARE_KEYWORDS = ['healthcare', 'health care', 'clinic', 'patient', 'medical', 'provider']

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
