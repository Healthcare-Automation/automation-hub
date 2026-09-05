'use client'

import { useEffect, useState } from 'react'
import type { ClaimTrace, RunLedgerSnapshot } from '@/lib/mohamedLedger'
import { wasSubmitted } from '@/lib/mohamedLedger'
import { getClaimMemberId } from '@/lib/mohamedReviewClient'
import { groupClaimsByMember } from '@/lib/mohamedClaimGrouping'
import { ClaimReviewCard } from './ClaimReviewCard'

/**
 * Groups a run's claims under "Member <id> — N claims" headers, members
 * with a flagged claim (denied / validation disagreed) first. Resolves each
 * claim's member id from its own fields.json — the same fetch
 * ClaimReviewCard already does for its headline, sharing the same
 * module-level cache in mohamedReviewClient so this never doubles the
 * number of VPS round trips.
 */
export function ClaimsByMember({ runId, ledger, claims }: { runId: string; ledger: RunLedgerSnapshot; claims: ClaimTrace[] }) {
  const [memberIds, setMemberIds] = useState<Record<string, string | null>>({})

  useEffect(() => {
    let cancelled = false
    for (const claim of claims) {
      getClaimMemberId(runId, claim.claimRef)
        .then(memberId => {
          if (cancelled) return
          setMemberIds(prev => ({ ...prev, [claim.claimRef]: memberId }))
        })
        .catch(() => {
          if (!cancelled) setMemberIds(prev => ({ ...prev, [claim.claimRef]: null }))
        })
    }
    return () => {
      cancelled = true
    }
    // claims is a derived array (new identity each render) -- key off runId
    // and the claim refs themselves so this doesn't refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, claims.map(c => c.claimRef).join(',')])

  const groups = groupClaimsByMember(claims, memberIds)

  return (
    <div className="space-y-4">
      {groups.map(group => (
        <div key={group.memberId ?? group.claims[0].claimRef}>
          <h3 className="mb-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            {group.memberId ? `Member ${group.memberId}` : 'Member (pending)'} — {group.claims.length} claim
            {group.claims.length === 1 ? '' : 's'}
          </h3>
          <div className="space-y-2">
            {group.claims.map(claim => (
              <ClaimReviewCard key={claim.claimRef} runId={runId} claim={claim} submitted={wasSubmitted(ledger, claim.claimRef)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
