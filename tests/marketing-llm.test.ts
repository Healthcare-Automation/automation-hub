import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'

/** No OPENAI_API_KEY is configured in this environment, so these tests exercise the real
 * LLM code paths against a mocked global.fetch rather than a live API key — per
 * MARKETING_V1_BRIEF.md section 3 ("build and unit-test against a mocked fetch; do not
 * fabricate output"). Each test sets/restores process.env.OPENAI_API_KEY itself so the
 * suite is safe to run whether or not a real key is present in the environment. */
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

function mockChatCompletion(t: any, content: string, ok = true) {
  t.mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: ok ? 200 : 500,
    }),
  )
}

test('hasLLMProvider reflects OPENAI_API_KEY, not OPENAI_ADMIN_KEY', async () => {
  const { hasLLMProvider } = await import('../lib/marketing/llm')
  await withEnv('OPENAI_API_KEY', undefined, async () => {
    await withEnv('OPENAI_ADMIN_KEY', 'admin-key-should-not-count', () => {
      assert.equal(hasLLMProvider(), false)
    })
  })
  await withEnv('OPENAI_API_KEY', 'sk-test', () => {
    assert.equal(hasLLMProvider(), true)
  })
})

test('complete() throws NoLLMProviderError when no key is configured', async () => {
  const { complete, NoLLMProviderError } = await import('../lib/marketing/llm')
  await withEnv('OPENAI_API_KEY', undefined, async () => {
    await assert.rejects(() => complete({ system: 's', prompt: 'p' }), NoLLMProviderError)
  })
})

test('completeJSON validates the model output against the given zod schema', async (t) => {
  const { completeJSON } = await import('../lib/marketing/llm')
  const schema = z.object({ foo: z.string() })
  await withEnv('OPENAI_API_KEY', 'sk-test', async () => {
    mockChatCompletion(t, JSON.stringify({ foo: 'bar' }))
    const result = await completeJSON({ system: 's', prompt: 'p' }, schema)
    assert.deepEqual(result, { foo: 'bar' })
  })
})

test('completeJSON throws when the model returns JSON that fails schema validation', async (t) => {
  const { completeJSON } = await import('../lib/marketing/llm')
  const schema = z.object({ foo: z.string() })
  await withEnv('OPENAI_API_KEY', 'sk-test', async () => {
    mockChatCompletion(t, JSON.stringify({ wrong: 'shape' }))
    await assert.rejects(() => completeJSON({ system: 's', prompt: 'p' }, schema))
  })
})

test('completeJSON throws on non-JSON model output instead of silently degrading', async (t) => {
  const { completeJSON } = await import('../lib/marketing/llm')
  const schema = z.object({ foo: z.string() })
  await withEnv('OPENAI_API_KEY', 'sk-test', async () => {
    mockChatCompletion(t, 'not json at all')
    await assert.rejects(() => completeJSON({ system: 's', prompt: 'p' }, schema), /did not return valid JSON/)
  })
})

