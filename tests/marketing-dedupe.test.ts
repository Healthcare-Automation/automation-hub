import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { RawItem } from '../lib/marketing/types'

/** ingestManualUrl's dedupe reporting (lib/marketingQueries.ts) relies on the real
 * (org_id, source_url) unique index + `ON CONFLICT DO NOTHING RETURNING id` — that SQL
 * contract is exercised for real against DATABASE_URL in MARKETING_V1_BRIEF.md section 6's
 * verification pass. What's unit-testable without a DB is the JS-level result: does
 * ingestManualUrl correctly report `inserted: false` when the insert returns no row
 * (simulating a conflict) vs. `inserted: true` when it returns one. Mocked here since
 * this sandbox has no DATABASE_URL. */

const FIXTURE_ITEM: RawItem = {
  sourceUrl: 'https://example.com/article',
  title: 'Example article',
  rawContent: 'Some content about dental practices.',
  publishedAt: null,
  authorOrOrg: null,
  sourceType: 'manual',
  supportingExcerpt: 'Some content about dental practices.',
  reliabilityClassification: 'reported_opinion',
  dentalRelevance: 80,
  healthcareRelevance: 40,
  geographicRelevance: 'national',
  topicClassification: [],
  isDemoData: false,
}

let itemInsertReturnsRow = true

function sqlMock(strings: TemplateStringsArray) {
  const text = strings.join('?')
  if (text.includes('insert into marketing_sources')) {
    return Promise.resolve([{ id: 'source-1' }])
  }
  if (text.includes('insert into marketing_source_items')) {
    return Promise.resolve(itemInsertReturnsRow ? [{ id: 'item-1' }] : [])
  }
  return Promise.resolve([])
}
sqlMock.json = (v: unknown) => v

mock.module('../lib/marketingDb.ts', {
  namedExports: { marketingSql: sqlMock, isMarketingConfigured: true },
})
mock.module('../lib/marketing/adapters/manualUrl.ts', {
  namedExports: { manualUrlAdapter: { id: 'manual-url', fetch: async () => [FIXTURE_ITEM] } },
})

test('ingestManualUrl reports inserted: true on a fresh URL', async () => {
  const { ingestManualUrl } = await import('../lib/marketingQueries')
  itemInsertReturnsRow = true
  const result = await ingestManualUrl('org-1', 'https://example.com/article')
  assert.deepEqual(result, { inserted: true })
})

test('ingestManualUrl reports inserted: false when the dedupe unique index rejects it', async () => {
  const { ingestManualUrl } = await import('../lib/marketingQueries')
  itemInsertReturnsRow = false
  const result = await ingestManualUrl('org-1', 'https://example.com/article')
  assert.deepEqual(result, { inserted: false })
})
