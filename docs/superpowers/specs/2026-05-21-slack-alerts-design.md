# automation-hub — Client-Facing Slack Alerts for Pipeline Failures

**Date:** 2026-05-21
**Status:** Design approved, ready for implementation plan

## Problem

Clients have zero visibility into automation failures unless they actively open
the Automation Hub. When a Kimedics → Salesforce sync fails, they only learn
about it from a one-off email, a meeting, or by noticing missing data
downstream. The team wants a dedicated Slack channel where non-technical
clients are notified in plain language whenever a real (i.e. unresolved)
failure happens, and where those notifications visibly resolve themselves as
the system recovers.

The channel must be intuitive for readers who do not know what
`sf_scrape_fields_error` means, who do not need to differentiate between
transient and persistent failures, and who should never feel they are reading
raw logs.

## Goals

1. Post a Slack alert (one message per failed job) whenever a pipeline error
   in `job_event_log` is **unresolved** at the time of the next cron tick —
   i.e. an error event with no successor recovery event for the same job.
2. When a previously-alerted failure later gets recovered (auto-retry,
   patch, manual rescrape), edit the original Slack message in place from
   red to green so the channel always reflects current state.
3. Use plain-English copy that names the practice, names the likely cause,
   and tells the reader what happens next. Always link to (a) the Kimedics
   job, (b) the Salesforce record (when one exists), and (c) the Automation
   Hub.
4. Live entirely inside the `automation-hub` repo. No changes to
   `proxi_salesforce_automation` for v1.
5. Idempotent under cron retries and partial failures. Never duplicate
   alerts.

## Non-goals (v1)

- Daily / weekly digest reports. Errors only for v1.
- Multi-channel routing (per-client, per-automation, per-severity).
  Single channel for v1.
- Backfilling historical failures. Only failures observed from deploy
  forward (with a 24h lookback grace window) trigger alerts.
- Deleting Slack messages that turn out to be spammy or wrong. Manual
  cleanup in Slack if it happens.
- Acknowledge / mute interactions inside Slack. Out of scope.
- Unit/integration test infrastructure. Repo has none today; we ship the
  smoke-script pattern described in §6 and revisit if flakiness emerges.

## Architecture

```
Postgres (job_event_log)                    Slack Web API (bot token)
        │                                              ▲
        ▼                                              │
┌─────────────────────────────────────────────────┐    │
│  /api/cron/slack-alerts (Next.js, App Router)   │    │
│  Triggered by Vercel Cron every 10 min          │    │
│                                                 │────┘
│  Step 1: ensureSlackAlertsTable()               │
│  Step 2: post NEW unresolved failures           │
│  Step 3: edit RECOVERED failures to green       │
└─────────────────────────────────────────────────┘
        │
        ▼
Postgres (slack_alerts)
```

New code lives in four files:

- `app/api/cron/slack-alerts/route.ts` — the cron route. Auth-gated.
- `lib/slack.ts` — thin `fetch` wrapper around `chat.postMessage` and
  `chat.update`. No Slack SDK dependency.
- `lib/alertCopy.ts` — curated `event_type → { title, body }` dictionary
  (the plain-English mapping) plus the `GENERIC_FALLBACK` constant.
- `lib/ensureSlackAlertsTable.ts` — lazy `CREATE TABLE IF NOT EXISTS` +
  index, gated by an in-memory `hasRun` flag.

Plus one new env-loading entry per env var (Vercel + `.env.local`) and one
new entry in `vercel.json` for the cron schedule.

The cron is stateless between ticks. All "did we tell the client about this
yet?" state lives in the `slack_alerts` table.

## Data model

A new table, owned by this repo, created lazily by the cron route:

```sql
CREATE TABLE IF NOT EXISTS slack_alerts (
  id              BIGSERIAL PRIMARY KEY,

  -- What failed
  job_id          TEXT       NOT NULL,
  event_type      TEXT       NOT NULL,
  source_event_id BIGINT     NOT NULL,
  automation      TEXT       NOT NULL DEFAULT 'kimedics_sf_pipeline',

  -- Slack identifiers
  channel         TEXT       NOT NULL,
  message_ts      TEXT       NOT NULL,

  -- Lifecycle
  posted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     TEXT,

  UNIQUE (job_id, event_type, source_event_id)
);

CREATE INDEX IF NOT EXISTS idx_slack_alerts_open
  ON slack_alerts (job_id, event_type)
  WHERE resolved_at IS NULL;
```

