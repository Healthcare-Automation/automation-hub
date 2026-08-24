# Mohamed Dashboard Production Revamp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution note for this run:** executed inline in the main session (single operator, full context already loaded from exploration — no fresh-subagent handoff needed). PR-per-task, merge on green, no review checkpoints, per explicit user instruction ("work autonomously, do not wait for review between PRs").

**Goal:** Take `/mohamed` from "flip-flops between renders, 5s navigation, cryptic failure states" to a dashboard an internal team can review tomorrow and call production-grade.

**Architecture:** Six independently-shippable PRs against `main`, in dependency order. Each PR is its own branch, passes `npm run typecheck && npm test && npm run build`, and squash-merges when green (Vercel auto-deploys `main`).

**Tech Stack:** Next.js 16 (App Router, force-dynamic page), React 19, Tailwind 4, `postgres` (Supabase pooler), Node's built-in `node --test` + `tsx`.

**Spec:** the task brief in this conversation (no separate spec file — the brief itself is the spec of record; this plan is the executable breakdown of it).

## Global Constraints

- No member names/IDs in logs, commits, code comments. Member IDs only ever appear in already-authenticated claim-review UI at runtime (existing behavior, untouched).
- Hub access code, when used for the proof script, is obtained via `sudo systemd-creds decrypt --name=mohamed-hub-access-code /etc/credstore.encrypted/mohamed/mohamed-hub-access-code.cred -` and is NEVER echoed, logged, or written to a committed file.
- One branch + one PR per task below. `npm run typecheck && npm test && npm run build` green before every PR. Squash-merge, delete branch, no waiting for human review.
- Keep the existing zinc/emerald visual language — this is a hierarchy/consistency fix, not a rebrand.
- Ledger data (`RunLedgerSnapshot` / `RunEvent`) stays PHI-free by construction (`lib/mohamedLedger.ts` header comment) — nothing added here may put identifier-like data into it.
- Consult `node_modules/next/dist/docs/` before writing framework code (per `AGENTS.md`) — already done for `loading.js`, `<Link>` prefetch, and streaming during planning; findings below.

## Key design decisions locked during planning

1. **`getClientQuestions()` degrades honestly, but distinguishes "not migrated yet" from "degraded."** A new `QuestionsNotMigratedError` (thrown only on Postgres `42P01` undefined_table) is treated by `page.tsx` as "genuinely no questions" (empty state), not "degraded" (reconnecting placeholder) — matches the task's own carve-out ("keep the 'table not migrated' case distinguishable if cheap").
2. **The CSV upload card and in-flight progress become visible to Mohamed's own session, not just admin.** Today `CsvUploadCard`, the in-flight pill, and `LiveDashboardRefresh` are gated `isAdmin` only, while `canApprove`, `/api/mohamed/review-token`, `/api/mohamed/approve`, and `/api/mohamed/answer-question` already use the established `isAdmin || isMohamed` pattern. Task 4 explicitly requires the *uploader* to see live progress and a "queued" confirmation after upload — that only makes sense if Mohamed's own session can upload. `/api/mohamed/upload-token` is updated to accept `isMohamed` the same way `review-token` already does (same file shape, same two-cookie check — not a new pattern). `/api/mohamed/trigger` (admin-only manual fixture/live trigger button) is intentionally left admin-only; it is a debug tool, not part of the 7 required sections.
   - This also fixes the proof script: the only credential the task gives us is the Mohamed access code (`/api/mohamed/login`), so the consistency check authenticates as Mohamed, not admin. For that session to legitimately show all 7 `data-section` markers, "upload" must not be admin-gated.
