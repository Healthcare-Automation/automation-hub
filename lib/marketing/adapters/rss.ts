/** Generic RSS 2.0 / Atom adapter. Hand-rolled XML extraction instead of adding a
 * dependency (`rss-parser` pulls in a sax parser + its own type surface for something
 * this small) — every registry feed in feedRegistry.ts is well-formed RSS 2.0 or Atom,
 * verified with curl before being added. See tests/marketingRss.test.ts for fixtures
 * covering both formats plus CDATA/entity-encoded titles.
 *
 * One adapter instance per registry entry (createRssAdapter) rather than a single
 * adapter taking a URL argument, so each carries its own sourceType/reliability/
 * dentalRelevance hint from the registry — lib/marketing/ingest.ts overwrites the
 * relevance hint with a real per-item score before insert (see lib/marketing/relevance.ts). */
import type { RawItem, SourceAdapter } from '../types'
import type { FeedRegistryEntry } from './feedRegistry'

export const FEED_USER_AGENT =
  'Mozilla/5.0 (compatible; ProxiMarketingResearch/1.0; +https://automation-hub-rosy.vercel.app)'
const FETCH_TIMEOUT_MS = 15_000
const MAX_EXCERPT_LENGTH = 280

export interface ParsedFeedEntry {
  title: string
  link: string
  publishedAt: Date | null
  author: string | null
  /** Plain-text summary/description, HTML stripped. */
  summary: string
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
}

function stripHtml(text: string): string {
  return decodeEntities(text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Unwraps `<![CDATA[...]]>` and decodes entities, but does not strip markup — used for
 * fields we know are plain text (titles, dates, links) so we don't accidentally eat a
 * literal "<" in a title. */
function cleanText(text: string): string {
  const cdataMatch = text.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  return decodeEntities(cdataMatch ? cdataMatch[1] : text).trim()
}

function extractBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi')
  const blocks: string[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(xml))) blocks.push(match[1])
  return blocks
}

function extractTagText(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i')
  const match = block.match(re)
  return match ? cleanText(match[1]) : null
}

/** Atom links are self-closing with attributes (`<link rel="alternate" href=".."/>`),
 * RSS links are plain text elements (`<link>https://...</link>`). Prefer an Atom
 * rel="alternate" (or unmarked) href; fall back to the RSS text form. */
function extractLink(block: string): string | null {
  const linkTags = block.match(/<link\b[^>]*\/?>/gi) ?? []
  for (const tag of linkTags) {
    if (/rel=["']alternate["']/i.test(tag) || !/rel=/i.test(tag)) {
      const href = tag.match(/href=["']([^"']+)["']/i)
      if (href) return decodeEntities(href[1])
    }
  }
  const text = extractTagText(block, 'link')
  return text || null
}

function extractAuthor(block: string): string | null {
  const authorBlock = extractBlocks(block, 'author')[0]
  if (authorBlock) {
    const name = extractTagText(authorBlock, 'name')
    if (name) return name
  }
  return extractTagText(block, 'dc:creator')
}

function parseDate(raw: string | null): Date | null {
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function parseFeedXml(xml: string): ParsedFeedEntry[] {
  const blocks = [...extractBlocks(xml, 'item'), ...extractBlocks(xml, 'entry')]
  return blocks
    .map((block): ParsedFeedEntry => {
      const title = extractTagText(block, 'title') ?? 'Untitled'
      const link = extractLink(block) ?? ''
      const rawDate =
        extractTagText(block, 'pubDate') ?? extractTagText(block, 'published') ?? extractTagText(block, 'updated')
      const summaryRaw =
        extractTagText(block, 'description') ?? extractTagText(block, 'summary') ?? extractTagText(block, 'content') ?? ''
      return {
        title,
        link,
        publishedAt: parseDate(rawDate),
        author: extractAuthor(block),
        summary: stripHtml(summaryRaw),
      }
    })
    .filter((entry) => entry.link.length > 0)
}

export async function fetchFeed(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<ParsedFeedEntry[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': FEED_USER_AGENT,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Feed fetch failed: HTTP ${response.status}`)
    }
    const xml = await response.text()
    return parseFeedXml(xml)
  } finally {
    clearTimeout(timer)
  }
}

/** One SourceAdapter per registry entry — fetch() ignores its `input` argument since the
 * feed URL is fixed by the registry entry, matching demoGoogleTrendsAdapter's pattern. */
export function createRssAdapter(entry: FeedRegistryEntry): SourceAdapter {
  return {
    id: entry.id,
    async fetch(): Promise<RawItem[]> {
      const entries = await fetchFeed(entry.url)
      return entries.map((parsed) => ({
        sourceUrl: parsed.link,
        title: parsed.title,
        rawContent: parsed.summary,
        publishedAt: parsed.publishedAt,
        authorOrOrg: parsed.author ?? entry.name,
        sourceType: entry.sourceType,
        supportingExcerpt: parsed.summary.slice(0, MAX_EXCERPT_LENGTH),
        reliabilityClassification: entry.reliabilityClassification,
        // Placeholder — lib/marketing/relevance.ts recomputes both scores per-item
        // during ingestion (keyword scoring, blended with this feed-level prior).
        dentalRelevance: entry.defaultDentalRelevance,
        healthcareRelevance: Math.max(entry.defaultDentalRelevance, 20),
        geographicRelevance: 'national',
        topicClassification: [],
        isDemoData: false,
      }))
    },
  }
}
