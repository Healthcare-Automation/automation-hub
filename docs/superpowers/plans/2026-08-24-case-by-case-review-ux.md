# Case-by-Case Claim Review UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Andy approve claims case-by-case, patient-by-patient: claims grouped under member-ID headers, a per-claim step strip showing every HCPF wizard step (CSV → typed value → screenshot) like flipping through photos, and collapsible per-run history with the newest run open by default.

**Architecture:** A new shared client module (`lib/mohamedReviewClient.ts`) centralizes the review-token mint + VPS fetch pattern that `ClaimReviewCard.tsx` already has inline, generalized to accept a `path` segment so it can fetch either the existing top-level artifacts (`path=""`) or the new per-step artifacts (`path="steps/<label>"`) served by the VPS (mohamed repo, already extended — see that repo's `2026-08-24-hcpf-step-captures.md` plan). A new pure module (`lib/mohamedClaimGrouping.ts`) holds the member-grouping/sort logic so it's unit-testable without rendering React. `ClaimReviewCard` gains a step strip; a new `ClaimsByMember` wrapper groups cards under member headers and replaces the flat claim list in both `MohamedDashboard` and `RunDetailPanel`. `RunHistory` is rewritten from a `<table>` to a list of native `<details>` rows, newest open by default, each showing a dense claim list fetched lazily via the existing `/api/mohamed/run/[runId]` route.

**Tech Stack:** Next.js (App Router), React (client components), TypeScript, Tailwind. Tests via `node --test` + `react-dom/server`'s `renderToStaticMarkup` (no jsdom/RTL in this repo — see Global Constraints).

**Spec:** Part B of Andy's case-by-case review UX spec (see conversation — no separate spec file exists; this plan is the spec's authoritative breakdown for this repo). Depends on the mohamed repo's `docs/superpowers/plans/2026-08-24-hcpf-step-captures.md` for the VPS-side `steps/index.json` + `steps/<NN-label>/(fields.json|screenshot.png)` contract this plan's step viewer consumes — that repo's Task 6 (`upload_server.py`) must ship first, but this plan does not require it to be deployed to build/typecheck/test cleanly (the hub only ever fetches; a 404 from a not-yet-deployed VPS falls back to the legacy single-screenshot view, per Task 2 below).

## Global Constraints

- No member names/IDs in logs, commits, or code comments — the member ID may only ever appear in already-authenticated claim-review UI at runtime, fetched from the VPS's `fields.json`, exactly as `ClaimReviewCard` already does today.
- `RunLedgerSnapshot`/`RunEvent`/`ClaimTrace` (`lib/mohamedLedger.ts`) must stay PHI-free by construction — nothing added by this plan writes into those types.
- Every task ends with `npm run typecheck && npm test && npm run build` green before merge; one branch/PR per task is NOT required here (unlike the mohamed repo) — the user's stated workflow is one PR for this whole repo's slice of work, so tasks are commits on one branch, not separate PRs. Run the three commands after every task anyway, so a regression is caught immediately, not at the end.
- Consult the relevant guide under `node_modules/next/dist/docs/` before writing framework code that touches routing/rendering — this repo runs a non-standard Next.js version (see `AGENTS.md`).
- This repo's tests are `node --test` files matched by `tests/*.test.ts` (note: `.ts`, not `.tsx`) using `renderToStaticMarkup` for structural component checks — there is no jsdom/Testing-Library, so nothing here can test `useEffect`-driven fetches, clicks, or keyboard handlers directly. Real logic (grouping, sorting, label formatting, path building) must be pure and exported from a `.ts` module so it's testable; components stay thin wiring layers, matching how `mohamedLedger.ts`'s pure functions are already tested separately from `MohamedDashboard`'s rendering.
- Keep the existing zinc/emerald visual language and Tailwind utility-class style used throughout `components/mohamed/*`.

---

## File Structure

- `lib/mohamedReviewClient.ts` (**new**) — the review-token mint, a generic artifact fetch (`getReviewFields`, `getReviewScreenshotUrl`) parametrized by a `path` segment, `getClaimSteps` (fetches `steps/index.json`), `extractMemberId`, `stepDisplayLabel`. Single source of truth for "how the hub talks to the VPS review endpoint," replacing the copy that currently lives inside `ClaimReviewCard.tsx`.
- `lib/mohamedClaimGrouping.ts` (**new**) — pure `groupClaimsByMember(claims, memberIds, decisionFor)` and `isClaimOpen(decision)`, unit-tested directly.
- `components/mohamed/ClaimReviewCard.tsx` (**modify**) — imports from `mohamedReviewClient` instead of defining its own token/fetch/cache logic; gains the step strip, prev/next, and arrow-key navigation.
- `components/mohamed/ClaimsByMember.tsx` (**new**) — resolves member IDs for a list of claims, groups via `mohamedClaimGrouping`, renders member headers + `ClaimReviewCard`s.
- `components/mohamed/MohamedDashboard.tsx` (**modify**) — replaces its flat `reviewable.map(...)` with `<ClaimsByMember .../>`.
- `components/mohamed/RunDetailPanel.tsx` (**modify**) — same replacement for its reviewable-claims list.
- `components/mohamed/RunHistory.tsx` (**modify**) — rewritten from `<table>` to `<details>` rows.
- Tests: `tests/mohamed-review-client.test.ts` (**new**), `tests/mohamed-claim-grouping.test.ts` (**new**), `tests/mohamed-dashboard.test.ts` (**extend**), `tests/mohamed-run-history.test.ts` (**new**).

---

## Task 1: `lib/mohamedReviewClient.ts` — shared token/fetch module