Notes:

- `source_event_id` references `job_event_log.id` — the exact error row we
  alerted on. Required for recovery detection (we need to know which event
  the alert was about).
- `(job_id, event_type, source_event_id)` is the dedupe key.
- `channel` is stored per row even though there is one channel today. Future
  multi-channel routing becomes a config change, not a schema change.
- `automation` defaults to `kimedics_sf_pipeline`. Future automations slot in
  with no migration.
- Partial index on open alerts keeps the recovery-check query cheap.

**Migration approach:** the repo has no migration tool. `ensureSlackAlertsTable()`
runs the `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` on
first invocation per process, then short-circuits on subsequent calls via an
in-memory `hasRun` boolean. Same pattern as the Python repo's
`ensure_tables` helper. If schema evolves later, we add a small numbered
migration runner; not needed for v1.

## Cron logic

Each tick:

### Step 1 — Ensure schema and clean stuck placeholders

```ts
await ensureSlackAlertsTable() // no-op after first call
```

Then a single janitor query removes any placeholder rows that never got
their real `message_ts` (e.g. process crashed between INSERT and Slack
response):

```sql
DELETE FROM slack_alerts
WHERE message_ts = 'PENDING'
  AND posted_at  < now() - interval '5 minutes';
```

Five minutes is well beyond any realistic Slack API + retry window, so a
PENDING row that old is definitively orphaned. The next tick will then
re-evaluate the source event normally.

### Step 2 — Post new unresolved failures

Query:

```sql
SELECT
  err.id              AS source_event_id,
  err.job_id,
  err.event_type,
  err.event_data,
  err.created_at,
  jc.practice_value,
  jc.job_title,
  jc.sf_job_id,
  es.view_job_link    AS kimedics_link
FROM job_event_log err
LEFT JOIN LATERAL (
  SELECT practice_value, job_title, sf_job_id, email_scrape_id
  FROM job_content
  WHERE job_id = err.job_id
  ORDER BY created_at DESC
  LIMIT 1
) jc ON TRUE
LEFT JOIN email_scrapes es ON es.id = jc.email_scrape_id
WHERE err.event_type IN (
        'sf_scrape_fields_error',
        'sf_mapping_pull_failed',
        'job_create_failed',
        'worksite_create_failed'
      )
  AND err.created_at >= now() - interval '24 hours'
  AND NOT EXISTS (
    SELECT 1 FROM job_event_log ok
    WHERE ok.job_id    = err.job_id
      AND ok.created_at >= err.created_at
      AND ok.event_type IN (
        'sf_scrape_fields_patched',
        'sf_scrape_fields_recovered',
        'job_created_in_salesforce',
        'manual_rescrape_completed',
        'auto_retry_completed'
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM slack_alerts sa
    WHERE sa.source_event_id = err.id
  )
ORDER BY err.created_at ASC
LIMIT 50;
```

For each row, in order:

1. `INSERT INTO slack_alerts (job_id, event_type, source_event_id, channel,
   message_ts) VALUES (..., 'PENDING') ON CONFLICT DO NOTHING RETURNING id`.
   If nothing returned, another tick beat us — skip.
2. Call `chat.postMessage` with the rendered blocks (see §5).
3. On Slack success: `UPDATE slack_alerts SET message_ts = $1 WHERE id = $2`.
4. On Slack failure: `DELETE FROM slack_alerts WHERE id = $1` so the next
   tick can retry cleanly. Log the error and continue with the next row.
5. Throttle `await sleep(1100)` between rows to stay under Slack's 1
   msg/sec posting limit.

The 24-hour lookback caps work per tick at ~50 alerts (also a hard cap in
the `LIMIT` and an explicit `MAX_ALERTS_PER_TICK = 50` constant in code).
Anything older is the admin's job, not a fresh alert. Already-resolved
errors are excluded by the `NOT EXISTS` recovery clause.

### Step 3 — Edit recovered failures to green

Query:

```sql
SELECT
  sa.id,
  sa.job_id,
  sa.event_type,
  sa.channel,
  sa.message_ts,
  sa.source_event_id,
  ok.event_type AS recovery_event_type,
  ok.created_at AS recovered_at,
  jc.practice_value,
  jc.job_title,
  jc.sf_job_id,
  es.view_job_link AS kimedics_link
FROM slack_alerts sa
JOIN LATERAL (
  SELECT event_type, created_at
  FROM job_event_log
  WHERE job_id = sa.job_id
    AND id     > sa.source_event_id
    AND event_type IN (
      'sf_scrape_fields_patched',
      'sf_scrape_fields_recovered',
      'job_created_in_salesforce',
      'manual_rescrape_completed',
      'auto_retry_completed'
    )
  ORDER BY created_at ASC
  LIMIT 1
) ok ON TRUE
LEFT JOIN LATERAL (
  SELECT practice_value, job_title, sf_job_id, email_scrape_id
  FROM job_content
  WHERE job_id = sa.job_id
  ORDER BY created_at DESC
  LIMIT 1
) jc ON TRUE
LEFT JOIN email_scrapes es ON es.id = jc.email_scrape_id
WHERE sa.resolved_at IS NULL;
```

For each row:

1. Call `chat.update(channel, message_ts, ...)` with the green blocks
   (§5).
2. On success: `UPDATE slack_alerts SET resolved_at = now(), resolved_by =
   $1 WHERE id = $2`, where `resolved_by` is derived from
   `recovery_event_type` (`auto_retry`, `manual_recovery`, `patched`, etc.).
3. On Slack failure: log and continue. The row stays unresolved and we
   retry next tick.

No lookback bound here — the set of unresolved alerts is small (open
alerts only) so we always sweep the full set.

### Bounds and guards

- `MAX_ALERTS_PER_TICK = 50`. Logged warning if hit.
- Per-row `try/catch`. One bad row never blocks the rest.
- All Slack calls share a single `slackRequest()` helper with a 10s timeout.
- Cron route always returns 200 with a JSON summary so Vercel's cron log
  shows the per-tick outcome even when individual calls failed:

  ```json
  {
    "ticked_at": "2026-05-21T13:10:00.123Z",
    "new_alerts_posted": 3,
    "recoveries_edited": 1,
    "errors": [
      { "stage": "post", "job_id": "19596", "reason": "slack:rate_limited" }
    ]
  }
  ```

## Slack message format and content

### Initial alert (red)

```
🔴 *Job stuck in sync — Acme Health (Cardiology)*

A new job was received from Kimedics but couldn't be saved into Salesforce.
Most likely cause: the practice page didn't load (login wall / page change).

_What happens next:_ the system will automatically retry every 10 min.
If it's still red after an hour, the team has been paged.

Kimedics job_id: `19596` · Received 9:14 AM ET

<kimedics_link|Open in Kimedics>  ·  <sf_link|Open in Salesforce>  ·  <hub_link|View in Automation Hub →>
```

### Resolved (green) — same message, edited in place

```
✅ *Resolved — Acme Health (Cardiology)*

This job is now successfully saved in Salesforce.

Kimedics job_id: `19596` · Recovered 9:34 AM ET (20 min after first failure)

<kimedics_link|Open in Kimedics>  ·  <sf_link|Open in Salesforce>  ·  <hub_link|View in Automation Hub →>
```

### Block Kit shape

```ts
{
  channel: SLACK_CHANNEL_ID,
  text: `${headlineFallback}`, // notification fallback
  blocks: [
    { type: 'section', text: { type: 'mrkdwn', text: HEADLINE_LINE } },
    { type: 'section', text: { type: 'mrkdwn', text: BODY_LINES } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: LINKS_LINE }] },
  ],
}
```

Color is conveyed via the leading emoji (`🔴` / `✅`) and the headline
word (`Job stuck in sync` / `Resolved`). No `attachments` API — Slack has
been steering away from it, and the emoji conveys urgency well enough for
non-technical readers.

### Plain-English copy dictionary

`lib/alertCopy.ts`:

