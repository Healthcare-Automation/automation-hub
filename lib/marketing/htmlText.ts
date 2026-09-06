/** Shared plain-text extraction from a fetched HTML page. Used by adapters/manualUrl.ts
 * (title + short excerpt) and lib/marketingResearch.ts's enrichment step (longer excerpt
 * for clustering/story material) so the two don't drift. */

export function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return match ? match[1].trim() : 'Untitled'
}

export function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
