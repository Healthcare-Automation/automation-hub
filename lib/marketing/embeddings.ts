/** Ported unchanged from marketing_content/lib/embeddings.ts. Single entry point for
 * turning text into an embedding vector. Falls back to a deterministic local hashing
 * embedding when EMBEDDINGS_API_KEY is not set, so duplicate detection works with zero
 * external accounts. */

const DIMENSIONS = 256

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

export async function embed(text: string): Promise<number[]> {
  if (!process.env.EMBEDDINGS_API_KEY) {
    return localHashEmbedding(text)
  }
  // Real-provider path intentionally left minimal: swap in a fetch call to your
  // embeddings provider of choice here. Not exercised without a key.
  throw new Error(
    'EMBEDDINGS_API_KEY is set but no real embeddings provider is wired up yet. ' +
      'Unset EMBEDDINGS_API_KEY to use the local fallback.',
  )
}
