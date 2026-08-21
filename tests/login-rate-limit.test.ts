import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clearLoginAttempts,
  loginLimiterSizeForTest,
  reserveLoginAttempt,
  resetLoginLimitsForTest,
} from '../lib/loginRateLimit'

test('login limiter allows five reservations and blocks the sixth', () => {
  resetLoginLimitsForTest()
  const now = 1_000_000
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal(reserveLoginAttempt('tenant:ip', now).allowed, true)
  }
  const blocked = reserveLoginAttempt('tenant:ip', now)
  assert.equal(blocked.allowed, false)
  assert.ok(blocked.retryAfterSeconds > 0)
})

test('a burst of concurrent reservations lets exactly five through', () => {
  resetLoginLimitsForTest()
  const now = 1_000_000
  // Reservation is synchronous, so twenty back-to-back calls with no await in
  // between model twenty concurrent requests racing one process-local counter.
  const results = Array.from({ length: 20 }, () => reserveLoginAttempt('tenant:ip', now))
  assert.equal(results.filter((r) => r.allowed).length, 5)
  assert.equal(results.filter((r) => !r.allowed).length, 15)
})

test('successful login clears prior reservations', () => {
  resetLoginLimitsForTest()
  const now = 1_000_000
  for (let attempt = 0; attempt < 5; attempt++) reserveLoginAttempt('tenant:ip', now)
  clearLoginAttempts('tenant:ip')
  assert.equal(reserveLoginAttempt('tenant:ip', now).allowed, true)
})

test('expired windows reset automatically', () => {
  resetLoginLimitsForTest()
  const now = 1_000_000
  for (let attempt = 0; attempt < 5; attempt++) reserveLoginAttempt('tenant:ip', now)
  assert.equal(reserveLoginAttempt('tenant:ip', now).allowed, false)
  assert.equal(reserveLoginAttempt('tenant:ip', now + 16 * 60 * 1000).allowed, true)
})

test('attacker-controlled keys cannot grow the limiter without bound', () => {
  resetLoginLimitsForTest()
  const now = 1_000_000
  for (let index = 0; index < 12_000; index++) reserveLoginAttempt(`tenant:${index}`, now)
  assert.ok(loginLimiterSizeForTest() <= 10_000)
})
