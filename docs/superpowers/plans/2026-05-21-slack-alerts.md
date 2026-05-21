# Client-Facing Slack Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Vercel-cron-driven Slack alerter that posts unresolved Kimedics → Salesforce pipeline failures to a client channel in plain English and edits the same message green on recovery.

**Architecture:** A new Next.js API route (`/api/cron/slack-alerts`) is invoked every 10 min by Vercel Cron. Each tick (1) ensures a `slack_alerts` table exists, (2) queries `job_event_log` for unresolved failures we haven't alerted on yet and posts one Slack message per failure via `chat.postMessage`, and (3) finds previously-alerted failures that now have a recovery event and updates the original message to green via `chat.update`. All persistence state lives in `slack_alerts`; secrets live in env vars.

**Tech Stack:** Next.js 16 App Router, TypeScript, `postgres` (already in repo), `fetch` against `https://slack.com/api/*` (no SDK dep), Vercel Cron, Slack bot token with `chat:write` + `chat:write.public`.

**Spec:** `docs/superpowers/specs/2026-05-21-slack-alerts-design.md` — read it first.

**Testing reality:** The repo has no test framework. Per the spec, verification is done via a CLI smoke script (`scripts/test-slack-alert.ts`) that posts to a dev Slack channel, plus a manual end-to-end against the dev channel using `psql` to inject fake events. Each code task ends with a concrete verification command and expected output.

---

## File Map

**New files:**
- `lib/ensureSlackAlertsTable.ts` — lazy `CREATE TABLE IF NOT EXISTS` bootstrap.
- `lib/alertCopy.ts` — plain-English copy dictionary for error event types + resolved-state body map.
- `lib/slack.ts` — block-builder helpers + `slackRequest`, `postFailureAlert`, `editAlertToResolved`.
- `app/api/cron/slack-alerts/route.ts` — the cron route.
- `scripts/test-slack-alert.ts` — smoke script for posting/editing against a dev channel.
- `vercel.json` — cron schedule entry.

**Modified files:**
- `.env.local.example` — add documentation for five new env vars.

---

### Task 1: Document new env vars in `.env.local.example`

**Files:**
- Modify: `.env.local.example`

- [ ] **Step 1: Append the new env-var section to the example file**

Open `.env.local.example` and append below the existing `DATABASE_URL` block:

```bash

# ─── Slack alerts ─────────────────────────────────────────────
# Slack bot token (xoxb-…). Scopes required: chat:write, chat:write.public.
# Create at api.slack.com/apps, install to workspace, invite bot to the channel.
SLACK_BOT_TOKEN=

# Slack channel id (C…). Stored as id (not name) so renames don't break the integration.
# Right-click channel in Slack → View channel details → bottom of pane.
SLACK_ALERT_CHANNEL_ID=

# Shared secret between Vercel Cron and the cron route. Generate with:
#   openssl rand -hex 32
# Vercel auto-injects this as the Authorization header when the env var name is exactly CRON_SECRET.
CRON_SECRET=

# Base URL of the deployed Automation Hub (no trailing slash). Used to build the "View in Automation Hub" link.
DASHBOARD_BASE_URL=https://automation-hub-rosy.vercel.app

# Salesforce org base URL (no trailing slash). Used to build per-record SF links.
# Example: https://proxi.lightning.force.com
SALESFORCE_INSTANCE_URL=
```

- [ ] **Step 2: Verify the file parses as shell-style key=value**

Run: `grep -E '^[A-Z_]+=' .env.local.example`
Expected: lists every var (one per line) including the five new ones. No syntax errors.

- [ ] **Step 3: Commit**

```bash
git add .env.local.example
git commit -m "docs: document Slack alert env vars in .env.local.example"
```

---

### Task 2: Create `lib/ensureSlackAlertsTable.ts`

**Files:**
- Create: `lib/ensureSlackAlertsTable.ts`

- [ ] **Step 1: Write the module**

Create `lib/ensureSlackAlertsTable.ts` with this exact content:

