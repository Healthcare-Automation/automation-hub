import type { ClaimTrace } from './mohamedLedger'

export type ClaimGroup = { memberId: string | null; claims: ClaimTrace[] }

export function isClaimOpen(decision: 'approved' | 'rejected' | null | undefined): boolean {
  return decision !== 'approved' && decision !== 'rejected'
}

/**
 * Groups reviewable claims by resolved member id, preserving each claim's
 * original relative order within its group. A claim whose member id hasn't
 * resolved yet (still fetching, or the fields.json fetch failed) gets its
 * own single-claim group rather than being lumped into one "unknown"
 * bucket -- lumping would misleadingly imply those claims belong to the
 * same patient.
 *
 * Groups containing at least one still-open (undecided) claim sort first,
 * per Andy's ask that unreviewed patients surface at the top. Ties keep
 * their original first-appearance order (Array.prototype.sort is stable).
 */
export function groupClaimsByMember(
  claims: ClaimTrace[],
  memberIds: Record<string, string | null | undefined>,
  decisionFor: (claimRef: string) => 'approved' | 'rejected' | null | undefined,
): ClaimGroup[] {
  const groups = new Map<string, ClaimGroup>()
  for (const claim of claims) {
    const resolved = memberIds[claim.claimRef] ?? null
    const key = resolved ?? `__pending:${claim.claimRef}`
    const group = groups.get(key) ?? { memberId: resolved, claims: [] }
    group.claims.push(claim)
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => {
    const aOpen = a.claims.some(c => isClaimOpen(decisionFor(c.claimRef)))
    const bOpen = b.claims.some(c => isClaimOpen(decisionFor(c.claimRef)))
    if (aOpen === bOpen) return 0
    return aOpen ? -1 : 1
  })
}
