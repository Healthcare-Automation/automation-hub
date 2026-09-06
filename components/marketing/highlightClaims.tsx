import type { ReactNode } from 'react'

/** claimsNeedingCitation (lib/marketing/contentGenerator.ts) embeds the exact flagged
 * text in quotes — `Evidence statement is asserted without a linkable citation: "..."`.
 * LLM-produced claims may not follow that convention, so this is best-effort: any claim
 * with a quoted span found verbatim in the draft gets highlighted inline; claims that
 * don't match still show in the ComplianceBanner list, just without inline marking. */
function extractQuotedSpan(claim: string): string | null {
  const match = claim.match(/"([^"]{4,})"/)
  return match ? match[1] : null
}

export function highlightClaims(text: string, claims: string[]): ReactNode[] {
  const spans = claims.map(extractQuotedSpan).filter((s): s is string => Boolean(s) && text.includes(s!))
  if (spans.length === 0) return [text]

  // Build one regex that matches any flagged span, longest first so overlapping spans
  // don't get double-split.
  const sorted = [...new Set(spans)].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`(${sorted.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')

  const parts = text.split(pattern)
  return parts.map((part, i) =>
    sorted.includes(part) ? (
      <mark key={i} className="rounded bg-amber-200/70 px-0.5 text-amber-950 dark:bg-amber-500/30 dark:text-amber-100">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}
