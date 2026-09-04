/** Ported unchanged from marketing_content/lib/adapters/demo-google-trends.ts — 6
 * hand-written, clearly-labeled trend signals. Never a live Google Trends pull. */
import type { RawItem, SourceAdapter } from '../types'

const SIMULATED_NOTE = 'Simulated trend signal for demo purposes — not a live Google Trends pull.'

const DEMO_TOPICS: Omit<RawItem, 'isDemoData'>[] = [
  {
    sourceUrl: 'https://trends.google.com/demo/dental-no-show-reduction',
    title: "Rising search interest: 'dental appointment reminder text'",
    rawContent:
      `${SIMULATED_NOTE} Search interest for two-way appointment confirmation tools has climbed ` +
      'steadily over the past 90 days, alongside forum chatter about no-show rates.',
    publishedAt: new Date(),
    authorOrOrg: 'Demo Google Trends adapter',
    sourceType: 'trend_feed',
    supportingExcerpt: SIMULATED_NOTE,
    reliabilityClassification: 'unverified',
    dentalRelevance: 85,
    healthcareRelevance: 40,
    geographicRelevance: 'national',
    topicClassification: ['patient-communication', 'no-shows'],
  },
  {
    sourceUrl: 'https://trends.google.com/demo/dental-two-way-confirmation',
    title: "Search interest: 'two-way text confirmation dental office'",
    rawContent:
      `${SIMULATED_NOTE} Practice management forums show growing discussion of reply-to-confirm ` +
      'SMS flows as a no-show reduction tactic distinct from plain reminders.',
    publishedAt: new Date(),
    authorOrOrg: 'Demo Google Trends adapter',
    sourceType: 'trend_feed',
    supportingExcerpt: SIMULATED_NOTE,
    reliabilityClassification: 'unverified',
    dentalRelevance: 80,
    healthcareRelevance: 35,
    geographicRelevance: 'national',
    topicClassification: ['patient-communication', 'no-shows'],
  },
  {
    sourceUrl: 'https://trends.google.com/demo/ai-scheduling-dental',
    title: "Rising search interest: 'AI scheduling software for dental practices'",
    rawContent:
      `${SIMULATED_NOTE} Search and social interest in AI-assisted scheduling and triage tools for ` +
      'dental practices has grown quarter over quarter.',
    publishedAt: new Date(),
    authorOrOrg: 'Demo Google Trends adapter',
    sourceType: 'trend_feed',
    supportingExcerpt: SIMULATED_NOTE,
    reliabilityClassification: 'unverified',
    dentalRelevance: 75,
    healthcareRelevance: 45,
    geographicRelevance: 'national',
    topicClassification: ['practice-technology', 'ai-scheduling'],
  },
  {
    sourceUrl: 'https://trends.google.com/demo/ai-diagnostics-adoption',
    title: "Search interest: 'AI dental diagnostic imaging'",
    rawContent:
      `${SIMULATED_NOTE} Interest in AI-assisted diagnostic imaging tools for dentistry is trending ` +
      'upward alongside broader practice-technology adoption chatter.',
    publishedAt: new Date(),
    authorOrOrg: 'Demo Google Trends adapter',
    sourceType: 'trend_feed',
    supportingExcerpt: SIMULATED_NOTE,
    reliabilityClassification: 'unverified',
    dentalRelevance: 78,
    healthcareRelevance: 50,
    geographicRelevance: 'national',
    topicClassification: ['practice-technology', 'ai-scheduling'],
  },
  {
    sourceUrl: 'https://trends.google.com/demo/dental-insurance-reimbursement',
    title: "Search interest: 'dental insurance reimbursement changes 2026'",
    rawContent:
      `${SIMULATED_NOTE} Search volume around dental insurance reimbursement policy changes has spiked, ` +
      'with practice owners searching for guidance on billing code updates.',
    publishedAt: new Date(),
    authorOrOrg: 'Demo Google Trends adapter',
    sourceType: 'trend_feed',
    supportingExcerpt: SIMULATED_NOTE,
    reliabilityClassification: 'unverified',
    dentalRelevance: 70,
    healthcareRelevance: 55,
    geographicRelevance: 'national',
    topicClassification: ['insurance-reimbursement'],
  },
  {
    sourceUrl: 'https://trends.google.com/demo/dso-consolidation',
    title: "Search interest: 'DSO acquiring independent dental practice'",
    rawContent:
      `${SIMULATED_NOTE} Search interest in dental service organization (DSO) consolidation and ` +
      'practice acquisition has trended upward among independent practice owners.',
    publishedAt: new Date(),
    authorOrOrg: 'Demo Google Trends adapter',
    sourceType: 'trend_feed',
    supportingExcerpt: SIMULATED_NOTE,
    reliabilityClassification: 'unverified',
    dentalRelevance: 65,
    healthcareRelevance: 50,
    geographicRelevance: 'national',
    topicClassification: ['dso-consolidation'],
  },
]

export const demoGoogleTrendsAdapter: SourceAdapter = {
  id: 'demo-google-trends',
  async fetch() {
    return DEMO_TOPICS.map((item) => ({ ...item, isDemoData: true }))
  },
}