```ts
import sql from '@/lib/db'

let hasRun = false

/**
 * Lazy schema bootstrap for the slack_alerts table. First call in a given
 * process runs the CREATE TABLE / CREATE INDEX (both IF NOT EXISTS so they're
 * idempotent against an already-provisioned DB); subsequent calls short-circuit
 * via an in-memory flag.
 *
 * Mirrors the pattern used by proxi_salesforce_automation's ensure_tables
 * helper since this repo has no migration runner.
 */
export async function ensureSlackAlertsTable(): Promise<void> {
  if (hasRun) return
  await sql`
    CREATE TABLE IF NOT EXISTS slack_alerts (
      id              BIGSERIAL PRIMARY KEY,
      job_id          TEXT       NOT NULL,
      event_type      TEXT       NOT NULL,
      source_event_id BIGINT     NOT NULL,
      automation      TEXT       NOT NULL DEFAULT 'kimedics_sf_pipeline',
      channel         TEXT       NOT NULL,
      message_ts      TEXT       NOT NULL,
      posted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at     TIMESTAMPTZ,
      resolved_by     TEXT,
      UNIQUE (job_id, event_type, source_event_id)
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS idx_slack_alerts_open
      ON slack_alerts (job_id, event_type)
      WHERE resolved_at IS NULL
  `
  hasRun = true
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/ensureSlackAlertsTable.ts
git commit -m "feat(slack-alerts): lazy bootstrap for slack_alerts table"
```

---

### Task 3: Create `lib/alertCopy.ts`

**Files:**
- Create: `lib/alertCopy.ts`

- [ ] **Step 1: Write the module**

Create `lib/alertCopy.ts` with this exact content:

```ts
/**
 * Client-facing plain-English copy for pipeline error event types. This is the
 * canonical surface for what non-technical clients read in Slack. Keep wording
 * concrete and human; never expose raw event type identifiers.
 */

export type AlertCopy = { title: string; body: string }

export const ERROR_COPY: Record<string, AlertCopy> = {
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
      'A job is in Salesforce, but one of the field updates ' +
      "didn't go through.\n" +
      'The system will retry; usually this clears itself on the next run.',
  },
  sf_mapping_pull_failed: {
    title: 'Salesforce mapping unavailable',
    body:
      "We couldn't read Salesforce's field mappings, so updates are paused.\n" +
      'Most likely cause: Salesforce was temporarily unreachable.',
  },
}

export const GENERIC_FALLBACK: AlertCopy = {
  title: 'Sync issue',
  body:
    'The system encountered an unexpected problem with this job.\n' +
    'The team has been notified and is looking into it.',
}

export function getAlertCopy(eventType: string): AlertCopy {
  return ERROR_COPY[eventType] ?? GENERIC_FALLBACK
}

/**
 * Body shown on a resolved (green) Slack message, keyed by the recovery
 * event type that caused us to flip the alert. Falls back to a generic
 * "now synced" line if a new recovery event lands without a copy entry.
 */
export const RESOLVED_BODY: Record<string, string> = {
  job_created_in_salesforce: 'This job is now successfully saved in Salesforce.',
  sf_scrape_fields_patched: 'All fields are now synced to Salesforce.',
  sf_scrape_fields_recovered:
    'The automatic recovery succeeded. All fields are now synced.',
  manual_rescrape_completed:
    'A team member fixed this manually. The job is now synced.',
  auto_retry_completed: 'The retry succeeded. The job is now synced.',
}

export const RESOLVED_FALLBACK = 'This job is now synced to Salesforce.'

export function getResolvedBody(recoveryEventType: string): string {
  return RESOLVED_BODY[recoveryEventType] ?? RESOLVED_FALLBACK
}

/**
 * Maps the recovery event type to a short tag we store in slack_alerts.resolved_by.
 * Lets ops queries explain *why* an alert flipped without re-joining job_event_log.
 */
export function getResolvedByTag(recoveryEventType: string): string {
  switch (recoveryEventType) {
    case 'manual_rescrape_completed':
      return 'manual_recovery'
    case 'sf_scrape_fields_patched':
      return 'patched'
    case 'sf_scrape_fields_recovered':
      return 'recovered'
    case 'auto_retry_completed':
    case 'job_created_in_salesforce':
      return 'auto_retry'
    default:
      return 'other'
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/alertCopy.ts
git commit -m "feat(slack-alerts): plain-English copy dictionary for client alerts"
```

---

### Task 4: Create `lib/slack.ts` (block renderers + API wrappers)

**Files:**
- Create: `lib/slack.ts`

- [ ] **Step 1: Write the module**

Create `lib/slack.ts` with this exact content:

```ts
import {
  getAlertCopy,
  getResolvedBody,
  type AlertCopy,
} from '@/lib/alertCopy'

const SLACK_API = 'https://slack.com/api'

export type FailurePayload = {
  jobId: string
  eventType: string
  practice: string | null
  jobTitle: string | null
  sfJobId: string | null
  kimedicsLink: string | null
  receivedAt: Date
}

export type RecoveryPayload = {
  jobId: string
  eventType: string
  recoveryEventType: string
  practice: string | null
  jobTitle: string | null
  sfJobId: string | null
  kimedicsLink: string | null
  failedAt: Date
  recoveredAt: Date
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

function dashboardLink(): string {
  const base = requireEnv('DASHBOARD_BASE_URL').replace(/\/$/, '')
  return `${base}/admin/recovery`
}

function salesforceLink(sfJobId: string | null): string | null {
  if (!sfJobId) return null
  const base = requireEnv('SALESFORCE_INSTANCE_URL').replace(/\/$/, '')
  return `${base}/lightning/r/Job__c/${sfJobId}/view`
}

function formatTimeET(d: Date): string {
  // Slack messages are read by clients in ET; format consistently regardless
  // of where the cron runs.
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d) + ' ET'
}

function formatDurationMinutes(fromMs: number, toMs: number): string {
  const minutes = Math.max(1, Math.round((toMs - fromMs) / 60000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`
}

