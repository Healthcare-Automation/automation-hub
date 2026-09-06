import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { NextRequest } from 'next/server'
import { buildAdminCookieValue } from '../lib/adminAuth'
import { buildClientCookieValue, verifyClientCookieValue } from '../lib/portalAuth'
import {
  MOHAMED_COOKIE_NAME,
  buildMohamedCookieValue,
  checkMohamedAccessCode,
  isMohamedPortalConfigured,
  verifyMohamedCookieValue,
} from '../lib/mohamedAuth'
import { proxy } from '../proxy'

const originalEnv = {
  ADMIN_COOKIE_SECRET: process.env.ADMIN_COOKIE_SECRET,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  CLIENT_ACCESS_CODE: process.env.CLIENT_ACCESS_CODE,
  MOHAMED_ACCESS_CODE: process.env.MOHAMED_ACCESS_CODE,
}

before(() => {
  process.env.ADMIN_COOKIE_SECRET = 'test-cookie-secret-with-at-least-32-characters'
  process.env.ADMIN_PASSWORD = 'admin-test-password'
  process.env.CLIENT_ACCESS_CODE = 'proxi-test-code'
  process.env.MOHAMED_ACCESS_CODE = 'mohamed-test-code-with-32-characters'
})

after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key as keyof NodeJS.ProcessEnv]
    else process.env[key as keyof NodeJS.ProcessEnv] = value
  }
})

function request(path: string, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; ')
  return new NextRequest(`https://hub.example${path}`, {
    headers: cookie ? { cookie } : undefined,
  })
}

function redirectPath(response: Response): string | null {
  const location = response.headers.get('location')
  if (!location) return null
  const url = new URL(location)
  return `${url.pathname}${url.search}`
}

test('Mohamed access code creates only a Mohamed-scoped signed session', async () => {
  assert.equal(checkMohamedAccessCode('mohamed-test-code-with-32-characters'), true)
  assert.equal(checkMohamedAccessCode('proxi-test-code'), false)

  const cookie = await buildMohamedCookieValue(1_000_000)
  assert.equal(await verifyMohamedCookieValue(cookie, 1_000_001), true)
  assert.equal(await verifyClientCookieValue(cookie, 1_000_001), false)
})

test('weak Mohamed access codes fail configuration closed', () => {
  const strong = process.env.MOHAMED_ACCESS_CODE
  process.env.MOHAMED_ACCESS_CODE = 'short-code'
  try {
    assert.equal(isMohamedPortalConfigured(), false)
    assert.equal(checkMohamedAccessCode('short-code'), false)
  } finally {
    process.env.MOHAMED_ACCESS_CODE = strong
  }
})

test('Proxi client session cannot pass Mohamed verification', async () => {
  const cookie = await buildClientCookieValue(1_000_000)
  assert.equal(await verifyClientCookieValue(cookie, 1_000_001), true)
  assert.equal(await verifyMohamedCookieValue(cookie, 1_000_001), false)
})

test('Mohamed session rejects tampering and expiration', async () => {
  const now = 1_000_000
  const cookie = await buildMohamedCookieValue(now)
  const tampered = `${cookie.slice(0, -1)}${cookie.endsWith('a') ? 'b' : 'a'}`

  assert.equal(await verifyMohamedCookieValue(tampered, now + 1), false)
  assert.equal(await verifyMohamedCookieValue(cookie, now + 31 * 24 * 60 * 60 * 1000), false)
})

test('root Proxi dashboard requires an admin session', async () => {
  const denied = await proxy(request('/'))
  assert.equal(redirectPath(denied), '/admin/login?next=%2F')

  const admin = await buildAdminCookieValue()
  const allowed = await proxy(request('/', { ah_admin: admin }))
  assert.equal(allowed.headers.get('x-middleware-next'), '1')
})

test('Mohamed area accepts only Mohamed or admin sessions', async () => {
  const denied = await proxy(request('/mohamed'))
  assert.equal(redirectPath(denied), '/mohamed/login')

  const proxi = await buildClientCookieValue()
  const proxiDenied = await proxy(request('/mohamed', { ah_client: proxi }))
  assert.equal(redirectPath(proxiDenied), '/mohamed/login')

  const mohamed = await buildMohamedCookieValue()
  const clientAllowed = await proxy(request('/mohamed', { [MOHAMED_COOKIE_NAME]: mohamed }))
  assert.equal(clientAllowed.headers.get('x-middleware-next'), '1')

  const admin = await buildAdminCookieValue()
  const adminAllowed = await proxy(request('/mohamed', { ah_admin: admin }))
  assert.equal(adminAllowed.headers.get('x-middleware-next'), '1')
})

test('Mohamed session cannot access any Proxi page or data API', async () => {
  const mohamed = await buildMohamedCookieValue()

  for (const path of ['/portal', '/djc/overview', '/impact']) {
    const response = await proxy(request(path, { [MOHAMED_COOKIE_NAME]: mohamed }))
    assert.notEqual(response.headers.get('x-middleware-next'), '1', `${path} must be denied`)
  }

  for (const path of ['/api/djc/summary', '/api/runs', '/api/reports/drill']) {
    const response = await proxy(request(path, { [MOHAMED_COOKIE_NAME]: mohamed }))
    assert.equal(response.status, 401, `${path} must return 401`)
    assert.equal(response.headers.get('location'), null)
  }
})

test('Proxi client can use report APIs but cannot open admin intelligence', async () => {
  const proxi = await buildClientCookieValue()

  const report = await proxy(request('/api/reports/drill', { ah_client: proxi }))
  assert.equal(report.headers.get('x-middleware-next'), '1')

  for (const path of ['/djc/overview', '/api/djc/summary']) {
    const response = await proxy(request(path, { ah_client: proxi }))
    assert.notEqual(response.headers.get('x-middleware-next'), '1', `${path} must be denied`)
  }
})

test('sending impact-report emails is admin only', async () => {
  const proxi = await buildClientCookieValue()
  const mohamed = await buildMohamedCookieValue()
  const denied: Record<string, string>[] = [{}, { ah_client: proxi }, { [MOHAMED_COOKIE_NAME]: mohamed }]
  for (const cookies of denied) {
    const response = await proxy(request('/api/reports/send', cookies))
    assert.equal(response.status, 401)
  }
  const admin = await buildAdminCookieValue()
  const allowed = await proxy(request('/api/reports/send', { ah_admin: admin }))
  assert.equal(allowed.headers.get('x-middleware-next'), '1')
})

test('admin session can cross Proxi and Mohamed tenant routes', async () => {
  const admin = await buildAdminCookieValue()
  for (const path of ['/', '/djc/overview', '/api/djc/summary', '/mohamed']) {
    const response = await proxy(request(path, { ah_admin: admin }))
    assert.equal(response.headers.get('x-middleware-next'), '1', `${path} must be allowed`)
  }
})

test('cron and login endpoints remain reachable for their own authentication', async () => {
  for (const path of [
    '/api/cron/slack-alerts',
    '/api/cron/marketing-research',
    '/api/admin/login',
    '/api/portal/login',
    '/api/mohamed/login',
    '/admin/login',
    '/portal/login',
    '/mohamed/login',
  ]) {
    const response = await proxy(request(path))
    assert.equal(response.headers.get('x-middleware-next'), '1', `${path} must pass through`)
  }
})
