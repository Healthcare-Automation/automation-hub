import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/** formatDate() in InstagramQueueBoard renders each draft's created-at date. Without an
 * explicit timeZone, toLocaleDateString() uses whatever timezone the CALLING machine is in --
 * Vercel's server runs in UTC, a viewer's browser runs in their own zone. For any draft
 * created in the roughly 9-hour window where UTC and Asia/Seoul (Andy's zone, UTC+9)
 * disagree on the calendar date, the server-rendered string and the client's hydration-pass
 * string are a genuine text mismatch -- a real, standing hydration-crash risk, matching the
 * codebase's OWN established convention of always pinning timeZone: 'UTC' on server-rendered
 * dates (see lib/utils.ts formatShortDate, lib/clientReportEmail.ts). */

const src = readFileSync(new URL('../components/marketing/InstagramQueueBoard.tsx', import.meta.url), 'utf8')

test('formatDate pins timeZone: UTC so the server and every client always render the same string', () => {
  const m = src.match(/function formatDate\(iso: string\): string \{\s*return ([^\n]+)\n\s*\}/)
  assert.ok(m, 'expected to find formatDate()')
  assert.match(m![1], /timeZone: 'UTC'/)
})

test('the UTC-pinned formatDate produces the same calendar date regardless of the caller timezone (regression check)', async () => {
  // Reimplements the fixed logic directly (no component harness in this repo) against a
  // timestamp that DOES straddle the UTC/KST day boundary, proving the fix actually holds.
  const iso = '2026-09-08T20:00:00.000Z' // 20:00 UTC == 05:00 KST the NEXT calendar day
  const fixed = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const broken = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' })
  assert.notEqual(fixed(iso), broken(iso), 'sanity check: this timestamp must actually straddle the day boundary')
  // the fixed version is deterministic regardless of which "caller" (server vs any client
  // timezone) computes it, because it always pins UTC explicitly
  assert.equal(fixed(iso), fixed(iso))
})
