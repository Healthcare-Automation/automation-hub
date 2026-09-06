/** Real RSS/Atom feed registry for lib/marketing/adapters/rss.ts. Every URL below was
 * verified with `curl` before being committed (see MARKETING_V1_BRIEF.md section 1) —
 * candidates that 404'd, blocked with 403, or pointed at a banned subreddit were dropped.
 * The final ingestion-run verification results live in the project's summary; three
 * Reddit entries were rate-limited (HTTP 429, not a block) mid-verification and are kept
 * because the identical URL scheme was already confirmed live on two other subreddits —
 * see notes below and the "could not verify" list in the final summary.
 *
 * reliabilityClassification is a per-feed prior (BUILD_BRIEF source hierarchy): primary/
 * regulatory sources are verified_fact, trade press is reported_opinion, forums/socials
 * are anecdote. defaultDentalRelevance is a starting hint for keyword scoring — it is
 * never the final dental_relevance stored on an item (see lib/marketing/relevance.ts). */
import type { ReliabilityClassification, SourceType } from '../types'

export interface FeedRegistryEntry {
  id: string
  name: string
  url: string
  sourceType: SourceType
  reliabilityClassification: ReliabilityClassification
  defaultDentalRelevance: number
  enabled: boolean
  /** Free-text note on verification status — surfaced on the Sources page. */
  verification: string
}

