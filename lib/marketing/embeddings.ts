/** Single entry point for turning text into an embedding vector. Uses OpenAI
 * text-embedding-3-small when OPENAI_API_KEY is set (same key as lib/marketing/llm.ts —
 * NOT OPENAI_ADMIN_KEY); falls back to a deterministic local hashing embedding otherwise,
 * so duplicate detection and clustering work with zero external accounts. The local
 * fallback is coarser than a real semantic embedding — see duplicateDetection.ts and
 * clustering.ts for the correspondingly lower similarity thresholds used with it. */

const DIMENSIONS = 256
const EMBEDDING_MODEL = 'text-embedding-3-small'

function hashToken(token: string): number {
  let hash = 2166136261
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function localHashEmbedding(text: string): number[] {
  const vector = new Array(DIMENSIONS).fill(0)
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? []
  for (const token of tokens) {
    const bucket = hashToken(token) % DIMENSIONS
    vector[bucket] += 1
  }
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1
  return vector.map((v) => v / magnitude)
}

export function hasEmbeddingsProvider(): boolean {
  return Boolean(process.env.OPENAI_API_KEY)
}

async function openaiEmbed(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY
  const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.slice(0, 8000) }),
  })
  if (!response.ok) {
    throw new Error(`Embeddings provider request failed: ${response.status} ${await response.text()}`)
  }
  const data = await response.json()
  const vector = data.data?.[0]?.embedding
  if (!Array.isArray(vector)) throw new Error('Embeddings provider returned no vector')
  return vector
}

/** Never throws for a missing key — falls back to the local hash embedding. Does throw
 * if a key is set but the request itself fails, so callers see a real provider error
 * rather than silently degrading to the (much coarser) fallback mid-run. */
export async function embed(text: string): Promise<number[]> {
  if (!hasEmbeddingsProvider()) {
    return localHashEmbedding(text)
  }
  return openaiEmbed(text)
}