**Files:**
- Create: `lib/mohamedReviewClient.ts`
- Test: `tests/mohamed-review-client.test.ts`

**Interfaces:**
- Produces: `type ReviewField = { label: string; value: string }`; `type StepIndexEntry = { label: string; order: number; path: string; has_fields: boolean; has_screenshot: boolean }`; `getReviewToken(): Promise<{ token: string; uploadUrl: string }>`; `getReviewFields(runId: string, claimRef: string, path?: string): Promise<ReviewField[] | null>`; `getReviewScreenshotUrl(runId: string, claimRef: string, path?: string): Promise<string | null>`; `getClaimSteps(runId: string, claimRef: string): Promise<StepIndexEntry[] | null>`; `extractMemberId(fields: ReviewField[] | null): string | null`; `stepDisplayLabel(label: string): string`.
- Consumes: nothing new — same `/api/mohamed/review-token` POST route and VPS `/review/...` GET routes that already exist (the VPS's new `steps/index.json` and `steps/<label>/...` routes come from the mohamed repo's own plan; `getClaimSteps` fetching a not-yet-deployed route simply gets a network error today, which `getClaimSteps` turns into a caught rejection — callers treat that the same as a 404).

- [ ] **Step 1: Write the failing tests**

Create `tests/mohamed-review-client.test.ts`:

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractMemberId, stepDisplayLabel, type ReviewField } from '../lib/mohamedReviewClient'

test('extractMemberId finds the first field whose label looks like a member id', () => {
  const fields: ReviewField[] = [
    { label: 'Total Charged', value: '10.00' },
    { label: 'Member ID', value: 'F736896' },
  ]
  assert.equal(extractMemberId(fields), 'F736896')
})

test('extractMemberId is case- and separator-insensitive', () => {
  assert.equal(extractMemberId([{ label: 'member_id', value: 'A1' }]), 'A1')
  assert.equal(extractMemberId([{ label: 'MemberId', value: 'A2' }]), 'A2')
})

test('extractMemberId returns null when there is no matching field or fields is null', () => {
  assert.equal(extractMemberId([{ label: 'Total Charged', value: '10.00' }]), null)
  assert.equal(extractMemberId(null), null)
  assert.equal(extractMemberId([]), null)
})

test('stepDisplayLabel maps the fixed wizard-step vocabulary to plain names', () => {
  assert.equal(stepDisplayLabel('01-member-info'), 'Member info')
  assert.equal(stepDisplayLabel('02-diagnosis'), 'Diagnosis')
  assert.equal(stepDisplayLabel('03-service-line-1'), 'Service line 1')
  assert.equal(stepDisplayLabel('03-service-line-12'), 'Service line 12')
  assert.equal(stepDisplayLabel('99-review'), 'Review')
  assert.equal(stepDisplayLabel('99-failure'), 'Failure')
})

