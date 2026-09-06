import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { z } from 'zod'

/** No OPENAI_API_KEY is configured in this environment, so these tests exercise the real
 * LLM code paths against a mocked global.fetch rather than a live API key — per
 * MARKETING_V1_BRIEF.md section 3 ("build and unit-test against a mocked fetch; do not
 * fabricate output"). Each test sets/restores process.env.OPENAI_API_KEY itself so the
 * suite is safe to run whether or not a real key is present in the environment.
 *
 * generateContent/generateAngles both read learned preferences from a real Postgres
 * connection (lib/marketingPreferences.ts) that isn't available in this sandbox — mocked
 * here at module scope (not t.mock.module, which is test-scoped) so it's in place before
 * any test's first dynamic import of contentGenerator/storyGenerator, regardless of run
 * order within this file. */
// @types/node@20 only declares the older `namedExports` option (the installed Node
// runtime prints a harmless deprecation notice preferring `exports` instead) — keep
// namedExports until @types/node catches up so `npm run typecheck` stays clean.
mock.module('../lib/marketingPreferences.ts', {
  namedExports: { getActivePreferences: async () => [] },
})

// NB: `await fn()` (not `return fn()`) matters here — generateContent awaits
// getActivePreferences before it ever reads OPENAI_API_KEY, so a bare `return fn()` lets
// `finally` restore the env var while fn's promise is still pending, unsetting the key
// before the code under test gets to check it.
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

test('generateContent falls back to the template generator with no LLM key', async () => {
  const { generateContent } = await import('../lib/marketing/contentGenerator')
  await withEnv('OPENAI_API_KEY', undefined, async () => {
    const draft = await generateContent({
      orgId: '00000000-0000-0000-0000-000000000000',
      format: 'linkedin_post',
      opportunityTitle: 'Test opportunity',
      angle: {
        angleType: 'practical',
        structure: {
          audience: 'Dentists',
          recognizableMoment: 'A recognizable moment.',
          tensionOrMisconception: 'A tension.',
          evidence: 'Some evidence.',
          ourInterpretation: 'Our take.',
          whyItMatters: 'It matters.',
          takeaway: 'Do this.',
          closingThoughtCta: 'What do you think?',
          isHypothetical: false,
        },
        appliedPreferenceNotes: [],
      },
      sourceMaterialLinks: [],
    })
    assert.equal(draft.generatedBy, 'template')
    assert.ok(draft.draftText.includes('A recognizable moment.'))
  })
})

test('generateContent uses the LLM structured-output path when a key is configured', async (t) => {
  const { generateContent } = await import('../lib/marketing/contentGenerator')
  await withEnv('OPENAI_API_KEY', 'sk-test', async () => {
    mockChatCompletion(
      t,
      JSON.stringify({
        hookOptions: ['Hook one', 'Hook two'],
        draftText: 'LLM-authored draft text.',
        alternativePov: 'A fair counter-argument.',
        claimsRequiringReview: ['Unverified claim about volume.'],
        suggestedVisual: null,
      }),
    )
    const draft = await generateContent({
      orgId: '00000000-0000-0000-0000-000000000000',
      format: 'video_script',
      opportunityTitle: 'Test opportunity',
      angle: {
        angleType: 'human',
        structure: {
          audience: 'Patients',
          recognizableMoment: 'Example scenario: a patient waits.',
          tensionOrMisconception: 'A tension.',
          evidence: 'Some evidence.',
          ourInterpretation: 'Our take.',
          whyItMatters: 'It matters.',
          takeaway: 'Do this.',
          closingThoughtCta: 'What do you think?',
          isHypothetical: true,
        },
        appliedPreferenceNotes: [],
      },
      sourceMaterialLinks: [],
    })
    assert.equal(draft.generatedBy, 'llm')
    assert.equal(draft.draftText, 'LLM-authored draft text.')
    assert.deepEqual(draft.hookOptions, ['Hook one', 'Hook two'])
    assert.deepEqual(draft.claimsRequiringReview, ['Unverified claim about volume.'])
  })
})

test('generateContent falls back to the template when the LLM call fails outright', async (t) => {
  const { generateContent } = await import('../lib/marketing/contentGenerator')
  await withEnv('OPENAI_API_KEY', 'sk-test', async () => {
    t.mock.method(globalThis, 'fetch', async () => new Response('server error', { status: 500 }))
    const draft = await generateContent({
      orgId: '00000000-0000-0000-0000-000000000000',
      format: 'linkedin_post',
      opportunityTitle: 'Test opportunity',
      angle: {
        angleType: 'strategic',
        structure: {
          audience: 'DSO operators',
          recognizableMoment: 'A moment.',
          tensionOrMisconception: 'A tension.',
          evidence: 'Some evidence.',
          ourInterpretation: 'Our take.',
          whyItMatters: 'It matters.',
          takeaway: 'Do this.',
          closingThoughtCta: 'What do you think?',
          isHypothetical: false,
        },
        appliedPreferenceNotes: [],
      },
      sourceMaterialLinks: [],
    })
    assert.equal(draft.generatedBy, 'template')
  })
})