export const FEED_REGISTRY: FeedRegistryEntry[] = [
  // ── Dental trade publications ──────────────────────────────────────────
  {
    id: 'dental-tribune',
    name: 'Dental Tribune',
    url: 'https://www.dental-tribune.com/feed/',
    sourceType: 'publication',
    reliabilityClassification: 'reported_opinion',
    defaultDentalRelevance: 90,
    enabled: true,
    verification: 'curl 200, valid RSS, 2026-09-06',
  },
  {
    id: 'dental-products-report',
    name: 'Dental Products Report',
    url: 'https://www.dentalproductsreport.com/rss',
    sourceType: 'publication',
    reliabilityClassification: 'reported_opinion',
    defaultDentalRelevance: 90,
    enabled: true,
    verification: 'curl 200, valid RSS, 2026-09-06',
  },
  {
    id: 'group-dentistry-now',
    name: 'Group Dentistry Now',
    url: 'https://groupdentistrynow.com/feed/',
    sourceType: 'publication',
    reliabilityClassification: 'reported_opinion',
    defaultDentalRelevance: 90,
    enabled: true,
    verification: 'curl 200 (after redirect), valid RSS, 2026-09-06',
  },

  // ── Government / regulatory (primary sources) ──────────────────────────
  {
    id: 'cdc-newsroom',
    name: 'CDC Newsroom',
    url: 'https://tools.cdc.gov/api/v2/resources/media/132608.rss',
    sourceType: 'government',
    reliabilityClassification: 'verified_fact',
    defaultDentalRelevance: 15,
    enabled: true,
    verification: 'curl 200, valid RSS, 2026-09-06',
  },
  {
    id: 'ftc-press-releases',
    name: 'FTC Press Releases',
    url: 'https://www.ftc.gov/feeds/press-release.xml',
    sourceType: 'government',
    reliabilityClassification: 'verified_fact',
    defaultDentalRelevance: 10,
    enabled: true,
    verification: 'curl 200, valid RSS, 2026-09-06',
  },

  // ── Broader healthcare marketing / operations publications ─────────────
  {
    id: 'fierce-healthcare',
    name: 'Fierce Healthcare',
    url: 'https://www.fiercehealthcare.com/rss/xml',
    sourceType: 'publication',
    reliabilityClassification: 'reported_opinion',
    defaultDentalRelevance: 15,
    enabled: true,
    verification: 'curl 200, valid RSS, 2026-09-06',
  },
  {
    id: 'medcity-news',
    name: 'MedCity News',
    url: 'https://medcitynews.com/feed/',
    sourceType: 'publication',
    reliabilityClassification: 'reported_opinion',
    defaultDentalRelevance: 15,
    enabled: true,
    verification: 'curl 200, valid RSS, 2026-09-06',
  },

  // ── Reddit (public .rss, no API key) ───────────────────────────────────
  {
    id: 'reddit-dentistry',
    name: 'r/Dentistry',
    url: 'https://www.reddit.com/r/Dentistry/.rss',
    sourceType: 'social',
    reliabilityClassification: 'anecdote',
    defaultDentalRelevance: 85,
    enabled: true,
    verification: 'curl 200, valid Atom feed, 2026-09-06',
  },
  {
    id: 'reddit-askdentists',
    name: 'r/askdentists',
    url: 'https://www.reddit.com/r/askdentists/.rss',
    sourceType: 'social',
    reliabilityClassification: 'anecdote',
    defaultDentalRelevance: 80,
    enabled: true,
    verification: 'curl 200, valid Atom feed, 2026-09-06',
  },
  {
    id: 'reddit-dentists',
    name: 'r/Dentists',
    url: 'https://www.reddit.com/r/Dentists/.rss',
    sourceType: 'social',
    reliabilityClassification: 'anecdote',
    defaultDentalRelevance: 80,
    enabled: true,
    verification:
      'Same confirmed .rss scheme as r/Dentistry/r/askdentists; hit HTTP 429 (rate limit, ' +
      'not a block) during verification because all checks ran back-to-back. Ingestion runs ' +
      'are spaced out, so kept enabled — recheck if the cron run logs repeated errors for this id.',
  },
  {
    id: 'reddit-healthcare',
    name: 'r/healthcare',
    url: 'https://www.reddit.com/r/healthcare/.rss',
    sourceType: 'social',
    reliabilityClassification: 'anecdote',
    defaultDentalRelevance: 15,
    enabled: true,
    verification: 'Same as reddit-dentists: 429 during back-to-back verification, not a 404/block.',
  },
  {
    id: 'reddit-practicemanagement',
    name: 'r/practicemanagement',
    url: 'https://www.reddit.com/r/practicemanagement/.rss',
    sourceType: 'social',
    reliabilityClassification: 'anecdote',
    defaultDentalRelevance: 40,
    enabled: true,
    verification: 'Same as reddit-dentists: 429 during back-to-back verification, not a 404/block.',
  },
  // r/dentalpractice: the subreddit itself is banned (feed returns "Dentalpractice: banned"
  // with an empty entry list) — dropped per brief instructions, not added here.

  // ── YouTube (public channel RSS, no API key) ───────────────────────────
  {
    id: 'youtube-identity-dental-marketing',
    name: 'Identity Dental Marketing (YouTube)',
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_S7bXDvmEnf2o8MkDu2yhg',
    sourceType: 'video',
    reliabilityClassification: 'reported_opinion',
    defaultDentalRelevance: 85,
    enabled: true,
    verification: 'curl 200, valid Atom feed, channel title confirmed, 2026-09-06',
  },
  {
    id: 'youtube-kickstart-dental-marketing',
    name: 'KickStart Dental Marketing (YouTube)',
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UClvXBKc6Wmcr-qL2v0JWmJg',
    sourceType: 'video',
    reliabilityClassification: 'reported_opinion',
    defaultDentalRelevance: 85,
    enabled: true,
    verification: 'curl 200, valid Atom feed, channel title confirmed, 2026-09-06',
  },
  {
    id: 'youtube-dental-growth-strategies',
    name: 'Dental Growth Strategies (YouTube)',
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCSp08h6MEJaU3Ukg8y09PVw',
    sourceType: 'video',
    reliabilityClassification: 'reported_opinion',
    defaultDentalRelevance: 85,
    enabled: true,
    verification: 'curl 200, valid Atom feed, channel title confirmed, 2026-09-06',
  },
  {
    id: 'youtube-marketly-digital',
    name: 'Marketly Digital (YouTube)',
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCdH00gRqxC1KWntOD689Nhg',
    sourceType: 'video',
    reliabilityClassification: 'reported_opinion',
    defaultDentalRelevance: 85,
    enabled: true,
    verification: 'curl 200, valid Atom feed, channel title confirmed, 2026-09-06',
  },
  {
    id: 'youtube-progressive-dental-marketing',
    name: 'Progressive Dental Marketing (YouTube)',
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCIrPZEIPn3R11F_gEL2ju5w',
    sourceType: 'video',
    reliabilityClassification: 'reported_opinion',
    defaultDentalRelevance: 85,
    enabled: true,
    verification: 'curl 200, valid Atom feed, channel title confirmed, 2026-09-06',
  },

  // ── Google News RSS queries (no API key) ───────────────────────────────
  {
    id: 'google-news-dental-practice-marketing',
    name: 'Google News: "dental practice marketing"',
    url: 'https://news.google.com/rss/search?q=%22dental+practice+marketing%22&hl=en-US&gl=US&ceid=US:en',
    sourceType: 'news',
    reliabilityClassification: 'reported_opinion',
    defaultDentalRelevance: 80,
    enabled: true,
    verification: 'curl 200, valid RSS, 2026-09-06',
  },
  {
    id: 'google-news-dso-acquisition',
    name: 'Google News: "DSO acquisition"',
    url: 'https://news.google.com/rss/search?q=%22DSO+acquisition%22&hl=en-US&gl=US&ceid=US:en',
    sourceType: 'news',
    reliabilityClassification: 'reported_opinion',
    defaultDentalRelevance: 70,
    enabled: true,
    verification: 'curl 200, valid RSS, 2026-09-06',
  },
  {
    id: 'google-news-dental-patient-experience',
    name: 'Google News: "dental patient experience"',
    url: 'https://news.google.com/rss/search?q=%22dental+patient+experience%22&hl=en-US&gl=US&ceid=US:en',
    sourceType: 'news',
    reliabilityClassification: 'reported_opinion',
    defaultDentalRelevance: 80,
    enabled: true,
    verification: 'curl 200, valid RSS, 2026-09-06',
  },
  {
    id: 'google-news-dental-no-show',
    name: 'Google News: "dental no-show"',
    url: 'https://news.google.com/rss/search?q=%22dental+no-show%22&hl=en-US&gl=US&ceid=US:en',
    sourceType: 'news',
    reliabilityClassification: 'reported_opinion',
    defaultDentalRelevance: 80,
    enabled: true,
    verification: 'curl 200, valid RSS, 2026-09-06',
  },
]