test('stepDisplayLabel falls back to the raw label for anything unrecognised', () => {
  assert.equal(stepDisplayLabel('07-mystery'), '07-mystery')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/mohamed-review-client.test.ts` (or `node --test --experimental-test-module-mocks --import tsx tests/mohamed-review-client.test.ts`, matching the `test` script in `package.json`)
Expected: FAIL — `lib/mohamedReviewClient.ts` does not exist yet (module not found).

- [ ] **Step 3: Implement**

Create `lib/mohamedReviewClient.ts`:

```ts
/**
 * Shared client-side helper for fetching per-claim review artifacts
 * (fields.json / screenshot.png) from the VPS review endpoint, and — new —
 * a claim's steps/index.json manifest for the per-step viewer.
 *
 * One review token is minted per page render and shared across every
 * caller: runs have a handful of claims, each with a handful of steps, and
 * this avoids a token round trip per artifact. Cleared on failure so a
 * retry (e.g. expanding a card) can mint a fresh one.
 */

export type ReviewField = { label: string; value: string }

export type StepIndexEntry = {
  label: string
  order: number
  /** "" = the claim's existing top-level fields.json/screenshot.png; otherwise "steps/<label>". */
  path: string
  has_fields: boolean
  has_screenshot: boolean
}

let tokenPromise: Promise<{ token: string; uploadUrl: string }> | null = null

export function getReviewToken(): Promise<{ token: string; uploadUrl: string }> {
  if (!tokenPromise) {
    tokenPromise = (async () => {
      const res = await fetch('/api/mohamed/review-token', { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.ok || !json.uploadUrl) throw new Error('token_unavailable')
      return { token: json.token as string, uploadUrl: json.uploadUrl as string }
    })()
    tokenPromise.catch(() => {
      tokenPromise = null
    })
  }
  return tokenPromise
}

function artifactUrl(uploadUrl: string, runId: string, claimRef: string, path: string, artifact: string): string {
  const prefix = path ? `${path}/` : ''
  return `${uploadUrl}/review/${runId}/${claimRef}/${prefix}${artifact}`
}

// fields.json per (claim, step-path), cached so repeated selections of the
// same step or repeated mounts share one fetch. null = artifact missing (404).
const fieldsCache = new Map<string, Promise<ReviewField[] | null>>()

export function getReviewFields(runId: string, claimRef: string, path = ''): Promise<ReviewField[] | null> {
  const key = `${runId}/${claimRef}/${path}`
  let cached = fieldsCache.get(key)
  if (!cached) {
    cached = (async () => {
      const { token, uploadUrl } = await getReviewToken()
      const res = await fetch(artifactUrl(uploadUrl, runId, claimRef, path, 'fields.json'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 404) return null
      if (!res.ok) throw new Error('fields_unavailable')
      const payload = await res.json()
      return Array.isArray(payload.fields) ? (payload.fields as ReviewField[]) : []
    })()
    cached.catch(() => {
      fieldsCache.delete(key)
    })
    fieldsCache.set(key, cached)
  }
  return cached
}

/** Returns an object URL for the screenshot, or null if it's missing/unavailable. Never throws. */
export async function getReviewScreenshotUrl(runId: string, claimRef: string, path = ''): Promise<string | null> {
  try {
    const { token, uploadUrl } = await getReviewToken()
    const res = await fetch(artifactUrl(uploadUrl, runId, claimRef, path, 'screenshot.png'), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

const stepsCache = new Map<string, Promise<StepIndexEntry[] | null>>()

/** Fetches a claim's steps/index.json. Returns null when the claim has no
 * step captures (older runs, or a claim that failed before any step
 * captured) -- callers fall back to the legacy single-screenshot view. */
export function getClaimSteps(runId: string, claimRef: string): Promise<StepIndexEntry[] | null> {
  const key = `${runId}/${claimRef}`
  let cached = stepsCache.get(key)
  if (!cached) {
    cached = (async () => {
      try {
        const { token, uploadUrl } = await getReviewToken()
        const res = await fetch(`${uploadUrl}/review/${runId}/${claimRef}/steps/index.json`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return null
        const payload = await res.json()
        return Array.isArray(payload.steps) && payload.steps.length > 0 ? (payload.steps as StepIndexEntry[]) : null
      } catch {
        return null
      }
    })()
    stepsCache.set(key, cached)
  }
  return cached
}

const MEMBER_ID_LABEL = /member.?id/i

/** The member id is how Mohamed identifies claims -- pulled from whichever
 * field's label looks like "Member ID" in the captured field list. */
export function extractMemberId(fields: ReviewField[] | null): string | null {
  if (!fields) return null
  const field = fields.find(f => MEMBER_ID_LABEL.test(f.label))
  return field?.value ?? null
}

const SERVICE_LINE_LABEL = /^03-service-line-(\d+)$/

const STEP_DISPLAY_NAMES: Record<string, string> = {
  '01-member-info': 'Member info',
  '02-diagnosis': 'Diagnosis',
  '99-review': 'Review',
  '99-failure': 'Failure',
}

/** Maps a wizard step label (see the mohamed repo's live_hcpf.py) to a
 * plain name for the step strip. Falls back to the raw label for anything
 * outside the fixed vocabulary so a future step never renders as blank. */
export function stepDisplayLabel(label: string): string {
  if (STEP_DISPLAY_NAMES[label]) return STEP_DISPLAY_NAMES[label]
  const serviceLine = SERVICE_LINE_LABEL.exec(label)
  if (serviceLine) return `Service line ${serviceLine[1]}`
  return label
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test --experimental-test-module-mocks --import tsx tests/mohamed-review-client.test.ts`
Expected: all PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/mohamedReviewClient.ts tests/mohamed-review-client.test.ts
git commit -m "feat(mohamed): add shared review-artifact client with per-step fetch support"
```

---

## Task 2: `ClaimReviewCard.tsx` — step strip, prev/next, arrow keys

**Files:**
- Modify: `components/mohamed/ClaimReviewCard.tsx`
- Test: `tests/mohamed-dashboard.test.ts` (extend — this file already renders `MohamedDashboard`, which renders `ClaimReviewCard`; add assertions there rather than creating a parallel render harness)

**Interfaces:**
- Consumes: `getReviewToken`, `getReviewFields`, `getReviewScreenshotUrl`, `getClaimSteps`, `extractMemberId`, `stepDisplayLabel`, `type ReviewField`, `type StepIndexEntry` from Task 1's `lib/mohamedReviewClient.ts`.
- Produces: same exported `ClaimReviewCard` props as today (unchanged) — this task only changes the component's internals and rendered output, not its public interface, so `MohamedDashboard.tsx`/`RunDetailPanel.tsx` need no changes yet (Task 3 changes how they're invoked, for grouping — independent of this task).

- [ ] **Step 1: Write the failing test**

Add to `tests/mohamed-dashboard.test.ts` (append near the end; keep the existing `import` lines, they already cover what's needed — `renderToStaticMarkup`, `MohamedDashboard`, `demoLedger`):

```ts
test('a claim card with no step captures shows no step strip (falls back to the legacy single screenshot view)', () => {
  // renderToStaticMarkup never runs useEffect, so no fetch happens and the
  // card renders its collapsed, pre-fetch state -- this test locks in that
  // the collapsed state itself never renders step-strip markup up front,
  // which would be a hydration mismatch waiting to happen.
  const html = renderToStaticMarkup(
    createElement(MohamedDashboard, { isAdmin: true, canApprove: true, ledger, ledgerSource: 'live' }),
  )
  assert.doesNotMatch(html, /Service line 1/)
})
```

- [ ] **Step 2: Run the test to verify it currently passes (sanity check), then implement, then re-verify**

Run: `node --test --experimental-test-module-mocks --import tsx tests/mohamed-dashboard.test.ts`
Expected: PASSES even before the implementation change (the component doesn't render step-strip text either way pre-effect) — this is a regression guard, not a red/green driver for this particular assertion. The real red/green signal for this task is the typecheck in Step 4: the file won't compile once it references the new imports until they're wired correctly.

- [ ] **Step 3: Implement**

In `components/mohamed/ClaimReviewCard.tsx`:

1. Delete the module-level `getReviewToken`, `tokenPromise`, `fieldsCache`, `getClaimFields`, and `MEMBER_ID_LABEL` (lines 16–63 of the current file) — replace the import line at the top with:

```ts
import { useEffect, useState } from 'react'
import type { ClaimTrace } from '@/lib/mohamedLedger'
import type { ClaimApproval } from '@/lib/mohamedApprovals'
import {
  extractMemberId,
  getReviewFields,
  getReviewScreenshotUrl,
  getClaimSteps,
  stepDisplayLabel,
  type ReviewField,
  type StepIndexEntry,
} from '@/lib/mohamedReviewClient'

function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

type ReviewState = 'idle' | 'loading' | 'missing' | 'error' | 'ready'
type Decision = 'approved' | 'rejected' | null
```

2. Inside the component, replace the member-id mount effect (previously calling `getClaimFields`) with:

```ts
  const [steps, setSteps] = useState<StepIndexEntry[] | null>(null)
  const [selectedStep, setSelectedStep] = useState(0)

  // Fetch fields.json at mount purely for the member-id headline. Best
  // effort: any failure just leaves the procedure-code headline in place —
  // the card must never block on this. The top-level fields.json always
  // exists once a claim reaches review or fails-with-capture, whether or
  // not it also has step captures (see review_capture.capture_review).
  useEffect(() => {
    let cancelled = false
    getReviewFields(runId, claim.claimRef, '')
      .then(loaded => {
        if (cancelled) return
        const id = extractMemberId(loaded)
        if (id) setMemberId(id)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [runId, claim.claimRef])
```

(`memberId`'s `useState` declaration stays where it already is, a few lines above — only the effect body changes.)

3. Replace `load()` with a step-aware version, and add `loadStep`/`selectStep`:

```ts
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
```

Remove the old `load()` (the block this replaces, currently calling `getClaimFields` then fetching the screenshot inline) entirely — `loadStep`/`selectStep`/the new `load()` fully replace it.

4. Add arrow-key navigation, right after the existing Escape-key-style pattern doesn't exist in this file yet, so add a fresh effect near the top of the component body (after the existing `useEffect` for the member-id fetch):

```ts
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
```

5. In the JSX, immediately inside `{expanded && (...)}`'s wrapping `<div className="border-t border-zinc-200 px-4 py-4">`, before the existing `{state === 'loading' && ...}` block, add the step strip (only when there's more than one step — a single-step claim doesn't need a strip, same information as today):

```tsx
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
                        : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    {index + 1}. {stepDisplayLabel(step.label)}
                  </button>
                ))}
              </div>
              <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
                <button
                  type="button"
                  disabled={selectedStep === 0}
                  onClick={() => selectStep(selectedStep - 1)}
                  className="font-medium text-emerald-700 hover:underline disabled:pointer-events-none disabled:text-zinc-300"
                >
                  ← Prev
                </button>
                <span>{stepDisplayLabel(steps[selectedStep].label)}</span>
                <button
                  type="button"
                  disabled={selectedStep === steps.length - 1}
                  onClick={() => selectStep(selectedStep + 1)}
                  className="font-medium text-emerald-700 hover:underline disabled:pointer-events-none disabled:text-zinc-300"
                >
                  Next →
                </button>
              </div>
            </>
          )}
```

The existing `{state === 'ready' && (<div className="grid gap-4 sm:grid-cols-2">...)}` block (the side-by-side fields+screenshot layout) stays completely unchanged — it already renders from `fields`/`screenshotUrl` state, which `loadStep`/`load` now populate per-step instead of once.

- [ ] **Step 4: Typecheck and test**

Run: `npm run typecheck`
Expected: no errors — this is the real signal that the new imports/types line up (`StepIndexEntry`, `ReviewField`, function signatures).

Run: `node --test --experimental-test-module-mocks --import tsx tests/mohamed-dashboard.test.ts`
Expected: all PASS, including every pre-existing test in the file (they render `MohamedDashboard`/`ClaimReviewCard` synchronously and assert on collapsed-state markup, which this task doesn't change) and the new one from Step 1.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Manual browser verification**

Run: `npm run dev`, open `/mohamed` (or `/mohamed?run=<a-run-id>` for a run with real step captures once the mohamed repo's Part A is deployed), expand a claim card. Verify: with step captures present, the strip renders, clicking a chip swaps the fields+screenshot pane, Prev/Next buttons work and disable at the ends, left/right arrow keys move between steps while the card is expanded, and the chip row scrolls horizontally on a narrow viewport instead of wrapping. With NO step captures (an older run, or before Part A is deployed), verify the card still shows the single legacy screenshot exactly as it does today — no broken UI, no console errors. This is a UI change; do not report this task complete without having done this.

- [ ] **Step 7: Commit**

```bash
git add components/mohamed/ClaimReviewCard.tsx tests/mohamed-dashboard.test.ts
git commit -m "feat(mohamed): add per-step viewer to ClaimReviewCard with prev/next and arrow keys"
```

---

## Task 3: `lib/mohamedClaimGrouping.ts` + `ClaimsByMember.tsx` — group by patient

**Files:**
- Create: `lib/mohamedClaimGrouping.ts`
- Create: `components/mohamed/ClaimsByMember.tsx`
- Modify: `components/mohamed/MohamedDashboard.tsx`
- Modify: `components/mohamed/RunDetailPanel.tsx`
- Test: `tests/mohamed-claim-grouping.test.ts` (new), `tests/mohamed-dashboard.test.ts` (extend)

**Interfaces:**
- Produces (`mohamedClaimGrouping.ts`): `type ClaimGroup = { memberId: string | null; claims: ClaimTrace[] }`; `isClaimOpen(decision: 'approved' | 'rejected' | null | undefined): boolean`; `groupClaimsByMember(claims: ClaimTrace[], memberIds: Record<string, string | null | undefined>, decisionFor: (claimRef: string) => 'approved' | 'rejected' | null | undefined): ClaimGroup[]`.
- Produces (`ClaimsByMember.tsx`): `ClaimsByMember({ runId, claims, approvals, approvalDegraded, canApprove })` — same claim-list shape MohamedDashboard/RunDetailPanel already pass today (`ClaimTrace[]`), plus `approvals` accepting either a `Map<string, ClaimApproval>` (MohamedDashboard's shape) or `Record<string, ClaimApproval>` (RunDetailPanel's shape from its API response), so neither caller needs to normalize its data first.
- Consumes: `getReviewFields`, `extractMemberId` from Task 1.

- [ ] **Step 1: Write the failing tests for the pure grouping logic**

Create `tests/mohamed-claim-grouping.test.ts`:

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groupClaimsByMember, isClaimOpen, type ClaimGroup } from '../lib/mohamedClaimGrouping'
import type { ClaimTrace } from '../lib/mohamedLedger'

function claim(claimRef: string, overrides: Partial<ClaimTrace> = {}): ClaimTrace {
  return {
    claimRef,
    portalActions: 10,
    failedActions: 0,
    reachedReview: true,
    failureCode: null,
    failureField: null,
    procedureCode: 's5130',
    modifiers: null,
    unitsX100: 400,
    chargeCents: 10_000,
    ...overrides,
  }
}

test('isClaimOpen treats null/undefined/anything but approved-or-rejected as open', () => {
  assert.equal(isClaimOpen(null), true)
  assert.equal(isClaimOpen(undefined), true)
  assert.equal(isClaimOpen('approved'), false)
  assert.equal(isClaimOpen('rejected'), false)
})

test('groupClaimsByMember groups by resolved member id, preserving claim order within a group', () => {
  const claims = [claim('a1'), claim('a2'), claim('b1')]
  const memberIds = { a1: 'F736896', a2: 'F736896', b1: 'F999999' }
  const groups = groupClaimsByMember(claims, memberIds, () => null)

  const byMember = new Map(groups.map(g => [g.memberId, g]))
  assert.deepEqual(
    byMember.get('F736896')!.claims.map(c => c.claimRef),
    ['a1', 'a2'],
  )
  assert.deepEqual(
    byMember.get('F999999')!.claims.map(c => c.claimRef),
    ['b1'],
  )
})

test('groupClaimsByMember buckets claims with an unresolved member id separately per claim, not together', () => {
  const claims = [claim('a1'), claim('a2')]
  const groups = groupClaimsByMember(claims, {}, () => null)
  assert.equal(groups.length, 2) // not merged into one "unknown" bucket -- each pending claim is its own group
  assert.ok(groups.every(g => g.memberId === null))
})

test('groupClaimsByMember sorts groups with at least one open (undecided) claim before fully-decided groups', () => {
  const claims = [claim('done1'), claim('open1'), claim('done2')]
  const memberIds = { done1: 'M-DONE', open1: 'M-OPEN', done2: 'M-DONE2' }
  const decisionFor = (ref: string): 'approved' | 'rejected' | null =>
    ref === 'open1' ? null : 'approved'

  const groups = groupClaimsByMember(claims, memberIds, decisionFor)
  const order = groups.map(g => g.memberId)
  assert.equal(order[0], 'M-OPEN')
  // the two fully-decided groups keep their original relative order (stable sort)
  assert.deepEqual(order.slice(1), ['M-DONE', 'M-DONE2'])
})

test('groupClaimsByMember treats a group as open if ANY of its claims is open, not just the first', () => {
  const claims = [claim('a1'), claim('a2'), claim('solo')]
  const memberIds = { a1: 'M-A', a2: 'M-A', solo: 'M-SOLO' }
  const decisionFor = (ref: string): 'approved' | 'rejected' | null => (ref === 'a1' ? 'approved' : ref === 'a2' ? null : 'approved')

  const groups = groupClaimsByMember(claims, memberIds, decisionFor)
  assert.equal(groups[0].memberId, 'M-A') // a2 is still open, so M-A sorts first despite a1 being decided
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --experimental-test-module-mocks --import tsx tests/mohamed-claim-grouping.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mohamedClaimGrouping.ts`**

Create `lib/mohamedClaimGrouping.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test --experimental-test-module-mocks --import tsx tests/mohamed-claim-grouping.test.ts`
Expected: all PASS.

- [ ] **Step 5: Write the failing test for `ClaimsByMember`'s structural rendering**

Add to `tests/mohamed-dashboard.test.ts`:

```ts
test('claims needing review render under a member header, even before the member id has resolved', () => {
  // renderToStaticMarkup never runs effects, so memberId stays unresolved
  // (null) for every claim -- this locks in that the pending/fallback
  // header text renders instead of nothing.
  const html = renderToStaticMarkup(
    createElement(MohamedDashboard, { isAdmin: true, canApprove: true, ledger, ledgerSource: 'live' }),
  )
  assert.match(html, /Member \(pending\)|Member [A-Za-z0-9-]+/)
})
```

- [ ] **Step 6: Implement `ClaimsByMember.tsx`**

Create `components/mohamed/ClaimsByMember.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import type { ClaimTrace } from '@/lib/mohamedLedger'
import type { ClaimApproval } from '@/lib/mohamedApprovals'
import { extractMemberId, getReviewFields } from '@/lib/mohamedReviewClient'
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
      getReviewFields(runId, claim.claimRef, '')
        .then(fields => {
          if (cancelled) return
          setMemberIds(prev => ({ ...prev, [claim.claimRef]: extractMemberId(fields) }))
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
```

- [ ] **Step 7: Wire it into `MohamedDashboard.tsx`**

Replace the `data-section="claims"` section's reviewable-claims rendering. Change the import line:

```ts
import { ClaimReviewCard } from './ClaimReviewCard'
```

to:

```ts
import { ClaimsByMember } from './ClaimsByMember'
```

and replace:

```tsx
        {!ledger ? (
          <p className="text-xs text-amber-700">Reconnecting… refreshes automatically.</p>
        ) : reviewable.length > 0 ? (
          <div className="space-y-2">
            {reviewable.map(claim => (
              <ClaimReviewCard
                key={claim.claimRef}
                runId={ledger.run_id}
                claim={claim}
                approval={approvalsDegraded ? null : (approvals.get(claim.claimRef) ?? null)}
                approvalDegraded={approvalsDegraded}
                canApprove={canApprove}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">No claims reached review in this run.</p>
        )}
```

with:

```tsx
        {!ledger ? (
          <p className="text-xs text-amber-700">Reconnecting… refreshes automatically.</p>
        ) : reviewable.length > 0 ? (
          <ClaimsByMember
            runId={ledger.run_id}
            claims={reviewable}
            approvals={approvals}
            approvalDegraded={approvalsDegraded}
            canApprove={canApprove}
          />
        ) : (
          <p className="text-xs text-zinc-500">No claims reached review in this run.</p>
        )}
```

- [ ] **Step 8: Wire it into `RunDetailPanel.tsx`**

Change the import:

```ts
import { ClaimReviewCard } from './ClaimReviewCard'
```

to:

```ts
import { ClaimsByMember } from './ClaimsByMember'
```

and replace:

```tsx
                {reviewable.length > 0 && (
                  <div className="space-y-2">
                    {reviewable.map(claim => (
                      <ClaimReviewCard
                        key={claim.claimRef}
                        runId={ledger.run_id}
                        claim={claim}
                        approval={approvals[claim.claimRef] ?? null}
                        canApprove={canApprove}
                      />
                    ))}
                  </div>
                )}
```

with:

```tsx
                {reviewable.length > 0 && (
                  <ClaimsByMember runId={ledger.run_id} claims={reviewable} approvals={approvals} canApprove={canApprove} />
                )}
```

- [ ] **Step 9: Run the tests, typecheck, build**

Run: `node --test --experimental-test-module-mocks --import tsx tests/mohamed-claim-grouping.test.ts tests/mohamed-dashboard.test.ts`
Expected: all PASS.

Run: `npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 10: Manual browser verification**

Run: `npm run dev`, open `/mohamed` with a run that has 2+ claims for the same member and 2+ different members. Verify: claims stack under "Member <id> — N claims" headers, a member with any undecided claim sorts above fully-decided members, and the `RunDetailPanel` slide-over (click a run in history) shows the same grouping. Also verify no console errors and that approving/rejecting a claim still works exactly as before (this task changes rendering structure only, not the approve/reject flow).

- [ ] **Step 11: Commit**

```bash
git add lib/mohamedClaimGrouping.ts components/mohamed/ClaimsByMember.tsx components/mohamed/MohamedDashboard.tsx components/mohamed/RunDetailPanel.tsx tests/mohamed-claim-grouping.test.ts tests/mohamed-dashboard.test.ts
git commit -m "feat(mohamed): group claim review cards by member, open claims first"
```

---

## Task 4: `RunHistory.tsx` — collapsible per-run rows

**Files:**
- Modify: `components/mohamed/RunHistory.tsx`
- Test: `tests/mohamed-run-history.test.ts` (new)

**Interfaces:**
- Consumes: `summariseClaims` from `lib/mohamedLedger.ts` (already exists); the existing `/api/mohamed/run/[runId]` GET route (already exists, used today by `RunDetailPanel`).
- Produces: same exported `RunHistory` props as today (`history`, `selectedRunId`, `canApprove`, `degraded`) — unchanged, so `MohamedDashboard.tsx` needs no changes for this task.

- [ ] **Step 1: Write the failing tests**

Create `tests/mohamed-run-history.test.ts`:

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RunHistory } from '../components/mohamed/RunHistory'
import type { RunHistoryItem } from '../lib/mohamedQueries'

function run(overrides: Partial<RunHistoryItem> = {}): RunHistoryItem {
  return {
    runId: 'a'.repeat(32),
    mode: 'dry_run',
    source: 'synthetic_fixture',
    periodStart: '2026-08-14',
    periodEnd: '2026-08-20',
    startedAt: '2026-08-24T10:00:00.000Z',
    finishedAt: '2026-08-24T10:05:00.000Z',
    status: 'review_ready',
    eventCount: 42,
    ...overrides,
  }
}

test('history renders one collapsible row per run', () => {
  const history = [run({ runId: 'a'.repeat(32) }), run({ runId: 'b'.repeat(32) })]
  const html = renderToStaticMarkup(
    createElement(RunHistory, { history, selectedRunId: '' }),
  )
  assert.equal((html.match(/<details/g) ?? []).length, 2)
})

test('the newest run (first in the list) is open by default; the rest are closed', () => {
  const history = [run({ runId: 'a'.repeat(32) }), run({ runId: 'b'.repeat(32) })]
  const html = renderToStaticMarkup(
    createElement(RunHistory, { history, selectedRunId: '' }),
  )
  const [first, second] = html.split('<details').slice(1)
  assert.match(first, /^[^>]*\sopen(\s|>)/) // first <details ...> carries the open attribute
  assert.doesNotMatch(second, /^[^>]*\sopen(\s|>)/)
})

test('an empty history shows the empty state, not zero collapsible rows', () => {
  const html = renderToStaticMarkup(createElement(RunHistory, { history: [], selectedRunId: '' }))
  assert.match(html, /No runs yet/)
  assert.doesNotMatch(html, /<details/)
})

test('a degraded history shows the reconnecting message instead of any rows', () => {
  const html = renderToStaticMarkup(
    createElement(RunHistory, { history: [run()], selectedRunId: '', degraded: true }),
  )
  assert.match(html, /Reconnecting/)
  assert.doesNotMatch(html, /<details/)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --experimental-test-module-mocks --import tsx tests/mohamed-run-history.test.ts`
Expected: FAIL — current `RunHistory` renders a `<table>`, not `<details>`.

- [ ] **Step 3: Implement**

Replace the full contents of `components/mohamed/RunHistory.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { RunHistoryItem } from '@/lib/mohamedQueries'
import type { RunLedgerSnapshot } from '@/lib/mohamedLedger'
import { summariseClaims } from '@/lib/mohamedLedger'
import { RunDetailPanel } from './RunDetailPanel'

const statusStyles: Record<RunHistoryItem['status'], string> = {
  review_ready: 'bg-emerald-50 text-emerald-800',
  blocked: 'bg-amber-50 text-amber-800',
  failed: 'bg-red-50 text-red-800',
}

const statusLabels: Record<RunHistoryItem['status'], string> = {
  review_ready: 'Reached review',
  blocked: 'Rows blocked',
  failed: 'Failed',
}

function when(iso: string) {
  return iso.replace('T', ' ').slice(0, 16) + ' UTC'
}

type RunPreview = { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; ledger: RunLedgerSnapshot }

/**
 * Client component so a run click opens the drill-down panel in place —
 * the previous full-page navigation to /mohamed?run=<id> was disorienting.
 * That deep link still works (the panel offers it as "Open full report").
 *
 * Collapsible by run (Andy's ask): each run is a native <details> row,
 * newest expanded by default, showing a dense claim list on open. The full
 * per-claim review experience (grouped by member, step viewer, approve/
 * reject) still lives in RunDetailPanel, opened via "Open full review".
 */
export function RunHistory({
  history,
  selectedRunId,
  canApprove = false,
  degraded = false,
}: {
  history: RunHistoryItem[]
  selectedRunId: string
  canApprove?: boolean
  degraded?: boolean
}) {
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(history[0] ? [history[0].runId] : []))
  const [previews, setPreviews] = useState<Record<string, RunPreview>>({})

  function loadPreview(runId: string) {
    setPreviews(prev => (prev[runId] ? prev : { ...prev, [runId]: { phase: 'loading' } }))
    fetch(`/api/mohamed/run/${runId}`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok || !data.ok || !data.ledger) throw new Error('bad_response')
        setPreviews(prev => ({ ...prev, [runId]: { phase: 'ready', ledger: data.ledger } }))
      })
      .catch(() => setPreviews(prev => ({ ...prev, [runId]: { phase: 'error' } })))
  }

  function toggle(runId: string, nowOpen: boolean) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (nowOpen) {
        next.add(runId)
        loadPreview(runId)
      } else {
        next.delete(runId)
      }
      return next
    })
  }

  return (
    <section data-section="history" className="mt-7 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-5 py-3">
        <h2 className="text-sm font-semibold">Run history</h2>
        <p className="mt-0.5 text-xs text-zinc-500">Every run is kept. Click a run to see its claims, or open the full review.</p>
      </div>
      {degraded ? (
        <p className="px-5 py-6 text-xs text-amber-700">Reconnecting… refreshes automatically.</p>
      ) : history.length === 0 ? (
        <p className="px-5 py-6 text-xs text-zinc-500">No runs yet.</p>
      ) : (
        <div className="divide-y divide-zinc-100">
          {history.map(item => {
            const isOpen = expanded.has(item.runId)
            const preview = previews[item.runId]
            const claims = preview?.phase === 'ready' ? summariseClaims(preview.ledger) : []
            return (
              <details
                key={item.runId}
                open={isOpen}
                onToggle={event => toggle(item.runId, (event.target as HTMLDetailsElement).open)}
              >
                <summary
                  className={`flex cursor-pointer flex-wrap items-center gap-3 px-4 py-2.5 text-xs hover:bg-emerald-50/40 ${
                    item.runId === selectedRunId ? 'bg-zinc-50' : ''
                  }`}
                >
                  <span className="w-32 shrink-0 text-zinc-600">{when(item.startedAt)}</span>
                  <span className="w-28 shrink-0 font-mono text-zinc-700">{item.runId.slice(0, 12)}</span>
                  <span className="w-20 shrink-0">{item.mode.replace('_', ' ')}</span>
                  <span className="w-32 shrink-0">{item.source.replaceAll('_', ' ')}</span>
                  <span className="w-40 shrink-0">
                    {item.periodStart} → {item.periodEnd}
                  </span>
                  <span className="w-14 shrink-0">{item.eventCount} ev</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${statusStyles[item.status]}`}>
                    {statusLabels[item.status]}
                  </span>
                </summary>
                <div className="border-t border-zinc-100 bg-zinc-50/50 px-4 py-2.5">
                  {preview === undefined || preview.phase === 'loading' ? (
                    <p className="text-xs text-zinc-400">Loading claims…</p>
                  ) : preview.phase === 'error' ? (
                    <p className="text-xs text-red-700">Could not load this run&apos;s claims.</p>
                  ) : claims.length === 0 ? (
                    <p className="text-xs text-zinc-400">No claims in this run.</p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {claims.map(claim => (
                        <li key={claim.claimRef} className="flex items-center gap-2 text-zinc-600">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${claim.reachedReview ? 'bg-emerald-500' : 'bg-red-500'}`}
                          />
                          <span className="font-mono text-[11px] text-zinc-400">{claim.claimRef.slice(0, 8)}</span>
                          <span>{claim.procedureCode?.toUpperCase() ?? 'claim'}</span>
                          {!claim.reachedReview && <span className="text-red-600">did not reach review</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpenRunId(item.runId)}
                    className="mt-2 text-[11px] font-medium text-emerald-700 hover:underline"
                  >
                    Open full review →
                  </button>
                </div>
              </details>
            )
          })}
        </div>
      )}
      {openRunId && <RunDetailPanel runId={openRunId} canApprove={canApprove} onClose={() => setOpenRunId(null)} />}
    </section>
  )
}
```

Note: `RunReviewLink` is no longer imported/used here — its per-run "View submission" modal is superseded by "Open full review →", which opens the fuller `RunDetailPanel`. Confirm `RunReviewLink.tsx` is still used elsewhere (it's also rendered from `RunTrace` per the earlier research) before considering it for removal — it is NOT being deleted by this task, only its usage in `RunHistory` is dropped.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test --experimental-test-module-mocks --import tsx tests/mohamed-run-history.test.ts`
Expected: all PASS.

- [ ] **Step 5: Typecheck, full test suite, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green — in particular re-run the full `npm test` (not just the new file) since `RunHistory` is exercised indirectly by anything that renders `MohamedDashboard`.

- [ ] **Step 6: Manual browser verification**

Run: `npm run dev`, open `/mohamed`. Verify: the newest run's row is expanded on load showing a dense claim list; clicking other rows expands/collapses them independently (native `<details>` behavior — no `name` attribute grouping, so multiple can be open at once); "Open full review →" inside an expanded row opens the same slide-over as before; clicking a collapsed row's summary toggles it without a full page navigation; on a narrow viewport the summary row's fixed-width spans don't visually break (check `w-32`/`w-28`/etc. wrap sanely — if not, note it as a follow-up rather than blocking, since "keep it dense" was the ask, not full mobile responsiveness of the history table itself).

- [ ] **Step 7: Commit**

```bash
git add components/mohamed/RunHistory.tsx tests/mohamed-run-history.test.ts
git commit -m "feat(mohamed): make run history collapsible per run, newest expanded"
```

---

## Task 5: Final verification and handoff

**Files:** none (verification only).

- [ ] **Step 1: Full verification**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 2: Cross-check against the mohamed repo's dependency**

Confirm (ask the user, or check directly) whether the mohamed repo's `2026-08-24-hcpf-step-captures.md` plan has been deployed yet. If not, the step strip will simply never appear (every `getClaimSteps` call 404s/network-errors, caught and treated as "no steps") — this is expected, not a bug, per Task 2's fallback design. Note this explicitly to the user rather than silently assuming either state.

- [ ] **Step 3: PR**

Push the branch and open one PR for this repo's slice of the work (per the user's stated workflow: one PR per repo). Squash-merge when CI is green — this repo deploys via Vercel on merge to `main`, no separate deploy step needed.

---

## Self-Review Notes

- **Spec coverage:** group by member ID with open-claims-first sort (Task 3), per-claim step strip with numbered chips/thumbnails, prev/next, arrow keys, overflow-x scroll for mobile, fetched via the reused token pattern, falling back cleanly on claims without step captures (Task 2), collapsible run history with newest open by default and dense claim previews (Task 4), `npm run typecheck && npm test && npm run build` green before each task (every task's late steps, plus Task 5).
- **No placeholders:** every step above has literal code, not a description of code.
- **Type/name consistency check:** `StepIndexEntry`/`ReviewField` are defined once in `lib/mohamedReviewClient.ts` (Task 1) and imported (not redefined) by `ClaimReviewCard.tsx` (Task 2). `ClaimGroup`/`groupClaimsByMember`/`isClaimOpen` are defined once in `lib/mohamedClaimGrouping.ts` (Task 3) and imported by `ClaimsByMember.tsx`. `ClaimsByMember`'s prop shape (`runId`, `claims`, `approvals`, `approvalDegraded?`, `canApprove`) matches exactly how Task 3 Steps 7–8 invoke it from both `MohamedDashboard.tsx` (passing a `Map`) and `RunDetailPanel.tsx` (passing a `Record`) — the `ApprovalsLookup` union and `approvalFor` helper inside `ClaimsByMember.tsx` handle both without either caller normalizing its data. `RunHistory`'s public props (`history`, `selectedRunId`, `canApprove`, `degraded`) are unchanged from today, so Task 4 requires no changes to `MohamedDashboard.tsx`'s existing `<RunHistory .../>` call site.
- **Dependency direction:** Task 2 (step viewer) and Task 3 (member grouping) both depend on Task 1 but not on each other — they touch the same file (`ClaimReviewCard.tsx` is modified by Task 2; `ClaimsByMember.tsx` in Task 3 renders `ClaimReviewCard` but doesn't modify it) so they should run in that order (1 → 2 → 3) to avoid one task's diff clobbering the other's, even though conceptually 2 and 3 are independent.