```ts
export const ERROR_COPY: Record<string, { title: string; body: string }> = {
  worksite_create_failed: {
    title: 'Job stuck in sync',
    body:
      "A new job was received from Kimedics but couldn't be saved into Salesforce.\n" +
      "Most likely cause: the practice page didn't load (login wall / page change).",
  },
  job_create_failed: {
    title: 'Job stuck in sync',
    body:
      "A new job was received from Kimedics but couldn't be saved into Salesforce.\n" +
      "Most likely cause: the worksite for this practice couldn't be created automatically.",
  },
  sf_scrape_fields_error: {
    title: 'Field update failed',
    body:
      "A job is in Salesforce, but one of the field updates didn't go through.\n" +
      "The system will retry; usually this clears itself on the next run.",
  },
  sf_mapping_pull_failed: {
    title: 'Salesforce mapping unavailable',
    body:
      "We couldn't read Salesforce's field mappings, so updates are paused.\n" +
      "Most likely cause: Salesforce was temporarily unreachable.",
  },
}

export const GENERIC_FALLBACK = {
  title: 'Sync issue',
  body:
    'The system encountered an unexpected problem with this job.\n' +
    'The team has been notified and is looking into it.',
}
```

`getAlertCopy(eventType)` returns the matching entry or `GENERIC_FALLBACK`.
A new error event type lands → we still post a sensible message instead of
crashing, but the dictionary stays the canonical surface for client wording.

### Link construction

| Link | Source | Always present? |
|---|---|---|
| Kimedics | `email_scrapes.view_job_link`, joined via `job_content.email_scrape_id` | Yes when `job_content` has matched the failing `job_id` to its source email scrape. Omitted if the join is empty (rare). |
| Salesforce | `${SALESFORCE_INSTANCE_URL}/lightning/r/Job__c/${sf_job_id}/view` | Only when `sf_job_id` is non-null. Omitted for `worksite_create_failed` / `job_create_failed` where no SF record was created. |
| Automation Hub | `${DASHBOARD_BASE_URL}/admin/recovery` | Yes. |

Headline degrades when join data is missing: practice + job title preferred,
falling back to `(job_id <id>)` if `job_content` has no row yet.

### Resolved-state copy variants

The recovery event type determines the green-state body:

| `recovery_event_type` | Body line |
|---|---|
| `job_created_in_salesforce` | "This job is now successfully saved in Salesforce." |
| `sf_scrape_fields_patched` | "All fields are now synced to Salesforce." |
| `sf_scrape_fields_recovered` | "The automatic recovery succeeded. All fields are now synced." |
| `manual_rescrape_completed` | "A team member fixed this manually. The job is now synced." |
| `auto_retry_completed` | "The retry succeeded. The job is now synced." |

## Auth and secrets

Vercel Project Settings → Environment Variables. Same names in
`.env.local`. **No values committed anywhere.**

| Var | Purpose |
|---|---|
| `SLACK_BOT_TOKEN` | `xoxb-…`. Scopes: `chat:write`, `chat:write.public`. Used as bearer token for all Slack API calls. |
| `SLACK_ALERT_CHANNEL_ID` | Slack channel id (`C…`). Stored as **id**, not name — channels can be renamed. |
| `CRON_SECRET` | Random hex string. Vercel Cron sends it as the `Authorization: Bearer …` header. Route rejects everything else with 401. |
| `DASHBOARD_BASE_URL` | e.g. `https://automation-hub-rosy.vercel.app`. Used to build the "View in Automation Hub" link. No trailing slash. |
| `SALESFORCE_INSTANCE_URL` | Org base URL, e.g. `https://proxi.lightning.force.com`. Used to build per-record SF links. No trailing slash. |

Route auth:

```ts
const auth = req.headers.get('authorization')
if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
  return new Response('Unauthorized', { status: 401 })
}
```

Vercel cron config (`vercel.json`):

```json
{
  "crons": [
    { "path": "/api/cron/slack-alerts", "schedule": "*/10 * * * *" }
  ]
}
```

Vercel automatically signs cron requests with `CRON_SECRET` when the env var
is named exactly that. The route's auth check enforces it.

## Failure handling and idempotence

