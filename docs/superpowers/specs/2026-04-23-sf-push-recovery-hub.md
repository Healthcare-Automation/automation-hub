# automation-hub — SF Push Recovery Integration

**Date:** 2026-04-23
**Status:** Design approved, ready for implementation plan
**Companion spec:** `../../proxi_salesforce_automation/docs/superpowers/specs/2026-04-23-sf-push-recovery-design.md`

## Problem

The Proxi Salesforce automation is gaining a push-recovery engine that retries failed
Salesforce PATCHes via re-parse / re-scrape / field-drop and writes new
`job_event_log` rows indicating recovery outcomes. The hub currently does not
recognize these new event types, and its `sfErrors` aggregate keeps counting
errors that have since been resolved. This makes the run page misleading: the
data is in Salesforce, but the run still shows red.

## Goals

1. Recognize three new `job_event_log` event types:
   - `sf_scrape_fields_recovered` — a previously-failed push succeeded via the
     recovery engine.
   - `sf_field_quarantined` — one specific field was dropped so the rest of the
     row could land; the dropped field needs a parser fix.
   - `sf_push_unhandled_error` — the recovery engine did not recognize the error
     class; requires human attention.
2. Stop counting resolved errors toward `sfErrors` so a recovered run visually
   turns green.
3. Surface recovery and quarantine counts as first-class metrics on the run
   card, the day bar, and the validation timeline.
4. No schema change to existing tables. No breaking changes for old payloads.

## Non-goals

- Implementing the recovery engine itself (that lives in `proxi_salesforce_automation`).
- Changing existing event type semantics. All existing types (`sf_scrape_fields_patched`,
  `sf_scrape_fields_error`, etc.) keep their current meaning.
- New pages or navigation structure. All changes are refinements to existing
  components.

## Event-type contract (from the automation)

Rows always carry `run_id = original_error.run_id` so they land on the failing
run's page. Shapes summarized here; full schemas in the companion spec.

### `sf_scrape_fields_recovered`
Single row per recovered job. Payload has the same `prev`, `next`,
`fields_pushed`, `sf_job_id` keys as `sf_scrape_fields_patched`, so
`components/SfFieldCompared.tsx` works unchanged.

Additional keys:
- `recovered_from_event_id: number` — the `sf_scrape_fields_error` row this resolves.
- `action: "re_parsed" | "re_scraped" | "field_dropped" | "transient_retried"`.
- `offending_fields: string[]`.
- `invocation: "modal_auto" | "manual_cli"`.
- `invoker: string` — free-form audit string.
- `recovery_run_id: number` — the run that performed the fix.
- `parser_version: string` — short git SHA.

### `sf_field_quarantined`
One row per dropped field:
- `field: string` — SF API name.
- `bad_value: string` — the rejected value.
- `sibling_values: Record<string, string>`.
- `scrape_url: string | null`.
- `parser_version: string`.
- `heuristic_fired: string` — which check flagged the value.
- `recovered_from_event_id: number`.
- `sf_error: string`.

### `sf_push_unhandled_error`
- `error: string` — the original SF error verbatim.
- `recovered_from_event_id: number`.
- `attempt: Record<string, any>` — the PATCH body that failed.

## Files to change

### 1. `lib/mergeSalesforceFieldEvents.ts`

Add the three new types to `SF_FIELD_SYNC_EVENT_TYPES` so they flow through
`mergeSalesforceFieldSyncEvents` and `mergeTimelineEvents`:

```ts
export const SF_FIELD_SYNC_EVENT_TYPES = [
  'sf_sync_skipped_no_mapping',
  'sf_scrape_fields_skip',
  'sf_scrape_fields_error',
  'sf_scrape_fields_patched',
  'sf_scrape_fields_recovered', // new
  'sf_field_quarantined',       // new
  'sf_push_unhandled_error',    // new
] as const
```

### 2. `lib/queries.ts`

Three kinds of change: change the `sfErrors` aggregate to count only *unresolved*
errors, add `sfRecovered` and `sfQuarantined` aggregates, and widen the history
LATERAL so new types reach `ValidationPopup`.

#### 2a. Unresolved-only `sf_errors` aggregate

Apply everywhere the old aggregate appears: `getDailyStatus`, `getRecentRuns`,
and the weekly-summary `completed` filter (`runAggSql` inside `getWeeklySummary`).

