/** Visible warning (not a silent rewrite) whenever a draft has claims_requiring_review —
 * ported from marketing_content/components/compliance-banner.tsx. No publish action
 * exists anywhere in this port; this banner is the only compliance UI needed for MVP. */
export function ComplianceBanner({ claims }: { claims: string[] }) {
  if (claims.length === 0) return null
  return (
    <div className="rounded-lg border border-amber-500/60 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
      <p className="font-semibold">Claims requiring review before publishing:</p>
      <ul className="mt-1 list-disc pl-5">
        {claims.map((claim, i) => (
          <li key={i}>{claim}</li>
        ))}
      </ul>
    </div>
  )
}