**Per-row insert/post ordering.** Insert the placeholder row first (under
the unique constraint), then post to Slack. If Slack fails, delete the
placeholder so the next tick can retry. If two cron invocations overlap,
the unique constraint guarantees only one wins the insert.

**Slack API errors.**

- `429`: respect `Retry-After`, but we shouldn't hit this given the 1-msg/sec
  throttle and 50-alert cap. If we do anyway: rollback placeholder, log,
  retry next tick.
- `5xx`: same rollback; retry next tick.
- `channel_not_found`, `not_in_channel`, `invalid_auth`: log loudly, do **not**
  rollback (don't want infinite retries on a config error). Surface in the
  route response so it's visible in Vercel logs.

**Cron retries.** Vercel retries on non-2xx. Because all state lives in
`slack_alerts` keyed on `source_event_id`, retries are safe.

**Race with the pipeline.** Recovery event landing mid-tick is acceptable:
worst case we alert and then immediately edit green on the next tick. Net
state is correct.

**Observability.** Route returns a JSON summary every tick (see §3).
`console.error` for per-row failures includes `job_id` + `event_type`.
Vercel's cron log surfaces both. No metrics infra for v1.

## Testing and dev setup

The repo has no test infrastructure. We rely on:

### Dev channel

A second Slack channel in the same workspace (`#automation-hub-alerts-dev`)
with the same bot invited. `.env.local` points
`SLACK_ALERT_CHANNEL_ID` at the dev channel; Vercel Production keeps the
real channel. Same bot token works for both.

### Smoke script — `scripts/test-slack-alert.ts`

A one-shot script that:

1. Loads `.env.local`.
2. Calls `postFailureAlert(...)` with a fake failure payload.
3. Logs the returned `ts`.
4. Sleeps 5 seconds.
5. Calls `editAlertToResolved(channel, ts, ...)`.

Run with `npx tsx scripts/test-slack-alert.ts`. Expected: red message
appears, turns green 5s later. Confirms auth, message format, and the
edit-in-place flow without touching the DB or the cron.

### End-to-end verification

1. Deploy to a Vercel preview branch with `SLACK_ALERT_CHANNEL_ID` pointing
   to the dev channel.
2. `curl -H "Authorization: Bearer $CRON_SECRET" https://<preview>/api/cron/slack-alerts`.
3. Inspect JSON response and the dev channel.
4. If no current unresolved failures exist, insert a test event:

   ```sql
   INSERT INTO job_event_log (job_id, event_type, event_data, created_at)
   VALUES ('TEST-1', 'worksite_create_failed', '{"error":"test"}'::jsonb, now());
   ```

   Re-trigger the cron, verify a red message in the dev channel.
5. Insert a recovery event:

   ```sql
   INSERT INTO job_event_log (job_id, event_type, event_data, created_at)
   VALUES ('TEST-1', 'job_created_in_salesforce', '{}'::jsonb, now());
   ```

   Re-trigger the cron, verify the message turns green.
6. Clean up: delete the test rows from `job_event_log` and
   `slack_alerts`.

## Pre-prod checklist

- [ ] Bot installed in client workspace, invited to client channel.
- [ ] `SLACK_BOT_TOKEN`, `SLACK_ALERT_CHANNEL_ID`, `CRON_SECRET`,
      `DASHBOARD_BASE_URL`, `SALESFORCE_INSTANCE_URL` set in Vercel Production
      and `.env.local`.
- [ ] `vercel.json` cron entry deployed.
- [ ] Dev-channel end-to-end run produced both a red message and a green
      edit on the same Slack message.
- [ ] First production tick observed in Vercel cron logs without errors.
- [ ] One real unresolved-failure cycle observed end-to-end before the
      client is told the channel is "live."

## Out of scope (deliberately deferred)

- Daily / weekly digest reports of overall pipeline health. Will be a
  follow-up spec once the failure-alert channel has been live for a week
  and we know what cadence clients actually want.
- Multi-channel routing per client or per automation.
- Slack interactivity (acknowledge buttons, mute, snooze).
- Replacing the existing alert-emails system in `proxi_salesforce_automation`.
  Both run in parallel for v1; we revisit consolidation once Slack has
  proven itself.
- Threaded per-failure details under a summary message (rejected in
  brainstorming — flat one-message-per-failure won).