```sql
count(DISTINCT jel.id) FILTER (
  WHERE jel.event_type IN ('sf_scrape_fields_error','sf_mapping_pull_failed')
    AND NOT EXISTS (
      SELECT 1 FROM job_event_log ok
      WHERE ok.job_id = jel.job_id
        AND ok.event_type IN ('sf_scrape_fields_patched','sf_scrape_fields_recovered')
        AND ok.created_at >= jel.created_at
    )
) AS sf_errors
```

And in `getWeeklySummary`'s `completed` clause:

```sql
AND NOT EXISTS (
  SELECT 1 FROM job_event_log e
  WHERE e.run_id = paired.batch_id
    AND e.event_type IN ('sf_scrape_fields_error', 'sf_mapping_pull_failed')
    AND NOT EXISTS (
      SELECT 1 FROM job_event_log ok
      WHERE ok.job_id = e.job_id
        AND ok.event_type IN ('sf_scrape_fields_patched','sf_scrape_fields_recovered')
        AND ok.created_at >= e.created_at
    )
)
```

Performance note: the NOT EXISTS runs against the same `(job_id, event_type, created_at)`
shape already indexed by `job_event_log_job_id_created_at` and
`job_event_log_event_type_created_at`. Expected to stay well under current query
budgets. If slow in practice, a daily materialized view `mv_unresolved_sf_errors`
is the fallback.

#### 2b. New aggregates

In `getDailyStatus` and `getRecentRuns` SELECTs, add:

```sql
count(DISTINCT jel.id) FILTER (WHERE jel.event_type = 'sf_scrape_fields_recovered') AS sf_recovered,
count(DISTINCT jel.id) FILTER (WHERE jel.event_type = 'sf_field_quarantined')       AS sf_quarantined,
```

And in `getRecentRuns`, a sibling `json_agg` for quarantined fields for tooltip
display:

```sql
(
  SELECT COALESCE(json_agg(DISTINCT q.payload->>'field'), '[]'::json)
  FROM job_event_log q
  WHERE q.run_id = p.batch_id
    AND q.event_type = 'sf_field_quarantined'
) AS sf_quarantined_fields
```

#### 2c. Widen `getValidationData`'s history filter

Inside the `ev_hist` LATERAL, extend the `IN (...)` list with the three new types
so the `ValidationPopup` timeline sees them:

```sql
AND jel.event_type IN (
  'mapping_cache_hit','sf_mapping_skipped','sf_mapping_pull_failed',
  'mapping_ambiguous','mapping_ai_match','mapping_no_match',
  'sf_ids_update',
  'job_created_in_salesforce','job_create_failed','job_create_skipped',
  'worksite_created','worksite_create_failed',
  'sf_sync_skipped_no_mapping','sf_scrape_fields_skip',
  'sf_scrape_fields_error','sf_scrape_fields_patched',
  'sf_scrape_fields_recovered','sf_field_quarantined','sf_push_unhandled_error',
  'job_current_sf_ids_changed','job_current_upsert'
)
```

Same addition goes inside the `ev_this` LATERAL where `run_id IS NULL` events
are pulled in by type.

### 3. `lib/types.ts`

```ts
export interface DayStatus {
  // ...existing
  sfRecovered: number     // new — informational badge
  sfQuarantined: number   // new — warning badge
}

export interface RunDetail {
  // ...existing
  sfRecoveredCount: number          // new
  sfQuarantinedCount: number        // new
  sfQuarantinedFields: string[]     // new — for tooltip: ["Job_Volume__c", ...]
}
```

### 4. `lib/mappingLabels.ts`

Add titles:

```ts
const LOG_EVENT_TITLES: Record<string, string> = {
  // ...existing
  sf_scrape_fields_recovered: 'Salesforce push recovered',
  sf_field_quarantined: 'Field quarantined (parser fix needed)',
  sf_push_unhandled_error: 'Salesforce push: unhandled error',
}
```

### 5. `lib/utils.ts` — `getDayStatusKind`

No change needed if `sfErrors` is already post-resolution. Double-check: a day
with `sfErrors === 0` and `sfRecovered > 0` returns `operational`, which is
correct. Add a comment documenting that `sfErrors` is the *unresolved* count,
not the raw error count.

