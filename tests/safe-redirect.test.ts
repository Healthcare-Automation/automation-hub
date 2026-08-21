import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safeInternalPath } from '../lib/safeRedirect'

test('safeInternalPath accepts local Hub routes', () => {
  assert.equal(safeInternalPath('/'), '/')
  assert.equal(safeInternalPath('/mohamed'), '/mohamed')
  assert.equal(safeInternalPath('/admin/recovery?hours=24'), '/admin/recovery?hours=24')
})

test('safeInternalPath rejects external and protocol-relative redirects', () => {
  for (const value of ['https://evil.example', '//evil.example', '\\evil.example', 'javascript:alert(1)', '']) {
    assert.equal(safeInternalPath(value, '/'), '/')
  }
})

test('safeInternalPath rejects control characters the URL parser would strip', () => {
  // searchParams.get() decodes %09 / %0a / %0d to the raw control character.
  for (const value of ['/\t/evil.example', '/\n/evil.example', '/\r/evil.example', '/\x00/evil.example', '/\x7f/evil.example']) {
    assert.equal(safeInternalPath(value, '/'), '/')
  }
})

test('safeInternalPath rejects anything that resolves off the trusted origin', () => {
  for (const value of ['/\\evil.example', '/\\\\evil.example', '//evil.example/path']) {
    assert.equal(safeInternalPath(value, '/'), '/')
  }
})