3. **`loading.tsx` + `next/link` prefetch is the whole Task 2 fix; no `<Suspense>` restructuring.** `app/mohamed/page.tsx` does `await cookies()` before any data fetch (`export const dynamic = 'force-dynamic'`), so the entire page is dynamic from the top — per the streaming guide (`node_modules/next/dist/docs/01-app/02-guides/streaming.md`, "Push dynamic access down"), a `<Suspense>` boundary placed inside the page would still block on that top-level `await`, buying nothing, and restructuring the auth reads to stream would touch `isAdmin`/`isMohamed`/`canApprove`, which every section depends on — too much blast radius for a same-day review. `loading.tsx` alone (per `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`) is prefetched and paints instantly on click regardless. This matches the task's own escape hatch: "Only do [Suspense] if it doesn't fight force-dynamic; loading.tsx + prefetch alone already gets instant nav paint."
4. **Progress-bar stage list is exactly the 5 codes the task names** (`reading_csv`, `checking_portal_session`, `checking_eligibility`, `entering_claims_on_hcpf`, `saving_results`); `claims_completed` (already in `describeRunProgress`'s label map, meaning "the entering_claims_on_hcpf stage finished its last claim") aliases onto the `entering_claims_on_hcpf` index rather than becoming a 6th step, and `waiting_for_portal_session` is a separate paused overlay state, not a step in the list.
5. **Task 3 and Task 5 (questions card) ship as separate PRs** even though Task 3(f) references the questions card, because Task 1 already touches `ClientQuestionsCard.tsx` minimally (empty/degraded state) and Task 5 is a full internal rewrite — splitting keeps each diff reviewable and each PR's test/build cycle meaningful on its own.

## File structure

| File | Change |
|---|---|
| `lib/mohamedQuestions.ts` | PR1: stop swallowing errors; add `QuestionsNotMigratedError` |
| `app/mohamed/page.tsx` | PR1: per-section degraded flags, approvals degraded flag; PR3: fetch `inFlight` for Mohamed sessions too; PR4: pass portal-health-relevant props |
| `components/mohamed/ClientQuestionsCard.tsx` | PR1: always render + degraded/empty states + `data-section`; PR6: full rewrite (topic headlines, clamped body, collapsed answered rows) |
| `components/mohamed/RunHistory.tsx` | PR1: always render + degraded/empty states + `data-section`; PR4: spacing tightened, moved above questions (position change only, in `MohamedDashboard.tsx`) |
| `components/mohamed/MohamedDashboard.tsx` | PR1: `data-section` on status/upload/claims/technical/footer, thread degraded props; PR3: progress bar wiring, `isMohamed` prop; PR4: full hierarchy reorder + gap-alert restyle |
| `components/mohamed/CsvUploadCard.tsx` | PR1: `data-section="upload"`; PR5: amber portal-health notice, "Queued" post-upload copy, live progress steps |
| `app/api/mohamed/upload-token/route.ts` | PR1: accept `isMohamed` (mirrors `review-token`) |
| `lib/mohamedRunRequests.ts` | PR3: `PROGRESS_STAGES`, `parseRunProgress()` |
| `components/mohamed/RunProgress.tsx` | PR3: new — ordered step list + percent bar |
| `lib/mohamedLedger.ts` | PR4: `describeFailureForClient()` (what happened / what the system did / what to do) |
| `app/api/mohamed/portal-health/route.ts` | PR5: new — reads latest in-flight request's progress |
| `app/page.tsx` | PR2: `<a href="/mohamed">` → `next/link` |
| `app/mohamed/loading.tsx` | PR2: new — full skeleton |
| `scripts/mohamed-consistency-check.mjs` | PR1: new — proof script |
| `tests/mohamed-questions.test.ts` | PR1: new |
| `tests/mohamed-run-requests.test.ts` | PR3: new |
| `tests/mohamed-ledger.test.ts` | PR4: extended |

---

## Task 1 (PR1): Kill render inconsistency — the class, not the instance

**Files:** `lib/mohamedQuestions.ts`, `app/mohamed/page.tsx`, `components/mohamed/ClientQuestionsCard.tsx`, `components/mohamed/RunHistory.tsx`, `components/mohamed/MohamedDashboard.tsx`, `components/mohamed/CsvUploadCard.tsx`, `app/api/mohamed/upload-token/route.ts`, new `scripts/mohamed-consistency-check.mjs`, new `tests/mohamed-questions.test.ts`.

**Interfaces produced (later tasks rely on these):**
- `QuestionsNotMigratedError` (exported from `lib/mohamedQuestions.ts`)
- `MohamedDashboard` props gain: `historyDegraded: boolean`, `questionsDegraded: boolean`, `approvalsDegraded: boolean`
- Every rendered section carries `data-section="status" | "upload" | "claims" | "history" | "questions" | "technical" | "footer"` on its outermost element

- [ ] **Step 1: `lib/mohamedQuestions.ts` — stop swallowing errors, distinguish "not migrated"**

Replace the whole file's error handling (keep everything else — types, `toQuestion`, `answerClientQuestion` — unchanged):

```ts
export class QuestionsNotMigratedError extends Error {}

function isUndefinedTable(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: string }).code === '42P01')
}

/** Open questions first (newest first), then recently answered ones so the
 * decision trail stays visible on the page. Throws on any failure except a
 * missing table (pre-migration installs) so the caller can tell "genuinely
 * no questions" apart from "the query failed" — a swallowed error here is
 * indistinguishable from an empty result and was the root cause of the
 * questions section vanishing on transient pooler errors. */
export async function getClientQuestions(): Promise<ClientQuestion[]> {
  if (!isMohamedLedgerConfigured) return []
  try {
    const rows = await mohamedQuery(sql => sql<RawRow[]>`
      select id, created_at, topic, question, status, answer, answered_at, answered_by
      from mohamed_client_questions
      where status in ('open', 'answered')
      order by (status = 'open') desc, created_at desc
      limit 20
    `)
    return rows.map(toQuestion)
  } catch (err) {
    if (isUndefinedTable(err)) throw new QuestionsNotMigratedError('mohamed_client_questions not migrated')
    throw err
  }
}
```

- [ ] **Step 2: test the new behavior**

Create `tests/mohamed-questions.test.ts`:

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { QuestionsNotMigratedError } from '../lib/mohamedQuestions'

test('QuestionsNotMigratedError is a distinct, catchable class', () => {
  const err = new QuestionsNotMigratedError('mohamed_client_questions not migrated')
  assert.ok(err instanceof Error)
  assert.ok(err instanceof QuestionsNotMigratedError)
  assert.equal(err.message, 'mohamed_client_questions not migrated')
})
```

(`getClientQuestions()` itself needs a live/mocked DB to exercise the throw path — out of scope for this repo's DB-less unit tests, same as the rest of `lib/mohamed*.ts`; this test locks the exported contract the rest of the plan depends on.)

Run: `npx tsx --test tests/mohamed-questions.test.ts` — expect PASS.

- [ ] **Step 3: `app/mohamed/page.tsx` — degraded flags, no silent catches**

Replace the body from the `import` of `getClientQuestions` through the return of `<MohamedDashboard ...>` props:

```ts
import { getClientQuestions, QuestionsNotMigratedError, type ClientQuestion } from '@/lib/mohamedQuestions'
```

Replace the state block and the `if (isMohamedLedgerConfigured)` block:

```ts
  let ledger: RunLedgerSnapshot | undefined = isMohamedLedgerConfigured
    ? undefined
    : (demoLedger as RunLedgerSnapshot)
  let history: RunHistoryItem[] = []
  let historyDegraded = false
  let approvals = new Map<string, ClaimApproval>()
  let approvalsDegraded = false
  let ledgerSource: 'live' | 'synthetic' | 'unavailable' = 'synthetic'
  let inFlight: RunRequestRow | null = null
  let questions: ClientQuestion[] = []
  let questionsDegraded = false

  if (isMohamedLedgerConfigured) {
    const selected = typeof run === 'string' && /^[0-9a-f]{32}$/.test(run) ? run : undefined
    // allSettled, not all: one slow/failed query must not throw away the
    // other three (that all-or-nothing catch was half the flip-flop bug).
    const [liveR, runsR, requestR, questionsR] = await Promise.allSettled([
      getMohamedLedger(selected),
      getMohamedRunHistory(),
      isAdmin || isMohamed ? getInFlightRunRequest() : Promise.resolve(null),
      getClientQuestions(),
    ])
    if (runsR.status === 'fulfilled') {
      history = runsR.value
    } else {
      historyDegraded = true
    }
    if (requestR.status === 'fulfilled') inFlight = requestR.value
    if (questionsR.status === 'fulfilled') {
      questions = questionsR.value
    } else if (questionsR.reason instanceof QuestionsNotMigratedError) {
      questions = []
    } else {
      questionsDegraded = true
    }
    if (liveR.status === 'fulfilled' && liveR.value) {
      ledger = liveR.value
      ledgerSource = 'live'
      try {
        approvals = await getApprovalsForRun(liveR.value.run_id)
      } catch {
        approvalsDegraded = true
      }
    } else {
      // Pooler unreachable/saturated or the ledger query failed: keep the
      // page honest — no demo data, just a retrying banner.
      ledgerSource = 'unavailable'
    }
  }
```

And the render:

```tsx
  return (
    <>
      {(isAdmin || isMohamed) && <LiveDashboardRefresh intervalMs={inFlight ? 5_000 : 20_000} />}
      <MohamedDashboard
        ledger={ledger}
        ledgerSource={ledgerSource}
        history={history}
        historyDegraded={historyDegraded}
        approvals={approvals}
        approvalsDegraded={approvalsDegraded}
        isAdmin={isAdmin}
        isMohamed={isMohamed}
        canApprove={canApprove}
        inFlight={inFlight}
        questions={questions}
        questionsDegraded={questionsDegraded}
      />
    </>
  )
```

(`isMohamed` was already computed at the top of the function for `canApprove` — reuse it, don't recompute.)

- [ ] **Step 4: `components/mohamed/RunHistory.tsx` — always render, add `data-section`, degraded prop**

Remove the `if (history.length === 0) return null` early return. Add `degraded` prop and `data-section="history"`:

```tsx
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

  return (
    <section data-section="history" className="mt-7 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-5 py-3">
        <h2 className="text-sm font-semibold">Run history</h2>
        <p className="mt-0.5 text-xs text-zinc-500">Every run is kept. Click a run to open its trace.</p>
      </div>
      {degraded ? (
        <p className="px-5 py-6 text-xs text-amber-700">Reconnecting… refreshes automatically.</p>
      ) : history.length === 0 ? (
        <p className="px-5 py-6 text-xs text-zinc-500">No runs yet.</p>
      ) : (
        <table className="w-full text-left text-xs">
          {/* ...unchanged thead/tbody from the current file... */}
        </table>
      )}
      {openRunId && <RunDetailPanel runId={openRunId} canApprove={canApprove} onClose={() => setOpenRunId(null)} />}
    </section>
  )
}
```

(Keep the existing `<thead>`/`<tbody>` markup byte-for-byte inside the `history.length === 0` else-branch — only the wrapping conditional and the two new states are new.)

- [ ] **Step 5: `components/mohamed/ClientQuestionsCard.tsx` — always render, degraded + empty states, `data-section`**

Remove `if (questions.length === 0) return null`. Add `degraded` prop:

```tsx
export function ClientQuestionsCard({
  questions,
  canAnswer,
  degraded = false,
}: {
  questions: ClientQuestion[]
  canAnswer: boolean
  degraded?: boolean
}) {
  const open = questions.filter(q => q.status === 'open')
  const answered = questions.filter(q => q.status === 'answered')

  return (
    <section data-section="questions" className="mt-7 rounded-2xl border border-sky-200 bg-sky-50 p-5">
      <h2 className="text-base font-semibold text-sky-950">Questions for you</h2>
      <p className="mt-0.5 text-xs text-sky-900/70">
        The automation needs these billing-rule decisions from you. Answers here become the rules it follows.
      </p>
      {degraded ? (
        <p className="mt-3 text-xs text-amber-700">Reconnecting… refreshes automatically.</p>
      ) : questions.length === 0 ? (
        <p className="mt-3 text-xs text-sky-900/70">No open questions right now.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {open.map(q => (
            <QuestionItem key={q.id} question={q} canAnswer={canAnswer} />
          ))}
          {answered.map(q => (
            <div key={q.id} className="rounded-xl border border-sky-200 bg-white p-4">
              <p className="text-sm text-zinc-800">{q.question}</p>
              <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                <span className="font-medium">Answer:</span> {q.answer}
                <span className="ml-2 text-[11px] text-emerald-700">
                  {q.answeredAt ? new Date(q.answeredAt).toLocaleDateString() : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
```

(`QuestionItem` unchanged — full rewrite of this card's internals is Task 5/PR6.)

- [ ] **Step 6: `components/mohamed/MohamedDashboard.tsx` — thread degraded props, `data-section` on the sections that live directly in this file**

Add `historyDegraded`, `questionsDegraded`, `approvalsDegraded`, `isMohamed` to the props type (defaults `false`). Add `data-section="status"` to both branches of the status hero (`ledger && hero` branch and the `else` "No runs yet" branch — same section, two states, same marker). Add `data-section="claims"` to the "Claims needing review" `<section>` — but that section is currently conditional on `reviewable.length > 0`; per the always-render rule it must render even when there are zero reviewable claims (empty state), so change:

```tsx
      {ledger && (
        <section data-section="claims" className="mt-7">
          <div className="mb-3">
            <h2 className="text-base font-semibold">Claims needing review</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Every claim that reached HCPF review. Nothing is submitted — review the fields and screenshot, then approve.
            </p>
          </div>
          {reviewable.length > 0 ? (
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
        </section>
      )}
```

Add `data-section="technical"` to the `<details>` wrapper, and `data-section="footer"` to the `<footer>`. Add `data-section="upload"` inside `CsvUploadCard` itself (Step 8 below), not here — and change the gating from `{isAdmin && <CsvUploadCard hasFile={Boolean(ledger)} />}` to:

```tsx
      {(isAdmin || isMohamed) && <CsvUploadCard hasFile={Boolean(ledger)} />}
```

Pass the degraded flags down to `RunHistory` and `ClientQuestionsCard`:

```tsx
      <RunHistory history={history} selectedRunId={ledger?.run_id ?? ''} canApprove={canApprove} degraded={historyDegraded} />

      <ClientQuestionsCard questions={questions} canAnswer={canApprove} degraded={questionsDegraded} />
```

(`RunHistory` is now always rendered, so drop the `{history.length > 0 && ...}` wrapper entirely.)

- [ ] **Step 7: `components/mohamed/ClaimReviewCard.tsx` — accept `approvalDegraded`, show a note instead of silently "not approved"**

Add prop `approvalDegraded?: boolean` (default `false`). Where `decision` is initialized (`useState<Decision>(approval?.decision ?? ...)`), leave as-is (still seeded from the `approval` prop — which the caller now passes `null` when degraded, so this naturally starts at "Needs review"). Add a one-line note right after the opening `<button>` block, before the rejected-reason paragraph:

```tsx
      {approvalDegraded && (
        <p className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Reconnecting to the approvals database — any existing decision on this claim isn't shown yet, refreshes automatically.
        </p>
      )}
```

Update the destructured props signature accordingly: `{ runId, claim, approval, approvalDegraded = false, canApprove }`.

- [ ] **Step 8: `components/mohamed/CsvUploadCard.tsx` — `data-section="upload"`**

Add `data-section="upload"` to the outer `<section>` (the `mt-7 overflow-hidden rounded-2xl ...` one). No other change in this PR (portal-health notice is Task 4/PR5).

- [ ] **Step 9: `app/api/mohamed/upload-token/route.ts` — accept `isMohamed`, matching `review-token`**

Read the current file first to match its exact response shapes, then apply the same two-cookie check pattern already used in `app/api/mohamed/review-token/route.ts`:

```ts
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { MOHAMED_COOKIE_NAME, verifyMohamedCookieValue } from '@/lib/mohamedAuth'
// ...
  const adminOk = await verifyAdminCookieValue(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  const mohamedOk = await verifyMohamedCookieValue(req.cookies.get(MOHAMED_COOKIE_NAME)?.value)
  if (!adminOk && !mohamedOk) {
    return NextResponse.json({ ok: false, error: 'Sign in first.' }, { status: 401 })
  }
```

replacing the current `isAdmin`-only check. Keep everything else in the file (token minting, VPS URL, expiry) unchanged.

- [ ] **Step 10: `npm run typecheck && npm test && npm run build`**

Fix anything red before continuing.

- [ ] **Step 11: `scripts/mohamed-consistency-check.mjs` — the proof script**

```js
#!/usr/bin/env node
// Proof that /mohamed renders the same set of sections on every refresh.
// Never logs the access code. Usage: node scripts/mohamed-consistency-check.mjs

import { execFileSync } from 'node:child_process'

const BASE_URL = process.env.MOHAMED_CHECK_BASE_URL ?? 'https://automation-hub-rosy.vercel.app'
const REQUIRED_SECTIONS = ['status', 'upload', 'claims', 'history', 'questions', 'technical', 'footer']
const TOTAL_REQUESTS = 50
const CONCURRENCY = 5

function decryptAccessCode() {
  const out = execFileSync(
    'sudo',
    [
      'systemd-creds',
      'decrypt',
      '--name=mohamed-hub-access-code',
      '/etc/credstore.encrypted/mohamed/mohamed-hub-access-code.cred',
      '-',
    ],
    { encoding: 'utf8' },
  )
  return out.trim()
}

async function login(code) {
  const res = await fetch(`${BASE_URL}/api/mohamed/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!res.ok) throw new Error(`login failed: HTTP ${res.status}`)
  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) throw new Error('login succeeded but no Set-Cookie header was returned')
  const cookie = setCookie.split(';')[0]
  const body = await res.json()
  if (!body.ok) throw new Error('login failed: response body ok=false')
  return cookie
}

function extractSections(html) {
  const found = new Set()
  const re = /data-section="([a-z]+)"/g
  let match
  while ((match = re.exec(html))) found.add(match[1])
  return found
}

async function fetchOnce(cookie, index) {
  const url = `${BASE_URL}/mohamed?cachebust=${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`
  const res = await fetch(url, {
    headers: {
      Cookie: cookie,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  })
  if (!res.ok) return { index, ok: false, status: res.status, sections: new Set() }
  const html = await res.text()
  return { index, ok: true, status: res.status, sections: extractSections(html) }
}

async function runPool(cookie) {
  const results = new Array(TOTAL_REQUESTS)
  let next = 0
  async function worker() {
    while (next < TOTAL_REQUESTS) {
      const index = next++
      results[index] = await fetchOnce(cookie, index)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return results
}

async function main() {
  const code = decryptAccessCode()
  const cookie = await login(code)

  const results = await runPool(cookie)

  let passCount = 0
  const failures = []
  let referenceSet = null

  for (const result of results) {
    if (!result.ok) {
      failures.push(`#${result.index}: HTTP ${result.status}`)
      continue
    }
    const missing = REQUIRED_SECTIONS.filter(section => !result.sections.has(section))
    if (missing.length > 0) {
      failures.push(`#${result.index}: missing [${missing.join(', ')}]`)
      continue
    }
    const sortedSections = [...result.sections].sort().join(',')
    if (referenceSet === null) {
      referenceSet = sortedSections
    } else if (sortedSections !== referenceSet) {
      failures.push(`#${result.index}: section set differs (${sortedSections} vs ${referenceSet})`)
      continue
    }
    passCount++
  }

  console.log(`${passCount}/${TOTAL_REQUESTS} passed`)
  if (failures.length > 0) {
    console.error('Failures:')
    for (const failure of failures) console.error(`  ${failure}`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
```

- [ ] **Step 12: run it against prod after PR1 deploys, iterate until 50/50**

Run: `node scripts/mohamed-consistency-check.mjs`
Expected: `50/50 passed`. If not, read the failure list (never contains the code), fix the underlying section, re-run.

- [ ] **Step 13: commit, open PR, merge on green**

```bash
git checkout -b fix/mohamed-render-consistency
git add lib/mohamedQuestions.ts app/mohamed/page.tsx components/mohamed/ClientQuestionsCard.tsx \
  components/mohamed/RunHistory.tsx components/mohamed/MohamedDashboard.tsx components/mohamed/CsvUploadCard.tsx \
  components/mohamed/ClaimReviewCard.tsx app/api/mohamed/upload-token/route.ts \
  scripts/mohamed-consistency-check.mjs tests/mohamed-questions.test.ts
git commit -m "Kill /mohamed render inconsistency: sections always render, errors don't get swallowed as empty"
git push -u origin fix/mohamed-render-consistency
gh pr create --title "..." --body "..."
# after CI green:
gh pr merge --squash --delete-branch
```

---

## Task 2 (PR2): Near-instant navigation

**Files:** new `app/mohamed/loading.tsx`, `app/page.tsx` (the `/mohamed` nav link), `components/mohamed/MohamedDashboard.tsx` (the two in-dashboard nav links).

**Interfaces consumed:** the `data-section` structure from PR1, so the skeleton's shape can mirror the real layout.

- [ ] **Step 1: `app/mohamed/loading.tsx`**

```tsx
function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-200 ${className}`} />
}

export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="mt-2 h-7 w-72" />
        </div>
        <SkeletonBlock className="h-8 w-32" />
      </div>

      <div className="mt-7 rounded-2xl border border-zinc-200 bg-white p-5">
        <SkeletonBlock className="h-5 w-40" />
        <SkeletonBlock className="mt-3 h-4 w-full max-w-md" />
      </div>

      <div className="mt-7 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <SkeletonBlock className="h-5 w-48" />
        </div>
        <div className="p-5">
          <SkeletonBlock className="h-28 w-full" />
        </div>
      </div>

      <div className="mt-7">
        <SkeletonBlock className="h-5 w-56" />
        <div className="mt-3 space-y-2">
          <SkeletonBlock className="h-14 w-full" />
          <SkeletonBlock className="h-14 w-full" />
          <SkeletonBlock className="h-14 w-full" />
        </div>
      </div>

      <div className="mt-7 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-3">
          <SkeletonBlock className="h-4 w-32" />
        </div>
        <SkeletonBlock className="h-32 w-full rounded-none" />
      </div>

      <div className="mt-7 rounded-2xl border border-sky-200 bg-sky-50 p-5">
        <SkeletonBlock className="h-5 w-44 bg-sky-200" />
        <SkeletonBlock className="mt-3 h-16 w-full bg-sky-200" />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `app/page.tsx` — `next/link` with prefetch for the Mohamed nav link**

Add `import Link from 'next/link'` near the top (alongside the other imports). Replace:

```tsx
<a href="/mohamed" className="rounded-md px-3 py-1.5 text-zinc-400 transition-colors hover:text-white">Mohamed</a>
```

with:

```tsx
<Link href="/mohamed" prefetch className="rounded-md px-3 py-1.5 text-zinc-400 transition-colors hover:text-white">Mohamed</Link>
```

Leave `<a href="/">Proxi</a>` on the same line as a plain `<a>` — it's the current page, prefetching it is meaningless. (If codebase convention prefers both as `Link`, convert both; check for an existing `Link` import pattern elsewhere in `app/page.tsx` first — there isn't one currently, so this is the first.)

- [ ] **Step 3: `components/mohamed/MohamedDashboard.tsx` — same for the reverse direction**

```tsx
import Link from 'next/link'
```

Replace:

```tsx
<a href="/" className="rounded-md px-3 py-1.5 text-zinc-500 hover:text-zinc-900">Proxi</a>
<a href="/mohamed" className="rounded-md bg-zinc-900 px-3 py-1.5 text-white">Mohamed</a>
```

with:

```tsx
<Link href="/" prefetch className="rounded-md px-3 py-1.5 text-zinc-500 hover:text-zinc-900">Proxi</Link>
<Link href="/mohamed" className="rounded-md bg-zinc-900 px-3 py-1.5 text-white">Mohamed</Link>
```

(Mohamed→Mohamed self-link doesn't need prefetch; Mohamed→Proxi does, symmetric with step 2.)

- [ ] **Step 4: `npm run typecheck && npm test && npm run build`**

- [ ] **Step 5: measure before/after**

Before merging, capture baseline on the currently-deployed prod:

```bash
for i in 1 2 3 4 5; do curl -s -o /dev/null -w "ttfb=%{time_starttransfer}s total=%{time_total}s\n" \
  -H "Cookie: <mohamed-session-cookie>" "https://automation-hub-rosy.vercel.app/mohamed?warm=$i"; done
```

After merge + deploy, repeat the same command and report both sets of five numbers in the PR body, plus a note that `loading.tsx` makes the *client-perceived* nav instant regardless of TTFB (skeleton paints on click, before the server response arrives).

- [ ] **Step 6: commit, PR, merge on green**

```bash
git checkout -b perf/mohamed-instant-nav
git add app/mohamed/loading.tsx app/page.tsx components/mohamed/MohamedDashboard.tsx
git commit -m "Add /mohamed loading skeleton and prefetch the Proxi<->Mohamed nav links"
git push -u origin perf/mohamed-instant-nav
gh pr create --title "..." --body "..."
gh pr merge --squash --delete-branch
```

---

## Task 3 (PR3): Real progress bar for in-flight runs

**Files:** `lib/mohamedRunRequests.ts`, new `components/mohamed/RunProgress.tsx`, `components/mohamed/MohamedDashboard.tsx`, `app/mohamed/page.tsx`, new `tests/mohamed-run-requests.test.ts`.

**Interfaces produced:** `PROGRESS_STAGES: readonly ProgressStageCode[]`, `parseRunProgress(progress: string | null): ProgressState | null` from `lib/mohamedRunRequests.ts`; `RunProgress` component consuming `{ progress: string | null }`.

- [ ] **Step 1: `lib/mohamedRunRequests.ts` — add stage parsing below the existing `describeRunProgress`**

```ts
export const PROGRESS_STAGES = [
  'reading_csv',
  'checking_portal_session',
  'checking_eligibility',
  'entering_claims_on_hcpf',
  'saving_results',
] as const
export type ProgressStageCode = (typeof PROGRESS_STAGES)[number]

const PROGRESS_STAGE_ALIASES: Record<string, ProgressStageCode> = {
  // The poller emits `claims_completed` when the last claim in the
  // entering_claims_on_hcpf stage finishes — same step, not a 6th stage.
  claims_completed: 'entering_claims_on_hcpf',
}

export type ProgressCounter = { done: number; total: number }
export type ProgressState = {
  paused: boolean
  stageIndex: number
  stageLabel: string
  counter: ProgressCounter | null
  percent: number
}

/** Structured view of a progress code for rendering a step list + percent
 * bar. `describeRunProgress` stays as the plain-text one-liner used
 * elsewhere; this is additive, not a replacement. */
export function parseRunProgress(progress: string | null): ProgressState | null {
  if (!progress) return null
  const [rawCode, counterPart] = progress.split(':', 2)

  if (rawCode === 'waiting_for_portal_session') {
    return { paused: true, stageIndex: -1, stageLabel: describeRunProgress(progress) ?? rawCode, counter: null, percent: 0 }
  }

  const code = PROGRESS_STAGE_ALIASES[rawCode] ?? (rawCode as ProgressStageCode)
  const stageIndex = PROGRESS_STAGES.indexOf(code)
  const ofMatch = counterPart?.match(/^(\d+)_of_(\d+)$/)
  const counter: ProgressCounter | null = ofMatch ? { done: Number(ofMatch[1]), total: Number(ofMatch[2]) } : null

  const stageCount = PROGRESS_STAGES.length
  let percent = 0
  if (stageIndex >= 0) {
    const fractionWithinStage = counter && counter.total > 0 ? counter.done / counter.total : 0.5
    percent = Math.round(((stageIndex + fractionWithinStage) / stageCount) * 100)
  }

  return {
    paused: false,
    stageIndex,
    stageLabel: describeRunProgress(progress) ?? rawCode.replaceAll('_', ' '),
    counter,
    percent: Math.min(100, Math.max(0, percent)),
  }
}
```

- [ ] **Step 2: `tests/mohamed-run-requests.test.ts`**

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PROGRESS_STAGES, parseRunProgress } from '../lib/mohamedRunRequests'

test('null progress parses to null', () => {
  assert.equal(parseRunProgress(null), null)
})

test('waiting_for_portal_session is a paused state with no stage index', () => {
  const state = parseRunProgress('waiting_for_portal_session')
  assert.ok(state)
  assert.equal(state.paused, true)
  assert.equal(state.stageIndex, -1)
  assert.equal(state.percent, 0)
})

test('each named stage resolves to its position in PROGRESS_STAGES', () => {
  PROGRESS_STAGES.forEach((stage, index) => {
    const state = parseRunProgress(stage)
    assert.ok(state)
    assert.equal(state.paused, false)
    assert.equal(state.stageIndex, index)
  })
})

test('claims_completed aliases onto entering_claims_on_hcpf', () => {
  const aliased = parseRunProgress('claims_completed')
  const direct = parseRunProgress('entering_claims_on_hcpf')
  assert.equal(aliased?.stageIndex, direct?.stageIndex)
})

test('N_of_M counter is parsed and moves percent within the stage', () => {
  const early = parseRunProgress('checking_eligibility:1_of_10')
  const late = parseRunProgress('checking_eligibility:9_of_10')
  assert.ok(early && late)
  assert.deepEqual(early.counter, { done: 1, total: 10 })
  assert.ok(late.percent > early.percent)
})

test('percent increases monotonically across stage order at the same within-stage fraction', () => {
  const percents = PROGRESS_STAGES.map(stage => parseRunProgress(stage)?.percent ?? -1)
  for (let i = 1; i < percents.length; i++) assert.ok(percents[i] > percents[i - 1], `${percents[i - 1]} -> ${percents[i]}`)
})

test('unknown stage code has stageIndex -1 and percent 0', () => {
  const state = parseRunProgress('some_future_stage')
  assert.ok(state)
  assert.equal(state.stageIndex, -1)
  assert.equal(state.percent, 0)
})
```

Run: `npx tsx --test tests/mohamed-run-requests.test.ts` — expect all PASS.

- [ ] **Step 3: `components/mohamed/RunProgress.tsx`**

```tsx
import { PROGRESS_STAGES, parseRunProgress, type ProgressStageCode } from '@/lib/mohamedRunRequests'

const STEP_LABELS: Record<ProgressStageCode, string> = {
  reading_csv: 'Reading the uploaded CSV',
  checking_portal_session: 'Checking the HCPF portal session',
  checking_eligibility: 'Checking member eligibility',
  entering_claims_on_hcpf: 'Entering claims on HCPF',
  saving_results: 'Saving results',
}

/** Ordered step list + percent bar for an in-flight run's progress code.
 * `waiting_for_portal_session` renders as its own paused, amber state — it
 * isn't a step in the list, the run hasn't started stepping yet. */
export function RunProgress({ progress }: { progress: string | null }) {
  const state = parseRunProgress(progress)
  if (!state) return null

  if (state.paused) {
    return (
      <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
        <p className="text-xs font-medium text-amber-900">
          Portal session is being repaired automatically — your run will start when it recovers.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-3">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${state.percent}%` }} />
      </div>
      <ol className="mt-3 space-y-1.5">
        {PROGRESS_STAGES.map((stage, index) => {
          const isDone = index < state.stageIndex
          const isCurrent = index === state.stageIndex
          return (
            <li key={stage} className="flex items-center gap-2 text-xs">
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                  isDone
                    ? 'bg-emerald-600 text-white'
                    : isCurrent
                      ? 'border-2 border-emerald-500 bg-white text-emerald-600'
                      : 'border border-zinc-300 bg-white text-transparent'
                }`}
              >
                {isDone ? '✓' : ''}
              </span>
              <span className={isCurrent ? 'font-medium text-zinc-900' : isDone ? 'text-zinc-500' : 'text-zinc-400'}>
                {STEP_LABELS[stage]}
                {isCurrent && state.counter ? ` (${state.counter.done} of ${state.counter.total})` : ''}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
```

- [ ] **Step 4: `app/mohamed/page.tsx` — fetch in-flight for Mohamed's own session too**

Change `isAdmin ? getInFlightRunRequest() : Promise.resolve(null)` to `isAdmin || isMohamed ? getInFlightRunRequest() : Promise.resolve(null)` (see Global Constraints / design decision 2 — already applied in PR1 Step 3 above if PR1 landed first; if executing PR3 against a stale base, apply it here).

- [ ] **Step 5: `components/mohamed/MohamedDashboard.tsx` — replace the text pill with `RunProgress`, gate on `isAdmin || isMohamed`**

Add `import { RunProgress } from './RunProgress'`. Replace:

```tsx
            {isAdmin && (
              <div className="text-right text-[11px] text-zinc-500">
                {inFlight ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                    {describeRunProgress(inFlight.progress) ?? `A run is ${inFlight.status}`} — updates automatically
                  </span>
                ) : (
                  'Upload a CSV below to start a run'
                )}
              </div>
            )}
```

with:

```tsx
            {(isAdmin || isMohamed) && (
              <div className="w-full text-right text-[11px] text-zinc-500 sm:w-64">
                {inFlight ? (
                  <RunProgress progress={inFlight.progress} />
                ) : (
                  'Upload a CSV below to start a run'
                )}
              </div>
            )}
```

Remove the now-unused `describeRunProgress` import if nothing else in the file uses it (check with a grep before deleting the import line).

- [ ] **Step 6: `npm run typecheck && npm test && npm run build`**

- [ ] **Step 7: commit, PR, merge on green**

```bash
git checkout -b feat/mohamed-progress-bar
git add lib/mohamedRunRequests.ts components/mohamed/RunProgress.tsx components/mohamed/MohamedDashboard.tsx \
  app/mohamed/page.tsx tests/mohamed-run-requests.test.ts
git commit -m "Replace the in-flight run text pill with a real staged progress bar"
git push -u origin feat/mohamed-progress-bar
gh pr create --title "..." --body "..."
gh pr merge --squash --delete-branch
```

---

## Task 4 (PR4): Information hierarchy redesign

**Files:** `lib/mohamedLedger.ts`, `components/mohamed/MohamedDashboard.tsx`, `tests/mohamed-ledger.test.ts`.

**Interfaces consumed:** `RunProgress` (PR3), `data-section` markers (PR1). **Interfaces produced:** `describeFailureForClient(ledger): { whatHappened: string; whatSystemDid: string; whatToDo: string | null } | null` from `lib/mohamedLedger.ts`.

- [ ] **Step 1: `lib/mohamedLedger.ts` — plain-English failure mapping**

Add below `summariseInPlainLanguage`:

```ts
export type ClientFailureExplanation = {
  whatHappened: string
  whatSystemDid: string
  whatToDo: string | null
}

/** Maps a ledger failure/reason code to three plain-English fields for a
 * non-technical reader. Source of truth for what self-heals vs needs a
 * human: /root/projects/mohamed/docs/failure-modes-runbook.md. Falls back
 * to a generic-but-honest explanation for any code not in the table below
 * so a newly-introduced code never regresses to a raw string on screen. */
const FAILURE_EXPLANATIONS: Record<string, ClientFailureExplanation> = {
  hcpf_reauthentication_required: {
    whatHappened: 'The billing portal signed us out and stayed signed out for more than 35 minutes.',
    whatSystemDid: 'The system tried repeatedly to repair the session automatically and could not within that window.',
    whatToDo: 'No action needed from you — this is being looked into. Your upload is safe and will retry once the session is repaired.',
  },
  stale_session: {
    whatHappened: 'The billing portal detected a second, overlapping login and locked the session.',
    whatSystemDid: 'The system is waiting out the portal’s lock (about 15–25 minutes) and will retry the login automatically.',
    whatToDo: null,
  },
  service_line_rejected: {
    whatHappened: 'HCPF rejected one or more service lines on this claim.',
    whatSystemDid: 'The system captured a screenshot of the portal’s exact rejection message for this claim.',
    whatToDo: 'Open the claim’s failure screenshot below to see the portal’s exact message.',
  },
  websockettimeoutexception: {
    whatHappened: 'The portal page stopped responding partway through this run.',
    whatSystemDid: 'The system recovered by opening a fresh browser tab and continued with the next claim.',
    whatToDo: null,
  },
  invalid_claim_draft: {
    whatHappened: 'A claim could not be assembled from the uploaded data.',
    whatSystemDid: 'The system stopped before submitting anything for this claim.',
    whatToDo: 'Check the source row in the billing report for missing or malformed fields.',
  },
  overlaps_present: {
    whatHappened: 'This billing period overlaps with a period that was already billed.',
    whatSystemDid: 'The system held these visits back rather than risk a duplicate claim.',
    whatToDo: 'Confirm the intended billing period and re-run if it was uploaded by mistake.',
  },
}

const GENERIC_EXPLANATION: ClientFailureExplanation = {
  whatHappened: 'The run stopped on an error the automation has not seen described yet.',
  whatSystemDid: 'The system stopped before submitting anything and recorded exactly where.',
  whatToDo: 'See the technical detail below, or ask Andy to check the failure-modes runbook for this code.',
}

/** Three plain-English lines (what happened / what the system already did /
 * what you should do) for a run's failure code, replacing raw ledger codes
 * on the status strip. Portal failures inside a WebSocket timeout are
 * matched by substring since the raw code often carries a stack-trace-like
 * suffix (e.g. "websockettimeoutexception: ..."). */
export function describeFailureForClient(ledger: RunLedgerSnapshot): ClientFailureExplanation | null {
  const failure = ledger.first_failure
  if (!failure?.code) return null
  const code = failure.code.toLowerCase()
  const matchedKey = Object.keys(FAILURE_EXPLANATIONS).find(key => code.includes(key))
  return matchedKey ? FAILURE_EXPLANATIONS[matchedKey] : GENERIC_EXPLANATION
}
```

- [ ] **Step 2: extend `tests/mohamed-ledger.test.ts`**

Append (imports already bring in `describeFailure`; add `describeFailureForClient` to the import list):

```ts
import { describeFailureForClient } from '../lib/mohamedLedger'

test('describeFailureForClient maps known codes to plain-English three-liners', () => {
  const base: RunLedgerSnapshot = { ...ledger, status: 'failed' }
  const withCode = (code: string): RunLedgerSnapshot => ({
    ...base,
    first_failure: { ...ledger.events[0], code, seq: 1, status: 'failed' },
  })

  const reauth = describeFailureForClient(withCode('hcpf_reauthentication_required'))
  assert.ok(reauth)
  assert.match(reauth.whatHappened, /signed us out/)
  assert.match(reauth.whatSystemDid, /automatically/)

  const rejected = describeFailureForClient(withCode('service_line_rejected:2'))
  assert.ok(rejected)
  assert.match(rejected.whatToDo ?? '', /failure screenshot/)
})

test('describeFailureForClient falls back to a generic-but-honest explanation for unknown codes', () => {
  const unknown = describeFailureForClient({
    ...ledger,
    status: 'failed',
    first_failure: { ...ledger.events[0], code: 'brand_new_code_2027', seq: 1, status: 'failed' },
  })
  assert.ok(unknown)
  assert.match(unknown.whatToDo ?? '', /runbook/)
})

test('describeFailureForClient returns null when there is no failure', () => {
  assert.equal(describeFailureForClient(ledger), null)
})
```

Run: `npx tsx --test tests/mohamed-ledger.test.ts` — expect all PASS.

- [ ] **Step 3: `components/mohamed/MohamedDashboard.tsx` — full hierarchy reorder**

This step rewrites the JSX body (not the function signature/hooks-adjacent logic) per Task 3 in the brief:

(a) Status strip: shrink to one row, less padding. Replace the outer `<section className={\`mt-7 rounded-2xl border p-5 ${hero.border} ${hero.bg}\`}>` padding with `p-4` and drop the `<p className="mt-2 text-sm font-medium ...">{summariseInPlainLanguage(ledger)}</p>` down to a single line beside the badge instead of its own paragraph when the run succeeded; when `ledger.status === 'failed'`, replace that single sentence with the three-line `describeFailureForClient` block:

```tsx
      {ledger && hero ? (
        <section data-section="status" className={`mt-7 rounded-2xl border p-4 ${hero.border} ${hero.bg}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${hero.badge}`}>{hero.label}</span>
              <span className="shrink-0 text-[11px] text-zinc-500">{timeAgo(ledger.finished_at ?? ledger.started_at)}</span>
              <span className="truncate text-sm text-zinc-900">{summariseInPlainLanguage(ledger)}</span>
            </div>
            {(isAdmin || isMohamed) && (
              <div className="w-full text-right text-[11px] text-zinc-500 sm:w-64">
                {inFlight ? <RunProgress progress={inFlight.progress} /> : 'Upload a CSV below to start a run'}
              </div>
            )}
          </div>
          {reviewable.length > 0 && (
            <p className="mt-1.5 text-xs text-zinc-600">
              {rejectedCount > 0
                ? `${approvedCount} approved · ${rejectedCount} rejected`
                : `${approvedCount} of ${reviewable.length} claim${reviewable.length === 1 ? '' : 's'} approved`}
            </p>
          )}
          {failureExplanation && (
            <dl className="mt-3 space-y-1.5 border-t border-red-200 pt-3 text-xs">
              <div><dt className="inline font-semibold text-red-900">What happened: </dt><dd className="inline text-red-800">{failureExplanation.whatHappened}</dd></div>
              <div><dt className="inline font-semibold text-red-900">What the system did: </dt><dd className="inline text-red-800">{failureExplanation.whatSystemDid}</dd></div>
              {failureExplanation.whatToDo && (
                <div><dt className="inline font-semibold text-red-900">What to do: </dt><dd className="inline text-red-800">{failureExplanation.whatToDo}</dd></div>
              )}
            </dl>
          )}
        </section>
      ) : (
        <section data-section="status" className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-900">No runs yet. Upload a CSV below to start one.</p>
        </section>
      )}
```

Add `const failureExplanation = ledger?.status === 'failed' ? describeFailureForClient(ledger) : null` next to the existing `const gapAlert = ...` line, and `import { describeFailureForClient } from '@/lib/mohamedLedger'` alongside the existing ledger import.

(b) is already done via `RunProgress` in the block above (PR3).

(c) Claims section: already has `data-section="claims"` from PR1; no visual change needed here beyond confirming it now sits directly after the status strip with nothing but the (optional) upload card and gap alert between — reorder per (d) below.

(d) Gap alert: restyle from red "failure" banner to amber/neutral informational card, move to after the claims section:

```tsx
      {gapAlert && (
        <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 text-base text-amber-600" aria-hidden>ⓘ</span>
            <div>
              <h2 className="text-xs font-semibold text-amber-900">
                {gapAlert.visitsNeverBilled} visit{gapAlert.visitsNeverBilled === 1 ? '' : 's'} excluded — working as designed, per your rule
              </h2>
              <p className="mt-1 text-xs text-amber-800">
                {gapAlert.membersAffected} client{gapAlert.membersAffected === 1 ? '' : 's'} in this run{' '}
                {gapAlert.membersAffected === 1 ? 'is' : 'are'} missing one of the two required coverages
                (HCBS EBD Waiver / Community First Choice). Per your decision these visits are never billed
                until both coverages appear in the member&apos;s Medicaid record.
              </p>
            </div>
          </div>
        </section>
      )}
```

Move this block (in the JSX) to directly after the `{ledger && claims.some(c => !c.reachedReview) && (...)}` "did not reach review" notice and before `<RunHistory .../>` — i.e. after the claims section, matching brief item (d) "move it INSIDE/below the run report area (after claims section)".

(e) `RunHistory`: no markup change here (already compact from PR1); just confirm its position in the JSX is after the gap alert and before `ClientQuestionsCard` (it already is).

(g) Technical detail: unchanged, stays last before the footer.

- [ ] **Step 4: `npm run typecheck && npm test && npm run build`**

- [ ] **Step 5: commit, PR, merge on green**

```bash
git checkout -b feat/mohamed-hierarchy-redesign
git add lib/mohamedLedger.ts components/mohamed/MohamedDashboard.tsx tests/mohamed-ledger.test.ts
git commit -m "Redesign /mohamed information hierarchy: compact status strip, plain-English failures, gap alert as informational card"
git push -u origin feat/mohamed-hierarchy-redesign
gh pr create --title "..." --body "..."
gh pr merge --squash --delete-branch
```

---

## Task 5 (PR5): Portal-health-aware upload card

**Files:** new `app/api/mohamed/portal-health/route.ts`, `components/mohamed/CsvUploadCard.tsx`.

**Interfaces consumed:** `parseRunProgress`, `RunProgress` (PR3).

- [ ] **Step 1: `app/api/mohamed/portal-health/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/adminAuth'
import { MOHAMED_COOKIE_NAME, verifyMohamedCookieValue } from '@/lib/mohamedAuth'
import { getInFlightRunRequest } from '@/lib/mohamedRunRequests'

/** Read-only: is the latest in-flight run request waiting on a portal-session
 * repair? Used by CsvUploadCard so an upload never looks like it went into a
 * black hole while the keeper is mid-repair. */
export async function GET(req: NextRequest) {
  const adminOk = await verifyAdminCookieValue(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  const mohamedOk = await verifyMohamedCookieValue(req.cookies.get(MOHAMED_COOKIE_NAME)?.value)
  if (!adminOk && !mohamedOk) {
    return NextResponse.json({ ok: false, error: 'Sign in first.' }, { status: 401 })
  }

  try {
    const inFlight = await getInFlightRunRequest()
    const waiting = inFlight?.progress === 'waiting_for_portal_session'
    return NextResponse.json({ ok: true, waitingForPortalSession: waiting })
  } catch {
    // Best-effort: a failed health check must not block uploads — the card
    // just skips the amber notice this refresh.
    return NextResponse.json({ ok: true, waitingForPortalSession: false })
  }
}
```

- [ ] **Step 2: `components/mohamed/CsvUploadCard.tsx` — poll portal-health, show amber notice + queued state + live steps**

Add state and a poll effect, and restructure the post-upload messaging. Full replacement of the component body:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { RunProgress } from './RunProgress'

type Phase = 'idle' | 'requesting' | 'uploading' | 'queued' | 'error'

export function CsvUploadCard({ hasFile }: { hasFile: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [waitingForPortalSession, setWaitingForPortalSession] = useState(false)
  const [liveProgress, setLiveProgress] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await fetch('/api/mohamed/portal-health')
        const data = await res.json()
        if (!cancelled && data.ok) setWaitingForPortalSession(Boolean(data.waitingForPortalSession))
      } catch {
        // Best-effort — a failed poll just leaves the notice as it was.
      }
    }
    void poll()
    const id = setInterval(poll, 15_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  async function upload(file: File) {
    setPhase('requesting')
    setMessage(null)
    setFileName(file.name)
    try {
      const tokenRes = await fetch('/api/mohamed/upload-token', { method: 'POST' })
      const tokenData = await tokenRes.json()
      if (!tokenRes.ok || !tokenData.ok || !tokenData.uploadUrl) {
        setPhase('error')
        setMessage(tokenData.error ?? 'Upload is not configured yet.')
        return
      }

      setPhase('uploading')
      const uploadRes = await fetch(`${tokenData.uploadUrl}/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenData.token}`,
          'Content-Type': file.type || 'text/csv',
        },
        body: file,
      })
      const uploadData = await uploadRes.json().catch(() => ({ ok: false, error: 'bad_response' }))
      if (!uploadRes.ok || !uploadData.ok) {
        setPhase('error')
        setMessage(
          uploadData.error === 'unauthorized'
            ? 'Upload link expired — try again.'
            : 'Could not upload the file. Try again.',
        )
        return
      }
      setPhase('queued')
      setMessage('Queued — the runner picks this up within a minute.')
    } catch {
      setPhase('error')
      setMessage('Network error reaching the VPS. Try again.')
    }
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void upload(file)
    e.target.value = ''
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) void upload(file)
  }

  const busy = phase === 'requesting' || phase === 'uploading'

  return (
    <section data-section="upload" className="mt-7 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-base font-semibold">Upload billing report</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Export the AxisCare Billing Report as CSV and drop it here. The run starts on its own — no separate trigger needed.
        </p>
      </div>
      <div className="p-5">
        {waitingForPortalSession && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
            <p className="text-xs font-medium text-amber-900">
              Portal session is being repaired automatically — your upload will queue and start when it recovers.
            </p>
          </div>
        )}
        <div
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
            busy ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-300 hover:border-emerald-400 hover:bg-emerald-50/40'
          }`}
        >
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChosen} disabled={busy} />
          {phase === 'idle' && (
            <>
              <p className="text-sm font-medium text-zinc-700">Drag a CSV here, or click to choose a file</p>
              <p className="text-xs text-zinc-400">One file, straight to the VPS — not stored on Vercel</p>
            </>
          )}
          {busy && (
            <p className="text-sm font-medium text-zinc-700">
              {phase === 'requesting' ? 'Preparing upload…' : `Uploading ${fileName ?? 'file'}…`}
            </p>
          )}
          {phase === 'queued' && <p className="text-sm font-medium text-emerald-700">✓ {fileName}</p>}
          {phase === 'error' && <p className="text-sm font-medium text-red-700">Upload failed — click to try again</p>}
        </div>
        {message && (
          <p className={`mt-3 text-xs ${phase === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>{message}</p>
        )}
        {phase === 'queued' && <RunProgress progress={liveProgress} />}
        {!hasFile && phase === 'idle' && (
          <p className="mt-3 text-[11px] text-zinc-400">No run has been started from an upload yet.</p>
        )}
      </div>
    </section>
  )
}
```

`liveProgress` is intentionally left wired but unset (`null`) in this PR — `MohamedDashboard` already renders the authoritative `RunProgress` in the status strip from `inFlight.progress` (PR3/PR4), and duplicating a second polling loop inside `CsvUploadCard` purely for display would race the page's own 5s `LiveDashboardRefresh` and double the poll traffic. `RunProgress` here renders `null` (nothing) until `liveProgress` is non-null, so this is a no-op today and a documented extension point, not dead code shipped silently — call this out explicitly in the PR body.

Actually — simplify: since `RunProgress` with a `null` progress renders nothing, and there's no wiring to ever set `liveProgress` in this PR, drop the `<RunProgress progress={liveProgress} />` line and the `liveProgress` state entirely. Progress display already lives in the status strip (PR4). Keep this PR scoped to: portal-health notice + "Queued" copy only.

- [ ] **Step 3: `npm run typecheck && npm test && npm run build`**

- [ ] **Step 4: commit, PR, merge on green**

```bash
git checkout -b feat/mohamed-upload-portal-health
git add app/api/mohamed/portal-health/route.ts components/mohamed/CsvUploadCard.tsx
git commit -m "Upload card shows portal-repair status and always confirms queued, never a black hole"
git push -u origin feat/mohamed-upload-portal-health
gh pr create --title "..." --body "..."
gh pr merge --squash --delete-branch
```

---

## Task 6 (PR6): Questions card readability

**Files:** `components/mohamed/ClientQuestionsCard.tsx`.

- [ ] **Step 1: topic → headline map + body clamp + collapsible full text, full rewrite**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ClientQuestion } from '@/lib/mohamedQuestions'

const TOPIC_HEADLINES: Record<string, string> = {
  eligibility_coverage_gap: 'Coverage-gap billing rule',
}

function humanizeTopic(topic: string): string {
  return topic.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function topicHeadline(topic: string): string {
  return TOPIC_HEADLINES[topic] ?? humanizeTopic(topic)
}

/** Splits a question into a short clamped summary plus optional remainder:
 * prefer the first paragraph break, else the first full sentence within
 * ~200 chars, else a hard cut at 200 chars. */
function splitQuestion(question: string): { summary: string; rest: string | null } {
  const paragraphBreak = question.indexOf('\n\n')
  if (paragraphBreak > 0) {
    return { summary: question.slice(0, paragraphBreak).trim(), rest: question.slice(paragraphBreak).trim() }
  }
  if (question.length <= 200) return { summary: question, rest: null }
  const window = question.slice(0, 220)
  const sentenceEnd = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '))
  const cut = sentenceEnd > 80 ? sentenceEnd + 1 : 200
  return { summary: question.slice(0, cut).trim(), rest: question.slice(cut).trim() || null }
}

export function ClientQuestionsCard({
  questions,
  canAnswer,
  degraded = false,
}: {
  questions: ClientQuestion[]
  canAnswer: boolean
  degraded?: boolean
}) {
  const open = questions.filter(q => q.status === 'open')
  const answered = questions.filter(q => q.status === 'answered')

  return (
    <section data-section="questions" className="mt-7 rounded-2xl border border-sky-200 bg-sky-50 p-5">
      <h2 className="text-base font-semibold text-sky-950">Questions for you</h2>
      <p className="mt-0.5 text-xs text-sky-900/70">
        The automation needs these billing-rule decisions from you. Answers here become the rules it follows.
      </p>
      {degraded ? (
        <p className="mt-3 text-xs text-amber-700">Reconnecting… refreshes automatically.</p>
      ) : questions.length === 0 ? (
        <p className="mt-3 text-xs text-sky-900/70">No open questions right now.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {open.map(q => (
            <OpenQuestion key={q.id} question={q} canAnswer={canAnswer} />
          ))}
          {answered.map(q => (
            <AnsweredQuestion key={q.id} question={q} />
          ))}
        </div>
      )}
    </section>
  )
}

function OpenQuestion({ question, canAnswer }: { question: ClientQuestion; canAnswer: boolean }) {
  const router = useRouter()
  const [answer, setAnswer] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [showDetails, setShowDetails] = useState(false)
  const { summary, rest } = splitQuestion(question.question)

  async function submit() {
    if (!answer.trim()) return
    setState('saving')
    try {
      const res = await fetch('/api/mohamed/answer-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: question.id, answer: answer.trim() }),
      })
      if (!res.ok) throw new Error(String(res.status))
      router.refresh()
    } catch {
      setState('error')
    }
  }

  return (
    <div className="rounded-xl border border-sky-300 bg-white p-4">
      <div className="flex items-start gap-2">
        <span className="mt-1 inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900">{topicHeadline(question.topic)}</p>
          <p className="mt-0.5 text-sm text-zinc-700">{summary}</p>
          {rest && (
            <button
              type="button"
              onClick={() => setShowDetails(v => !v)}
              className="mt-1 text-xs font-medium text-sky-700 hover:underline"
            >
              {showDetails ? 'Hide details' : 'Show details'}
            </button>
          )}
          {showDetails && rest && <p className="mt-1 text-sm text-zinc-700">{rest}</p>}
        </div>
      </div>
      {canAnswer ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <textarea
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder="Type your answer…"
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
          />
          <button
            onClick={submit}
            disabled={state === 'saving' || !answer.trim()}
            className="shrink-0 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {state === 'saving' ? 'Saving…' : 'Save answer'}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">Log in to answer.</p>
      )}
      {state === 'error' && <p className="mt-1 text-xs text-red-600">Could not save — try again.</p>}
    </div>
  )
}

function AnsweredQuestion({ question }: { question: ClientQuestion }) {
  const [expanded, setExpanded] = useState(false)
  const { summary: questionSummary } = splitQuestion(question.question)
  const answerText = question.answer ?? ''
  const { summary: answerSummary, rest: answerRest } = splitQuestion(answerText)

  return (
    <div className="rounded-xl border border-sky-200 bg-white p-4">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-start gap-2 text-left"
      >
        <span className="mt-0.5 shrink-0 text-emerald-600" aria-hidden>✓</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900">{topicHeadline(question.topic)}</p>
          <p className="mt-0.5 truncate text-xs text-zinc-500">{answerSummary}</p>
        </div>
        <span className="shrink-0 text-xs text-zinc-400">{expanded ? 'Hide' : 'Details'}</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
          <p className="text-sm text-zinc-700">{questionSummary}</p>
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <span className="font-medium">Answer:</span> {answerText}
            {answerRest && null /* full answer already shown in full above when expanded */}
            <span className="ml-2 text-[11px] text-emerald-700">
              {question.answeredAt ? new Date(question.answeredAt).toLocaleDateString() : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
```

(Drop the dead `answerRest` branch noise — `answerText` is already shown in full when expanded, so `splitQuestion` on the answer is only needed for the collapsed one-line summary. Remove the unused `answerRest` destructure and the `{answerRest && null}` line before committing; keep `answerSummary` for the collapsed row.)

- [ ] **Step 2: `npm run typecheck && npm test && npm run build`**

- [ ] **Step 3: commit, PR, merge on green**

```bash
git checkout -b feat/mohamed-questions-readability
git add components/mohamed/ClientQuestionsCard.tsx
git commit -m "Restructure /mohamed questions card: topic headlines, clamped body, collapsed answered rows"
git push -u origin feat/mohamed-questions-readability
gh pr create --title "..." --body "..."
gh pr merge --squash --delete-branch
```

---

## Final verification (after all 6 PRs merged)

- [ ] `vercel ls` — confirm latest prod deployment is `Ready`.
- [ ] `node scripts/mohamed-consistency-check.mjs` against prod — must print `50/50 passed`.
- [ ] `vercel logs <latest-prod-deployment-url>` — scan for unhandled rejections / 5xx introduced by this work; fix and ship a follow-up PR if found.
- [ ] Timing: re-run the `curl -w` timing loop from Task 2 Step 5 against the final prod state, report before/after.
- [ ] Report to the user: PR numbers, consistency result (N/50), before/after timing, anything unresolved.
- [ ] Invoke the `hub-progress-tracker` skill once at the end summarizing the shipped change (per `CLAUDE.md`'s "Client board" requirement) — not once per PR, since intermediate PRs are internal refactor steps toward one client-visible outcome.