function headlineSubject(practice: string | null, jobTitle: string | null, jobId: string): string {
  if (practice && jobTitle) return `${practice} (${jobTitle})`
  if (practice) return practice
  if (jobTitle) return jobTitle
  return `(job_id ${jobId})`
}

function linksLine(opts: {
  kimedicsLink: string | null
  sfJobId: string | null
}): string {
  const parts: string[] = []
  if (opts.kimedicsLink) parts.push(`<${opts.kimedicsLink}|Open in Kimedics>`)
  const sf = salesforceLink(opts.sfJobId)
  if (sf) parts.push(`<${sf}|Open in Salesforce>`)
  parts.push(`<${dashboardLink()}|View in Automation Hub →>`)
  return parts.join('  ·  ')
}

export function buildFailureBlocks(p: FailurePayload): {
  text: string
  blocks: unknown[]
} {
  const copy: AlertCopy = getAlertCopy(p.eventType)
  const subject = headlineSubject(p.practice, p.jobTitle, p.jobId)
  const headline = `🔴 *${copy.title} — ${subject}*`
  const body =
    `${copy.body}\n\n_What happens next:_ the system will automatically retry every 10 min. ` +
    `If it's still red after an hour, the team has been paged.`
  const meta = `Kimedics job_id: \`${p.jobId}\` · Received ${formatTimeET(p.receivedAt)}`
  const links = linksLine({ kimedicsLink: p.kimedicsLink, sfJobId: p.sfJobId })
  return {
    text: `${copy.title} — ${subject}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: headline } },
      { type: 'section', text: { type: 'mrkdwn', text: body } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `${meta}\n${links}` }] },
    ],
  }
}

export function buildResolvedBlocks(p: RecoveryPayload): {
  text: string
  blocks: unknown[]
} {
  const subject = headlineSubject(p.practice, p.jobTitle, p.jobId)
  const headline = `✅ *Resolved — ${subject}*`
  const body = getResolvedBody(p.recoveryEventType)
  const elapsed = formatDurationMinutes(p.failedAt.getTime(), p.recoveredAt.getTime())
  const meta =
    `Kimedics job_id: \`${p.jobId}\` · Recovered ${formatTimeET(p.recoveredAt)} ` +
    `(${elapsed} after first failure)`
  const links = linksLine({ kimedicsLink: p.kimedicsLink, sfJobId: p.sfJobId })
  return {
    text: `Resolved — ${subject}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: headline } },
      { type: 'section', text: { type: 'mrkdwn', text: body } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `${meta}\n${links}` }] },
    ],
  }
}

async function slackRequest(
  method: 'chat.postMessage' | 'chat.update',
  payload: Record<string, unknown>,
): Promise<{ ts: string; channel: string }> {
  const token = requireEnv('SLACK_BOT_TOKEN')
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(`${SLACK_API}/${method}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
    const json = (await res.json()) as { ok: boolean; ts?: string; channel?: string; error?: string }
    if (!json.ok) throw new Error(`slack:${json.error ?? 'unknown'}`)
    return { ts: json.ts ?? '', channel: json.channel ?? '' }
  } finally {
    clearTimeout(timeout)
  }
}

export async function postFailureAlert(
  channelId: string,
  payload: FailurePayload,
): Promise<{ ts: string }> {
  const { text, blocks } = buildFailureBlocks(payload)
  const res = await slackRequest('chat.postMessage', { channel: channelId, text, blocks })
  return { ts: res.ts }
}

export async function editAlertToResolved(
  channelId: string,
  messageTs: string,
  payload: RecoveryPayload,
): Promise<void> {
  const { text, blocks } = buildResolvedBlocks(payload)
  await slackRequest('chat.update', { channel: channelId, ts: messageTs, text, blocks })
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/slack.ts
git commit -m "feat(slack-alerts): slack API wrapper and block renderers"
```

---

### Task 5: Smoke script — `scripts/test-slack-alert.ts`

**Files:**
- Create: `scripts/test-slack-alert.ts`

This task assumes you've created a `#automation-hub-alerts-dev` channel in your Slack workspace, invited the bot to it, and set `SLACK_BOT_TOKEN` + `SLACK_ALERT_CHANNEL_ID` (pointing at the dev channel) + `DASHBOARD_BASE_URL` + `SALESFORCE_INSTANCE_URL` in `.env.local`.

- [ ] **Step 1: Write the script**

Create `scripts/test-slack-alert.ts`:

```ts
/**
 * One-shot smoke test for the Slack alert pipeline. Posts a fake failure
 * message to the channel set in SLACK_ALERT_CHANNEL_ID, waits 5 seconds,
 * then edits the same message to the green resolved state.
 *
 * Run from the repo root:
 *   npx tsx scripts/test-slack-alert.ts
 *
 * Verifies the bot token, channel id, block layout, and the edit-in-place
 * flow without touching the database.
 */

import { config } from 'dotenv'
import {
  postFailureAlert,
  editAlertToResolved,
  type FailurePayload,
  type RecoveryPayload,
} from '@/lib/slack'

config({ path: '.env.local' })

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

async function main(): Promise<void> {
  const channel = requireEnv('SLACK_ALERT_CHANNEL_ID')

  const failedAt = new Date()
  const failure: FailurePayload = {
    jobId: 'TEST-' + Date.now(),
    eventType: 'worksite_create_failed',
    practice: 'Acme Health',
    jobTitle: 'Cardiology',
    sfJobId: null,
    kimedicsLink: 'https://app.kimedics.com/jobs/12345',
    receivedAt: failedAt,
  }

  console.log(`Posting fake failure to channel ${channel}…`)
  const { ts } = await postFailureAlert(channel, failure)
  console.log(`  → posted, ts=${ts}`)

  await new Promise(r => setTimeout(r, 5000))

  const recovery: RecoveryPayload = {
    jobId: failure.jobId,
    eventType: failure.eventType,
    recoveryEventType: 'job_created_in_salesforce',
    practice: failure.practice,
    jobTitle: failure.jobTitle,
    sfJobId: 'a01UP00000TESTABC',
    kimedicsLink: failure.kimedicsLink,
    failedAt,
    recoveredAt: new Date(),
  }

  console.log('Editing same message to green…')
  await editAlertToResolved(channel, ts, recovery)
  console.log('  → edited. Check the channel: should be ✅ Resolved.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Install the one-time deps needed to run the script**

The smoke script uses `dotenv` (to load `.env.local` outside of Next.js) and `tsx` (to run TypeScript directly). Add them as devDeps:

```bash
npm install --save-dev tsx dotenv
```

Expected: `package.json` gains both under `devDependencies`, lockfile updates.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the smoke script against the dev channel**

```bash
npx tsx scripts/test-slack-alert.ts
```

Expected stdout:
```
Posting fake failure to channel C…
  → posted, ts=1716297600.001234
Editing same message to green…
  → edited. Check the channel: should be ✅ Resolved.
```

In the Slack dev channel: a red 🔴 *Job stuck in sync — Acme Health (Cardiology)* message appears, then 5 seconds later the SAME message edits in place to ✅ *Resolved — Acme Health (Cardiology)*.

If you see `Error: slack:not_in_channel` → invite the bot to the dev channel (`/invite @<bot-name>`).
If you see `Error: slack:invalid_auth` → re-check `SLACK_BOT_TOKEN` value in `.env.local`.
If you see `Error: slack:channel_not_found` → re-check `SLACK_ALERT_CHANNEL_ID`.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-slack-alert.ts package.json package-lock.json
git commit -m "chore(slack-alerts): smoke script for verifying Slack post/edit flow"
```

---

### Task 6: Cron route — `app/api/cron/slack-alerts/route.ts`

**Files:**
- Create: `app/api/cron/slack-alerts/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/cron/slack-alerts/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { ensureSlackAlertsTable } from '@/lib/ensureSlackAlertsTable'
import {
  postFailureAlert,
  editAlertToResolved,
  type FailurePayload,
  type RecoveryPayload,
} from '@/lib/slack'
import { getResolvedByTag } from '@/lib/alertCopy'

export const dynamic = 'force-dynamic'

const MAX_ALERTS_PER_TICK = 50
const SLACK_THROTTLE_MS = 1100

type TickError = { stage: 'post' | 'edit'; job_id: string; event_type: string; reason: string }

type FailureRow = {
  source_event_id: string // bigint comes back as string
  job_id: string
  event_type: string
  created_at: Date
  practice_value: string | null
  job_title: string | null
  sf_job_id: string | null
  kimedics_link: string | null
}

type RecoveryRow = {
  id: string
  job_id: string
  event_type: string
  channel: string
  message_ts: string
  source_event_id: string
  recovery_event_type: string
  recovered_at: Date
  posted_at: Date
  practice_value: string | null
  job_title: string | null
  sf_job_id: string | null
  kimedics_link: string | null
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const channel = process.env.SLACK_ALERT_CHANNEL_ID
  if (!channel) {
    return NextResponse.json({ error: 'SLACK_ALERT_CHANNEL_ID not configured' }, { status: 500 })
  }

  const errors: TickError[] = []
  let newAlertsPosted = 0
  let recoveriesEdited = 0
  const tickedAt = new Date().toISOString()

  try {
    await ensureSlackAlertsTable()

    // Janitor: clear any stuck PENDING placeholders so their source events can retry.
    await sql`
      DELETE FROM slack_alerts
      WHERE message_ts = 'PENDING'
        AND posted_at  < now() - interval '5 minutes'
    `

    // ── Step 2: post new unresolved failures ─────────────────────────────
    const newFailures = await sql<FailureRow[]>`
      SELECT
        err.id              AS source_event_id,
        err.job_id,
        err.event_type,
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
          WHERE ok.job_id     = err.job_id
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
      LIMIT ${MAX_ALERTS_PER_TICK}
    `

    for (const row of newFailures) {
      // 1. Insert placeholder under unique constraint.
      const inserted = await sql<{ id: string }[]>`
        INSERT INTO slack_alerts
          (job_id, event_type, source_event_id, channel, message_ts)
        VALUES
          (${row.job_id}, ${row.event_type}, ${row.source_event_id}, ${channel}, 'PENDING')
        ON CONFLICT (job_id, event_type, source_event_id) DO NOTHING
        RETURNING id
      `
      if (inserted.length === 0) continue // raced; another tick handled it

      const placeholderId = inserted[0].id
      const payload: FailurePayload = {
        jobId: row.job_id,
        eventType: row.event_type,
        practice: row.practice_value,
        jobTitle: row.job_title,
        sfJobId: row.sf_job_id,
        kimedicsLink: row.kimedics_link,
        receivedAt: row.created_at,
      }

      try {
        const { ts } = await postFailureAlert(channel, payload)
        await sql`UPDATE slack_alerts SET message_ts = ${ts} WHERE id = ${placeholderId}`
        newAlertsPosted++
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        await sql`DELETE FROM slack_alerts WHERE id = ${placeholderId}`
        errors.push({ stage: 'post', job_id: row.job_id, event_type: row.event_type, reason })
        console.error('[slack-alerts] post failed', { job_id: row.job_id, reason })
      }

      await sleep(SLACK_THROTTLE_MS)
    }

    // ── Step 3: edit recovered failures to green ─────────────────────────
    const recoveries = await sql<RecoveryRow[]>`
      SELECT
        sa.id,
        sa.job_id,
        sa.event_type,
        sa.channel,
        sa.message_ts,
        sa.source_event_id,
        sa.posted_at,
        ok.event_type    AS recovery_event_type,
        ok.created_at    AS recovered_at,
        jc.practice_value,
        jc.job_title,
        jc.sf_job_id,
        es.view_job_link AS kimedics_link
      FROM slack_alerts sa
      JOIN LATERAL (
        SELECT event_type, created_at
        FROM job_event_log
        WHERE job_id     = sa.job_id
          AND id         > sa.source_event_id::bigint
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
      WHERE sa.resolved_at IS NULL
        AND sa.message_ts <> 'PENDING'
    `

    for (const row of recoveries) {
      const payload: RecoveryPayload = {
        jobId: row.job_id,
        eventType: row.event_type,
        recoveryEventType: row.recovery_event_type,
        practice: row.practice_value,
        jobTitle: row.job_title,
        sfJobId: row.sf_job_id,
        kimedicsLink: row.kimedics_link,
        failedAt: row.posted_at,
        recoveredAt: row.recovered_at,
      }
      try {
        await editAlertToResolved(row.channel, row.message_ts, payload)
        const tag = getResolvedByTag(row.recovery_event_type)
        await sql`
          UPDATE slack_alerts
          SET resolved_at = now(), resolved_by = ${tag}
          WHERE id = ${row.id}
        `
        recoveriesEdited++
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        errors.push({ stage: 'edit', job_id: row.job_id, event_type: row.event_type, reason })
        console.error('[slack-alerts] edit failed', { job_id: row.job_id, reason })
      }
      await sleep(SLACK_THROTTLE_MS)
    }

    return NextResponse.json({
      ticked_at: tickedAt,
      new_alerts_posted: newAlertsPosted,
      recoveries_edited: recoveriesEdited,
      errors,
    })
  } catch (err) {
    console.error('[slack-alerts] tick failed', err)
    return NextResponse.json(
      {
        ticked_at: tickedAt,
        new_alerts_posted: newAlertsPosted,
        recoveries_edited: recoveriesEdited,
        errors,
        fatal: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the route locally against the dev channel (no real failures expected)**

In one terminal: `npm run dev`
In another:

```bash
source .env.local && curl -i -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/slack-alerts
```

Expected (assuming there are no currently-unresolved failures in the DB you're connected to):

```
HTTP/1.1 200 OK
…
{"ticked_at":"…","new_alerts_posted":0,"recoveries_edited":0,"errors":[]}
```

Also verify auth: hit it without the header.

```bash
curl -i http://localhost:3000/api/cron/slack-alerts
```

Expected: `HTTP/1.1 401 Unauthorized`.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/slack-alerts/route.ts
git commit -m "feat(slack-alerts): cron route for unresolved-failure alerts"
```

---

### Task 7: Vercel cron schedule — `vercel.json`

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Write the file**

Create `vercel.json` at the repo root:

```json
{
  "crons": [
    { "path": "/api/cron/slack-alerts", "schedule": "*/10 * * * *" }
  ]
}
```

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"`
Expected: no output (silent success). Any output indicates malformed JSON.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore(slack-alerts): register vercel cron at */10 minutes"
```

---

### Task 8: End-to-end against the dev Slack channel

**Files:** none (operational verification).

This task injects a fake failure event into your dev database (the one `.env.local`'s `DATABASE_URL` points at), runs the cron route, and verifies the full red→green flow through the actual cron query path. It does NOT need to be repeated in production.

- [ ] **Step 1: Confirm `.env.local` points at a non-production database**

```bash
grep '^DATABASE_URL=' .env.local | sed 's/postgres.*@/postgres://@\* (host hidden) /'
```

Eyeball the host. If you only have one database (prod), proceed but use a clearly fake `job_id` prefixed with `TEST-` and remember to clean up at the end.

- [ ] **Step 2: Insert a fake unresolved failure**

```bash
psql "$DATABASE_URL" -c "INSERT INTO job_event_log (job_id, event_type, payload, created_at) VALUES ('TEST-E2E-1', 'worksite_create_failed', '{\"error\":\"e2e test\"}'::jsonb, now())"
```

Expected: `INSERT 0 1`.

- [ ] **Step 3: Trigger the cron route**

With `npm run dev` running in another terminal:

```bash
source .env.local && curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/slack-alerts | jq .
```

Expected JSON includes `"new_alerts_posted": 1`.

Check the dev Slack channel: a 🔴 message appears with title `Job stuck in sync — (job_id TEST-E2E-1)` (no practice/title because `job_content` has no row for this fake id).

- [ ] **Step 4: Insert a recovery event**

```bash
psql "$DATABASE_URL" -c "INSERT INTO job_event_log (job_id, event_type, payload, created_at) VALUES ('TEST-E2E-1', 'job_created_in_salesforce', '{}'::jsonb, now())"
```

Expected: `INSERT 0 1`.

- [ ] **Step 5: Trigger the cron route again**

```bash
source .env.local && curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/slack-alerts | jq .
```

Expected: `"new_alerts_posted": 0, "recoveries_edited": 1`.

The same Slack message now reads ✅ *Resolved — (job_id TEST-E2E-1)*.

- [ ] **Step 6: Trigger once more — verify idempotence**

```bash
source .env.local && curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/slack-alerts | jq .
```

Expected: `"new_alerts_posted": 0, "recoveries_edited": 0`. No new Slack activity.

- [ ] **Step 7: Clean up test data**

```bash
psql "$DATABASE_URL" -c "DELETE FROM job_event_log WHERE job_id = 'TEST-E2E-1'; DELETE FROM slack_alerts WHERE job_id = 'TEST-E2E-1';"
```

Expected: `DELETE` confirmation for each statement.

- [ ] **Step 8: No commit — this task is verification only**

If you want to record the verification, add a short note to the PR description when you open it.

---

### Task 9: Production rollout

**Files:** none (Vercel UI + Slack admin).

- [ ] **Step 1: Confirm the bot is installed in the client workspace and invited to the client channel**

In Slack: open the client channel, `/invite @<bot-name>`. If `chat:write.public` scope is granted and the channel is public, the invite is optional but recommended for visibility.

- [ ] **Step 2: Set Vercel env vars (Production + Preview, NOT Development)**

In Vercel → Project Settings → Environment Variables, add or confirm:

- `SLACK_BOT_TOKEN`
- `SLACK_ALERT_CHANNEL_ID` (the production channel id, not the dev one)
- `CRON_SECRET`
- `DASHBOARD_BASE_URL=https://automation-hub-rosy.vercel.app`
- `SALESFORCE_INSTANCE_URL=<your SF base URL>`

- [ ] **Step 3: Open a PR and merge to main**

The presence of `vercel.json` triggers Vercel to register the cron on the next Production deploy. Merge the PR.

- [ ] **Step 4: Observe the first production cron tick**

In Vercel → your project → Crons tab: wait up to 10 min for the first invocation. Click into it and inspect the response JSON.

Expected: `{ "ticked_at": "...", "new_alerts_posted": N, "recoveries_edited": M, "errors": [] }` — with `N` and `M` reflecting any genuinely unresolved/recovered failures in the last 24h.

If `errors[]` is non-empty: investigate before telling the client the channel is live.

- [ ] **Step 5: Stop. Watch one real failure cycle end-to-end before declaring the channel "live" to clients**

Wait for the next genuine pipeline failure (or, if you can't wait, repeat Task 8's inject/recover dance against production — clean up afterwards). Confirm the client channel got a red message AND that it later turned green on recovery.

Only then announce the channel to clients.

---

## Self-Review (writer's checklist)

- **Spec coverage:**
  - §1 Goals 1 (post on unresolved): Task 6 step 2 query + post loop ✓
  - §2 Goal (edit green on recovery): Task 6 step 2 recovery loop ✓
  - §3 Goal (plain-English copy + 3 links): Tasks 3 + 4 ✓
  - §4 Goal (single repo, no Python changes): no task touches the other repo ✓
  - §5 Goal (idempotent under retries): unique constraint + placeholder discipline in Task 6 ✓
  - Data model (table + index): Task 2 ✓
  - Slack auth model + env vars: Task 1 (docs) + Task 9 (Vercel) ✓
  - Vercel cron config: Task 7 ✓
  - Testing strategy (dev channel + smoke script + e2e via psql): Tasks 5 + 8 ✓
  - Pre-prod checklist: Task 9 ✓
- **Placeholder scan:** No `TBD`/`TODO` inside the task content. Every code step contains the full file.
- **Type consistency:** `FailurePayload` and `RecoveryPayload` defined in Task 4 are imported by Tasks 5 and 6 with the same field names. `slack_alerts` columns in Task 2 match references in Task 6.
- **Scope:** Single subsystem, no decomposition needed.
