'use client'

import { useEffect, useState } from 'react'
import type { ClaimTrace } from '@/lib/mohamedLedger'
import type { ClaimApproval } from '@/lib/mohamedApprovals'
import { getClaimMemberId } from '@/lib/mohamedReviewClient'
import { groupClaimsByMember } from '@/lib/mohamedClaimGrouping'
import { ClaimReviewCard } from './ClaimReviewCard'

type ApprovalsLookup = Map<string, ClaimApproval> | Record<string, ClaimApproval>

function approvalFor(approvals: ApprovalsLookup, claimRef: string): ClaimApproval | null {
  if (approvals instanceof Map) return approvals.get(claimRef) ?? null
  return approvals[claimRef] ?? null
}

function decisionOf(approval: ClaimApproval | null): 'approved' | 'rejected' | null {
  if (!approval) return null
  if (approval.decision === 'approved' || approval.decision === 'rejected') return approval.decision
  return approval.approved ? 'approved' : null
}

/**
 * Groups a run's reviewable claims under "Member <id> — N claims" headers
 * (Andy: approve case by case, patient by patient), with members that still
 * have open (undecided) claims sorted first. Resolves each claim's member
 * id from its own fields.json — the same fetch ClaimReviewCard already does
 * for its headline, sharing the same module-level cache in
 * mohamedReviewClient so this never doubles the number of VPS round trips.
 */
export function ClaimsByMember({
  runId,
  claims,
  approvals,
  approvalDegraded = false,
  canApprove,
}: {
  runId: string
  claims: ClaimTrace[]
  approvals: ApprovalsLookup
  approvalDegraded?: boolean
  canApprove: boolean
}) {
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

  const groups = groupClaimsByMember(claims, memberIds, ref => decisionOf(approvalFor(approvals, ref)))

  return (
    <div className="space-y-4">
      {groups.map(group => (
        <div key={group.memberId ?? group.claims[0].claimRef}>
          <h3 className="mb-1.5 text-xs font-semibold text-zinc-500">
            {group.memberId ? `Member ${group.memberId}` : 'Member (pending)'} — {group.claims.length} claim
            {group.claims.length === 1 ? '' : 's'}
          </h3>
          <div className="space-y-2">
            {group.claims.map(claim => (
              <ClaimReviewCard
                key={claim.claimRef}
                runId={runId}
                claim={claim}
                approval={approvalDegraded ? null : approvalFor(approvals, claim.claimRef)}
                approvalDegraded={approvalDegraded}
                canApprove={canApprove}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
