'use client'

import { useEffect, useState } from 'react'
import type { ClaimTrace } from '@/lib/mohamedLedger'
import {
  extractDateRange,
  extractMemberId,
  formatReviewDate,
  getReviewFields,
  getReviewScreenshotUrl,
  getClaimSteps,
  serviceLineNumber,
  stepDisplayLabel,
  type ClaimDateRange,
  type ReviewField,
  type StepIndexEntry,
} from '@/lib/mohamedReviewClient'

function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

/** HCPF's own status word (lowercased at the source, see mohamedLedger.ts)
 * as a colored pill. Falls back to neutral for any word not seen live yet
 * so a new one never renders unreadable. */
function hcpfStatusPillClasses(status: string): string {
  if (status === 'paid') return 'bg-emerald-600 text-white'
  if (status === 'denied') return 'bg-red-600 text-white'
  if (status === 'suspended') return 'bg-amber-500 text-white'
  return 'bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100'
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

type ReviewState = 'idle' | 'loading' | 'missing' | 'error' | 'ready'

/**
 * One claim, one card: what it is, whether HCPF took it and what it paid,
 * and (expanded) the step-by-step field list + screenshot as entered.
 *
 * Headlined by Member ID (fetched from the per-claim fields.json on the
 * VPS at mount) because that is how Mohamed identifies claims. The member
 * id never touches the Supabase ledger, console logs, or analytics; this
 * surface is already authenticated and shows full PHI screenshots on
 * expand.
 *
 * Andy, 2026-09-05: approve/reject removed ("The approved reject function
 * can go"); the right-hand pill is now HCPF's own status for a submitted
 * claim, and the numbers on the left follow the selected step so they
 * always match the screenshot ("the number shown on the left needs to
 * always match the input numbers in the screenshot").
 */
export function ClaimReviewCard({ runId, claim, submitted }: { runId: string; claim: ClaimTrace; submitted: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [state, setState] = useState<ReviewState>('idle')
  const [fields, setFields] = useState<ReviewField[]>([])
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [memberId, setMemberId] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<ClaimDateRange>(null)
  const [steps, setSteps] = useState<StepIndexEntry[] | null>(null)
  const [selectedStep, setSelectedStep] = useState(0)

  // Fetch fields.json at mount purely for the member-id and date-range
  // headline. Best effort: any failure just leaves the procedure-code
  // headline in place -- the card must never block on this.
  useEffect(() => {
    let cancelled = false
    getReviewFields(runId, claim.claimRef, '')
      .then(loaded => {
        if (cancelled) return
        const id = extractMemberId(loaded)
        if (id) setMemberId(id)
        const range = extractDateRange(loaded)
        if (range) setDateRange(range)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [runId, claim.claimRef])

  useEffect(() => {
    if (!expanded || !steps || steps.length < 2) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') selectStep(selectedStep + 1)
      if (event.key === 'ArrowLeft') selectStep(selectedStep - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, steps, selectedStep])

  async function loadStep(list: StepIndexEntry[], index: number) {
    const entry = list[index]
    const [loadedFields, shotUrl] = await Promise.all([
      getReviewFields(runId, claim.claimRef, entry.path),
      entry.has_screenshot ? getReviewScreenshotUrl(runId, claim.claimRef, entry.path) : Promise.resolve(null),
    ])
    setFields(loadedFields ?? [])
    setScreenshotUrl(shotUrl)
  }

  function selectStep(index: number) {
    if (!steps || index < 0 || index >= steps.length || index === selectedStep) return
    setSelectedStep(index)
    loadStep(steps, index).catch(() => setState('error'))
  }

  async function load() {
    if (state === 'ready' || state === 'loading') return
    setState('loading')
    try {
      const stepList = await getClaimSteps(runId, claim.claimRef)
      if (stepList) {
        setSteps(stepList)
        setSelectedStep(0)
        await loadStep(stepList, 0)
        setState('ready')
        return
      }
      setSteps(null)
      const loaded = await getReviewFields(runId, claim.claimRef, '')
      if (loaded === null) {
        setState('missing')
        return
      }
      setFields(loaded)
      setScreenshotUrl(await getReviewScreenshotUrl(runId, claim.claimRef, ''))
      setState('ready')
    } catch {
      setState('error')
    }
  }

  function toggle() {
    const next = !expanded
    setExpanded(next)
    if (next) void load()
  }

  // The numbers on the left follow the screenshot on the right: on a
  // service-line step show THAT line's units/charge/code; everywhere else
  // (collapsed, member info, review, submitted) show the claim's totals.
  const lineNo = expanded && steps ? serviceLineNumber(steps[selectedStep]?.label ?? '') : null
  const line = lineNo !== null ? (claim.lines[lineNo - 1] ?? null) : null
  const shownUnits = line ? line.unitsX100 : claim.unitsX100
  const shownCharge = line ? line.chargeCents : claim.chargeCents
  const shownCode = line ? line.procedureCode : claim.procedureCode
  const shownMods = line ? line.modifiers : claim.modifiers
  const unitsLabel = shownUnits != null ? `${(shownUnits / 100).toFixed(2)} units` : null
  const amountLabel = shownCharge != null ? money(shownCharge) : null
  const multiLine = claim.lines.length > 1

  const flagged = claim.hcpfStatus === 'denied' || claim.validation?.status === 'mismatch' || claim.validation?.status === 'not_found'
  const paidVsClaimed =
    submitted && claim.paidCents !== null && claim.chargeCents !== null ? (
      <span className={`text-[11px] font-medium tabular-nums ${claim.paidCents < claim.chargeCents ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
        {money(claim.paidCents)} paid of {money(claim.chargeCents)}
      </span>
    ) : null

  return (
    <div className={`overflow-hidden rounded-xl border bg-white dark:bg-zinc-900 ${flagged ? 'border-red-300 dark:border-red-500/40' : 'border-zinc-200 dark:border-zinc-800'}`}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${claim.reachedReview ? 'bg-emerald-500' : claim.alreadySubmitted ? 'bg-zinc-400' : 'bg-red-500'}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {memberId ? `Member ${memberId}` : claim.procedureCode ? claim.procedureCode.toUpperCase() : 'Claim'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {dateRange && (
                <span className="inline-flex items-center rounded-md bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset">
                  {formatReviewDate(dateRange.from)} – {formatReviewDate(dateRange.to)}
                </span>
              )}
              {shownCode && (
                <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30 px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset">
                  {shownCode.toUpperCase()}
                  {shownMods && shownMods !== 'none' && (
                    <span className="font-normal text-violet-500 dark:text-violet-400">{shownMods.replaceAll('_', ', ').toUpperCase()}</span>
                  )}
                </span>
              )}
              {(unitsLabel || amountLabel) && (
                <span className="text-[11px] text-zinc-500">
                  {line ? `Line ${lineNo}: ` : multiLine ? `${claim.lines.length} lines · ` : ''}
                  {[unitsLabel, amountLabel].filter(Boolean).join(' · ')}
                </span>
              )}
              {paidVsClaimed}
              {!claim.reachedReview && !claim.alreadySubmitted && <span className="text-[11px] font-medium text-red-600 dark:text-red-400">did not reach review</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          {claim.alreadySubmitted ? (
            <span title="Skipped: an earlier run already submitted this exact claim, so it was not sent twice" className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">Already billed by an earlier run</span>
          ) : submitted ? (
            claim.hcpfStatus ? (
              <span
                title={claim.hcpfClaimId ? `HCPF Claim ID ${claim.hcpfClaimId}` : undefined}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${hcpfStatusPillClasses(claim.hcpfStatus)}`}
              >
                {capitalize(claim.hcpfStatus)}
                {claim.validation?.status === 'mismatch' && <span title="HCPF's own record now disagrees with the receipt">⚠</span>}
                {claim.validation?.status === 'not_found' && <span title="Not found in a later HCPF Search Claims check">⚠</span>}
              </span>
            ) : (
              <span className="rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-2.5 py-1 text-[11px] font-semibold">Submitted · awaiting HCPF</span>
            )
          ) : claim.validation?.status === 'not_found' ? (
            <span title="A later check of HCPF's own records found no such claim: the submit never landed" className="rounded-full bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300 px-2.5 py-1 text-[11px] font-semibold">Never reached HCPF</span>
          ) : (
            <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-500">{claim.reachedReview ? 'Test · not submitted' : 'Not submitted'}</span>
          )}
          <span className="text-xs text-zinc-400 dark:text-zinc-500">{expanded ? 'Hide' : 'Open'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-4">
          {claim.hcpfClaimId && (
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2 text-xs">
              <span><span className="text-zinc-500">HCPF Claim ID </span><span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">{claim.hcpfClaimId}</span></span>
              {claim.hcpfStatus && <span><span className="text-zinc-500">Status </span><span className="font-semibold">{capitalize(claim.hcpfStatus)}</span></span>}
              {claim.chargeCents !== null && <span><span className="text-zinc-500">Claimed </span><span className="font-semibold tabular-nums">{money(claim.chargeCents)}</span></span>}
              {claim.paidCents !== null && (
                <span>
                  <span className="text-zinc-500">Paid </span>
                  <span className={`font-semibold tabular-nums ${claim.chargeCents !== null && claim.paidCents < claim.chargeCents ? 'text-amber-700 dark:text-amber-400' : ''}`}>{money(claim.paidCents)}</span>
                  {claim.chargeCents !== null && claim.paidCents < claim.chargeCents && (
                    <span className="ml-1 text-zinc-500">({money(claim.chargeCents - claim.paidCents)} under — HCPF's rate)</span>
                  )}
                </span>
              )}
              <span className="ml-auto text-[11px]">
                {claim.validation?.status === 'match' && <span className="font-medium text-emerald-700 dark:text-emerald-400">✓ Checked against HCPF&apos;s own records</span>}
                {claim.validation?.status === 'mismatch' && <span className="font-medium text-amber-700 dark:text-amber-400">⚠ HCPF now shows {claim.validation.hcpfStatus ? capitalize(claim.validation.hcpfStatus) : 'a different status'}</span>}
                {claim.validation?.status === 'not_found' && <span className="font-medium text-red-700 dark:text-red-400">⚠ Not found in HCPF Search Claims</span>}
                {claim.validation?.status === 'error' && <span className="text-zinc-500">Re-check couldn&apos;t run — not a billing problem</span>}
                {!claim.validation && <span className="text-zinc-500">Not re-checked yet</span>}
              </span>
            </div>
          )}

          {steps && steps.length > 1 && (
            <>
              <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
                {steps.map((step, index) => (
                  <button
                    key={step.label}
                    type="button"
                    onClick={() => selectStep(index)}
                    className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                      index === selectedStep
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    {index + 1}. {stepDisplayLabel(step.label)}
                  </button>
                ))}
              </div>
              <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
                <button type="button" disabled={selectedStep === 0} onClick={() => selectStep(selectedStep - 1)} className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline disabled:pointer-events-none disabled:text-zinc-300 dark:disabled:text-zinc-600">
                  ← Prev
                </button>
                <span>{stepDisplayLabel(steps[selectedStep].label)}</span>
                <button type="button" disabled={selectedStep === steps.length - 1} onClick={() => selectStep(selectedStep + 1)} className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline disabled:pointer-events-none disabled:text-zinc-300 dark:disabled:text-zinc-600">
                  Next →
                </button>
              </div>
            </>
          )}
          {state === 'loading' && <p className="text-sm text-zinc-500">Loading…</p>}
          {state === 'missing' && (
            <p className="text-sm text-zinc-500">
              {claim.alreadySubmitted ? 'No capture in this run — it was skipped because an earlier run had already submitted it. Open that run to see it.' : 'No capture exists for this claim yet.'}
            </p>
          )}
          {state === 'error' && <p className="text-sm text-red-700 dark:text-red-400">Could not load the capture. Try again.</p>}
          {state === 'ready' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-500">Fields as entered on HCPF</p>
                <dl className="max-h-96 space-y-1 overflow-y-auto text-xs">
                  {fields.map((field, index) => (
                    <div key={index} className="flex justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 py-1">
                      <dt className="text-zinc-500">{field.label}</dt>
                      <dd className="text-right font-medium">{field.value}</dd>
                    </div>
                  ))}
                  {fields.length === 0 && <p className="text-zinc-400 dark:text-zinc-500">No fields captured.</p>}
                </dl>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-500">Screenshot</p>
                {!claim.reachedReview && (
                  <p className="mb-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-2.5 py-2 text-[11px] text-zinc-500">
                    This is what the portal showed when the session ended mid-claim — not a form completion.
                  </p>
                )}
                {screenshotUrl ? (
                  <img src={screenshotUrl} alt={claim.reachedReview ? 'HCPF claim form screenshot' : 'HCPF portal screen when the session ended'} className="rounded-lg border border-zinc-200 dark:border-zinc-800" />
                ) : (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">No screenshot captured.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