### 6. `components/ValidationPopup.tsx` — timeline

Add three handlers inside `buildTimeline`, alongside the existing
`sf_scrape_fields_patched` and `sf_scrape_fields_error` branches:

```ts
if (type === 'sf_scrape_fields_recovered') {
  const action = String(e.payload?.action ?? 'recovered')
  const invocation = e.payload?.invocation === 'manual_cli' ? 'manual' : 'auto'
  const pushed = Array.isArray(e.payload?.fields_pushed) ? e.payload.fields_pushed.length : 0
  return {
    key: `ev_${e.id ?? ts}_${type}`,
    ts,
    kind: 'recovered' as const,            // new TimelineKind
    title: `Salesforce push recovered (${invocation} · ${action})`,
    subtitle: `${pushed} field${pushed !== 1 ? 's' : ''} landed in Salesforce`
            + (e.payload?.offending_fields?.length
               ? ` · offending: ${e.payload.offending_fields.join(', ')}`
               : ''),
    event: e,
  }
}
if (type === 'sf_field_quarantined') {
  return {
    key: `ev_${e.id ?? ts}_${type}`,
    ts,
    kind: 'skip' as const,
    title: `Field quarantined: ${e.payload?.field ?? '(unknown)'}`,
    subtitle: `Bad value: ${String(e.payload?.bad_value ?? '').slice(0, 80)}${
      (e.payload?.bad_value?.length ?? 0) > 80 ? '…' : ''
    } · heuristic: ${e.payload?.heuristic_fired ?? 'n/a'}`,
    event: e,
  }
}
if (type === 'sf_push_unhandled_error') {
  return {
    key: `ev_${e.id ?? ts}_${type}`,
    ts,
    kind: 'error' as const,
    title: 'Salesforce push: unhandled error class',
    subtitle: String(e.payload?.error ?? 'Unknown error'),
    event: e,
  }
}
```

Widen the `TimelineKind` union with `'recovered'` and give it a green/↻ icon
distinct from the blue `'sf'` patched icon.

### 7. Visual "resolved" marker

After the timeline is built, iterate once more to mark any
`sf_scrape_fields_error` that has a later `sf_scrape_fields_recovered` for the
same job with a `resolved: true` flag. Render the error row with muted color
and a "resolved →" chip linking to the recovery row. Exact link mechanism: same
DOM anchor pattern used for `sfPatchedIndex` (by event id).

### 8. `components/LayerBreakdown.tsx`

Next to the existing error badge, render:
- `↻ {sfRecoveredCount}` in emerald, with tooltip "Originally failed pushes that
  were re-pushed successfully."
- `⚠ {sfQuarantinedCount}` in amber, with tooltip listing
  `sfQuarantinedFields.join(', ')` and copy "Fields dropped from payload — parser fix needed."

### 9. `components/StatusBarChart.tsx`

Extend the day tooltip to include the new counts when > 0:

```tsx
{day.sfRecovered > 0 && (<Row label="Recovered" value={String(day.sfRecovered)} />)}
{day.sfQuarantined > 0 && (<Row label="Quarantined" value={String(day.sfQuarantined)} />)}
```

No change to bar color logic; the existing `getDayStatusKind` already returns
`operational` for fully-resolved days since `sfErrors` is now post-resolution.

## Testing

- Update snapshot-style tests (if any) for `ValidationPopup` to include a recovered
  event, a quarantined event, and an unhandled error.
- New `__tests__/queries-recovery.test.ts` (or existing pattern) that inserts a
  synthetic `sf_scrape_fields_error` followed by `sf_scrape_fields_recovered`
  and asserts `getDailyStatus().sfErrors === 0`, `sfRecovered === 1`.
- Manual smoke: run the automation's recovery engine against staging, open the
  run page, confirm: the original error row shows "resolved →" and links to the
  recovered row below it; the run card badge flipped from red to green.

## Admin layer (manual push UI)

A new admin-only area of the hub lets a human inspect unresolved SF push errors and
trigger manual recovery with one click. **This is the manual-push piece only** — the
automated Modal recovery runs independently and does not need this UI.

### Auth

Simple shared-secret auth. No new dependencies, no NextAuth, no disruption to the
public status page.