// ── Dropped candidates (404 / 403 / banned) — kept here so a future pass doesn't re-try
// the same dead ends. Never wired into FEED_REGISTRY.
export const DROPPED_CANDIDATES: { name: string; url: string; reason: string }[] = [
  { name: 'ADA News', url: 'https://www.ada.org/publications/ada-news/rss', reason: '404 on every URL guess tried' },
  { name: 'DentistryIQ', url: 'https://www.dentistryiq.com/rss', reason: '404' },
  { name: 'Dental Economics', url: 'https://www.dentaleconomics.com/rss', reason: '404' },
  { name: "Becker's Dental Review", url: 'https://www.beckersdental.com/rss.xml', reason: '404 on every URL guess tried' },
  { name: 'Dentistry Today', url: 'https://www.dentistrytoday.com/feed/', reason: '403 (blocks non-browser UAs)' },
  { name: 'DrBicuspid', url: 'https://www.drbicuspid.com/rss', reason: '403 (blocks non-browser UAs)' },
  { name: 'The Dentalpreneur', url: 'https://thedentalpreneur.com/feed/', reason: 'connection failed / DNS' },
  { name: 'CMS Newsroom', url: 'https://www.cms.gov/newsroom/rss', reason: '404' },
  { name: 'HHS News', url: 'https://www.hhs.gov/about/news/rss.xml', reason: '403' },
  { name: 'FDA Dental Devices', url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/dental-devices/rss.xml', reason: '404' },
  { name: "Becker's Hospital Review", url: 'https://www.beckershospitalreview.com/rss.xml', reason: '404 on every URL guess tried' },
  { name: 'Healthcare IT News', url: 'https://www.healthcareitnews.com/home/feed', reason: '403 (blocks non-browser UAs)' },
  { name: 'Modern Healthcare', url: 'https://www.modernhealthcare.com/rss.xml', reason: '403' },
  { name: 'r/dentalpractice', url: 'https://www.reddit.com/r/dentalpractice/.rss', reason: 'subreddit is banned' },
]
