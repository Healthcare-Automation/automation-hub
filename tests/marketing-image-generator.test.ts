import assert from 'node:assert/strict'
import { test } from 'node:test'

/** No OPENAI_API_KEY is configured in this environment, so — same convention as
 * tests/marketing-llm.test.ts — these exercise the real code paths against a mocked
 * global.fetch rather than a live API key (INSTAGRAM_IMAGE_BRIEF.md verification: build and
 * unit-test against a mocked fetch, do not fabricate output). */
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

const SAMPLE_INPUT = {
  stylePrompt: 'clean, professional, high-contrast dark navy background with a single accent color',
  statOrQuote: '73% of local searches convert within 24 hours',
  citationSource: 'https://example.com/study',
}

test('generateStatCardImage returns null with no LLM provider configured', async () => {
  const { generateStatCardImage } = await import('../lib/marketing/imageGenerator')
  await withEnv('OPENAI_API_KEY', undefined, async () => {
    const result = await generateStatCardImage(SAMPLE_INPUT)
    assert.equal(result, null)
  })
})

test('generateStatCardImage decodes base64 image data into a Buffer, and never renders the citation URL', async (t) => {
  const { generateStatCardImage } = await import('../lib/marketing/imageGenerator')
  const pngBytes = Buffer.from('89504e470d0a1a0a', 'hex')
  const b64 = pngBytes.toString('base64')
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string)
    assert.equal(body.model, 'gpt-image-1')
    assert.match(body.prompt, /73% of local searches convert within 24 hours/)
    // Citation URLs must never be rendered as visible text in the image (the original bug:
    // a raw URL with ?utm_source= showed up baked into the graphic).
    assert.doesNotMatch(body.prompt, /example\.com/)
    assert.doesNotMatch(body.prompt, /https?:\/\//)
    return new Response(JSON.stringify({ data: [{ b64_json: b64 }] }), { status: 200 })
  })
  await withEnv('OPENAI_API_KEY', 'sk-test', async () => {
    const result = await generateStatCardImage(SAMPLE_INPUT)
    assert.ok(result)
    assert.ok(result.bytes.equals(pngBytes))
  })
})

test('generateStatCardImage strips URLs and calendar years out of the rendered stat text', async (t) => {
  const { generateStatCardImage } = await import('../lib/marketing/imageGenerator')
  const pngBytes = Buffer.from('89504e470d0a1a0a', 'hex')
  const b64 = pngBytes.toString('base64')
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string)
    assert.doesNotMatch(body.prompt, /2024/)
    assert.doesNotMatch(body.prompt, /wordstream\.com/)
    assert.doesNotMatch(body.prompt, /utm_source/)
    assert.match(body.prompt, /Referred patients accept treatment plans/)
    return new Response(JSON.stringify({ data: [{ b64_json: b64 }] }), { status: 200 })
  })
  await withEnv('OPENAI_API_KEY', 'sk-test', async () => {
    const result = await generateStatCardImage({
      stylePrompt: SAMPLE_INPUT.stylePrompt,
      statOrQuote: 'Referred patients accept treatment plans in 2024, per wordstream.com/blog?utm_source=openai',
      citationSource: 'https://wordstream.com/blog?utm_source=openai',
    })
    assert.ok(result)
  })
})

test('generateStatCardImage returns null (never throws) on a failed request', async (t) => {
  const { generateStatCardImage } = await import('../lib/marketing/imageGenerator')
  t.mock.method(globalThis, 'fetch', async () => new Response('quota exceeded', { status: 429 }))
  await withEnv('OPENAI_API_KEY', 'sk-test', async () => {
    const result = await generateStatCardImage(SAMPLE_INPUT)
    assert.equal(result, null)
  })
})

test('generateStatCardImage returns null when the response has no image data', async (t) => {
  const { generateStatCardImage } = await import('../lib/marketing/imageGenerator')
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data: [] }), { status: 200 }))
  await withEnv('OPENAI_API_KEY', 'sk-test', async () => {
    const result = await generateStatCardImage(SAMPLE_INPUT)
    assert.equal(result, null)
  })
})

test('generateStatCardImage returns null (never throws) when fetch itself rejects', async (t) => {
  const { generateStatCardImage } = await import('../lib/marketing/imageGenerator')
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('network down')
  })
  await withEnv('OPENAI_API_KEY', 'sk-test', async () => {
    const result = await generateStatCardImage(SAMPLE_INPUT)
    assert.equal(result, null)
  })
})
