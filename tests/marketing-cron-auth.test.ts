import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { NextRequest } from 'next/server'

/** app/api/cron/marketing-research/route.ts's own Bearer-token check — separate from
 * tests/tenant-auth.test.ts's proxy.ts passthrough test, which only confirms the reverse
 * proxy doesn't redirect /api/cron/* paths before they reach this handler's own auth. */
mock.module('../lib/marketingDemoActor.ts', {
  namedExports: { getDemoOrgAndUser: async () => ({ orgId: 'org-1', userId: 'user-1' }) },
})
mock.module('../lib/marketingPipeline.ts', {
  namedExports: {
    runFullPipeline: async () => ({
      runId: 'run-1',
      itemsIngested: 0,
      itemsEnriched: 0,
      feedsProcessed: 0,
      feedsSkippedForBudget: 0,
      feedResults: [],
      itemsEmbedded: 0,
      clustersAttached: 0,
      clustersCreated: 0,
      clustersRescored: 0,
      opportunitiesCreated: 0,
    }),
  },
})

async function withEnv<T>(key: string, value: string | undefined, fn: () => T | Promise<T>): Promise<T> {
  const prior = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
  try {
    return await fn()
  } finally {
    if (prior === undefined) delete process.env[key]
    else process.env[key] = prior
  }
}

function request(headers: Record<string, string> = {}) {
  return new NextRequest('https://hub.example/api/cron/marketing-research', { headers })
}

test('marketing-research cron returns 500 when CRON_SECRET is not configured', async () => {
  const { GET } = await import('../app/api/cron/marketing-research/route')
  await withEnv('CRON_SECRET', undefined, async () => {
    const response = await GET(request())
    assert.equal(response.status, 500)
  })
})

test('marketing-research cron rejects requests without the correct bearer token', async () => {
  const { GET } = await import('../app/api/cron/marketing-research/route')
  await withEnv('CRON_SECRET', 'the-real-secret', async () => {
    const noAuth = await GET(request())
    assert.equal(noAuth.status, 401)

    const wrongAuth = await GET(request({ authorization: 'Bearer wrong' }))
    assert.equal(wrongAuth.status, 401)
  })
})

test('marketing-research cron runs the pipeline with the correct bearer token', async () => {
  const { GET } = await import('../app/api/cron/marketing-research/route')
  await withEnv('CRON_SECRET', 'the-real-secret', async () => {
    const response = await GET(request({ authorization: 'Bearer the-real-secret' }))
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.ok, true)
    assert.equal(body.runId, 'run-1')
  })
})
