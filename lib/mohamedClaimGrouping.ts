import type { ClaimTrace } from './mohamedLedger'

export type ClaimGroup = { memberId: string | null; claims: ClaimTrace[] }

/** A claim that needs a human look: HCPF denied it, or the post-submission
 * re-check disagreed with the receipt / couldn't find it. */
export function isClaimFlagged(claim: ClaimTrace): boolean {
  if (claim.hcpfStatus === 'denied') return true
  const v = claim.validation?.status
  return v === 'mismatch' || v === 'not_found'
}

/**
 * Groups claims by resolved member id, preserving each claim's original
 * relative order within its group. A claim whose member id hasn't resolved
 * yet (still fetching, or the fields.json fetch failed) gets its own
 * single-claim group rather than being lumped into one "unknown" bucket --
 * lumping would misleadingly imply those claims belong to the same patient.
 *
 * Groups containing a flagged claim sort first so anything that needs a
 * look surfaces at the top. Ties keep their original first-appearance
 * order (Array.prototype.sort is stable).
 */
export function groupClaimsByMember(claims: ClaimTrace[], memberIds: Record<string, string | null | undefined>): ClaimGroup[] {
  const groups = new Map<string, ClaimGroup>()
  for (const claim of claims) {
    const resolved = memberIds[claim.claimRef] ?? null
    const key = resolved ?? `__pending:${claim.claimRef}`
    const group = groups.get(key) ?? { memberId: resolved, claims: [] }
    group.claims.push(claim)
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => {
    const aFlag = a.claims.some(isClaimFlagged)
    const bFlag = b.claims.some(isClaimFlagged)
    if (aFlag === bFlag) return 0
    return aFlag ? -1 : 1
  })
}