- New env var in the hub: `ADMIN_PASSWORD` (stored in Vercel project settings).
- New env var: `ADMIN_COOKIE_SECRET` (used to sign the session cookie).
- Middleware at `middleware.ts` guards `/admin/*` paths. If the signed session
  cookie is absent or invalid, redirect to `/admin/login`.
- Login page POSTs to `/api/admin/login` which checks the password against
  `ADMIN_PASSWORD` and sets an `HttpOnly`, `Secure`, `SameSite=Lax` session cookie
  (HMAC-signed with `ADMIN_COOKIE_SECRET`, 12-hour TTL).
- Logout at `/api/admin/logout` clears the cookie.

The cookie payload is just `{"admin": true, "exp": <unix>}`. We don't track users
individually — one role, one password, good enough for the internal hub.

### Routes

| Route | Purpose |
|---|---|
| `/admin/login` | Password form. POSTs to `/api/admin/login`. |
| `/admin/recovery` | Lists unresolved SF errors from the last 2 days (configurable via query param). Each row shows job_id, original error text, attempt payload (collapsible), and `Re-push` / `Re-push + re-scrape` / `Dry run` buttons. A top-of-page "Re-push all" button triggers recovery across the full list. |
| `/api/admin/login` | POST `{ password }` → sets cookie. |
| `/api/admin/logout` | POST → clears cookie. |
| `/api/admin/recovery/run` | POST `{ jobIds?: string[], sinceHours?: number, dryRun?: boolean }` → proxies to Modal recovery endpoint, streams results back. |

### Backend bridge

The hub is Next.js on Vercel; the recovery engine is Python on Modal. Bridge:

- The Python repo exposes a Modal **web endpoint** (`@modal.fastapi_endpoint`) that
  wraps `recover_recent_failures` and `recover_job_push` with token auth.
- Env vars shared between hub and Modal:
  - `MODAL_RECOVERY_ENDPOINT_URL` — full URL of the deployed endpoint.
  - `MODAL_RECOVERY_TOKEN` — bearer token for the endpoint; must match
    Modal secret `RECOVERY_ENDPOINT_TOKEN`.
- `/api/admin/recovery/run` POSTs to the Modal endpoint with
  `Authorization: Bearer <MODAL_RECOVERY_TOKEN>`. Timeout 120 s.

### UI design (intentionally minimal)

Zero new components where possible — reuse `Card`, `Button`, and existing badge
styles. One table, one form. Nothing on the main status page changes. The public
hub is unaware of the admin section.

### Non-disruption guarantees

- No changes to `/` or `/validation/*` or any public route.
- No new columns, no schema changes, no new tables.
- If `ADMIN_PASSWORD` or `MODAL_RECOVERY_ENDPOINT_URL` are unset, `/admin/*`
  returns 503 with "Admin features not configured" — never throws, never breaks
  the rest of the hub.

## Rollout

Ship additive changes first. In order:

1. Widen `SF_FIELD_SYNC_EVENT_TYPES` and `lib/queries.ts` `IN (...)` lists —
   safe even before any new rows exist.
2. Add `sfRecovered` / `sfQuarantined` aggregates and `types.ts` fields.
3. Change `sf_errors` to unresolved-only. Before automation ships, this is a
   no-op (no recovered events exist → same count as before).
4. Ship `ValidationPopup` and `LayerBreakdown` UI. Until automation ships, new
   branches simply never match → no visual difference.

This ordering lets the hub deploy independently without waiting for automation
and without any intermediate broken state.

## Risks / open items

- **NOT EXISTS cost.** `job_event_log` is not huge today but will grow. If the
  unresolved-error subquery becomes expensive, switch to a daily materialized
  view keyed by `(day, job_id)` refreshed nightly.
- **Two recovered events for the same job.** If the engine runs twice (e.g.,
  manual + auto), we could get two `sf_scrape_fields_recovered` rows. The
  `DISTINCT jel.id` aggregates handle this without double-counting for metrics,
  but the timeline will show both. Acceptable — they are distinct events; the
  newest should visually "dominate."
- **Older runs without a recovery event.** Historical `sf_scrape_fields_error`
  rows with no recovery still count toward `sfErrors` — which is correct. This
  surfaces the backlog the manual CLI exists to clear.
