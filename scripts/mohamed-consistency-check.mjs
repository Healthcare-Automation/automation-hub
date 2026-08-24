#!/usr/bin/env node
// Proof that /mohamed renders the same set of sections on every refresh.
// Never logs the access code. Usage: node scripts/mohamed-consistency-check.mjs

import { execFileSync } from 'node:child_process'

const BASE_URL = process.env.MOHAMED_CHECK_BASE_URL ?? 'https://automation-hub-rosy.vercel.app'
const REQUIRED_SECTIONS = ['status', 'upload', 'claims', 'history', 'questions', 'technical', 'footer']
const TOTAL_REQUESTS = Number(process.env.MOHAMED_CHECK_REQUESTS ?? 50)
const CONCURRENCY = Number(process.env.MOHAMED_CHECK_CONCURRENCY ?? 5)

function decryptAccessCode() {
  const out = execFileSync(
    'sudo',
    [
      'systemd-creds',
      'decrypt',
      '--name=mohamed-hub-access-code',
      '/etc/credstore.encrypted/mohamed/mohamed-hub-access-code.cred',
      '-',
    ],
    { encoding: 'utf8' },
  )
  return out.trim()
}

async function login(code) {
  const res = await fetch(`${BASE_URL}/api/mohamed/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!res.ok) throw new Error(`login failed: HTTP ${res.status}`)
  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) throw new Error('login succeeded but no Set-Cookie header was returned')
  const cookie = setCookie.split(';')[0]
  const body = await res.json()
  if (!body.ok) throw new Error('login failed: response body ok=false')
  return cookie
}

function extractSections(html) {
  const found = new Set()
  const re = /data-section="([a-z]+)"/g
  let match
  while ((match = re.exec(html))) found.add(match[1])
  return found
}

async function fetchOnce(cookie, index) {
  const url = `${BASE_URL}/mohamed?cachebust=${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`
  const res = await fetch(url, {
    headers: {
      Cookie: cookie,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  })
  if (!res.ok) return { index, ok: false, status: res.status, sections: new Set() }
  const html = await res.text()
  return { index, ok: true, status: res.status, sections: extractSections(html) }
}

async function runPool(cookie) {
  const results = new Array(TOTAL_REQUESTS)
  let next = 0
  async function worker() {
    while (next < TOTAL_REQUESTS) {
      const index = next++
      results[index] = await fetchOnce(cookie, index)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return results
}

async function main() {
  const code = decryptAccessCode()
  const cookie = await login(code)

  const results = await runPool(cookie)

  let passCount = 0
  const failures = []
  let referenceSet = null

  for (const result of results) {
    if (!result.ok) {
      failures.push(`#${result.index}: HTTP ${result.status}`)
      continue
    }
    const missing = REQUIRED_SECTIONS.filter(section => !result.sections.has(section))
    if (missing.length > 0) {
      failures.push(`#${result.index}: missing [${missing.join(', ')}]`)
      continue
    }
    const sortedSections = [...result.sections].sort().join(',')
    if (referenceSet === null) {
      referenceSet = sortedSections
    } else if (sortedSections !== referenceSet) {
      failures.push(`#${result.index}: section set differs (${sortedSections} vs ${referenceSet})`)
      continue
    }
    passCount++
  }

  console.log(`${passCount}/${TOTAL_REQUESTS} passed`)
  if (failures.length > 0) {
    console.error('Failures:')
    for (const failure of failures) console.error(`  ${failure}`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
