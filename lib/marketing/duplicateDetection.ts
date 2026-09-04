/** Ported unchanged from marketing_content/lib/duplicate-detection.ts. Warns on
 * near-duplicate story ideas via embedding cosine similarity. The local hashing
 * fallback embedding (lib/marketing/embeddings.ts) is coarser than a real semantic
 * embedding, so the default threshold is lower than the 0.86 a real provider would
 * warrant — see README note carried into the port summary. */
import { embed } from './embeddings'

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

export interface DuplicateMatch {
  id: string
  similarity: number
}

export interface DuplicateCheckResult {
  isDuplicate: boolean
  matches: DuplicateMatch[]
}

const DEFAULT_THRESHOLD = 0.86

export async function checkDuplicate(
  candidateText: string,
  existing: { id: string; text: string }[],
  threshold: number = DEFAULT_THRESHOLD,
): Promise<DuplicateCheckResult> {
  const candidateVector = await embed(candidateText)
  const matches: DuplicateMatch[] = []
  for (const item of existing) {
    const similarity = cosineSimilarity(candidateVector, await embed(item.text))
    if (similarity >= threshold) {
      matches.push({ id: item.id, similarity })
    }
  }
  matches.sort((a, b) => b.similarity - a.similarity)
  return { isDuplicate: matches.length > 0, matches }
}
