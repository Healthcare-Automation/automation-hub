/** Ported unchanged from marketing_content/lib/adapters/stubs.ts — documented future
 * adapters, intentionally unimplemented for this MVP pass. Never return fabricated data. */
import type { SourceAdapter } from '../types'
import { NotImplementedAdapterError } from '../types'

function stub(id: string): SourceAdapter {
  return {
    id,
    async fetch() {
      throw new NotImplementedAdapterError(id)
    },
  }
}

export const redditAdapter = stub('reddit')
export const youtubeAdapter = stub('youtube')
export const regulatoryRssAdapter = stub('ada-cdc-cms-ftc-rss')
export const newsletterPodcastRssAdapter = stub('newsletter-podcast-rss')
export const googleReviewsAdapter = stub('google-reviews')

export const stubAdapters = [
  redditAdapter,
  youtubeAdapter,
  regulatoryRssAdapter,
  newsletterPodcastRssAdapter,
  googleReviewsAdapter,
]

export const STUB_ADAPTER_DESCRIPTIONS: Record<string, string> = {
  reddit: 'Pull discussion threads from dental/healthcare-adjacent subreddits.',
  youtube: 'Pull transcripts and metadata from relevant YouTube channels.',
  'ada-cdc-cms-ftc-rss': 'Pull regulatory updates from ADA, CDC, CMS, and FTC RSS feeds.',
  'newsletter-podcast-rss': 'Pull episode summaries from industry newsletters and podcasts.',
  'google-reviews': 'Pull aggregate patterns from Google review text (never individual PHI).',
}
