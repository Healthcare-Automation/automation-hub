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
  email_subject: string | null
  email_received_at: Date | null
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
  email_subject: string | null
  email_received_at: Date | null
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
        es.view_job_link    AS kimedics_link,
        es.subject          AS email_subject,
        es.created_at       AS email_received_at
      FROM job_event_log err
      LEFT JOIN LATERAL (
        SELECT practice_value, job_title, sf_job_id, email_scrape_id
        FROM job_content
        WHERE job_id = err.job_id
          AND (err.run_id IS NULL OR run_id = err.run_id)
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

    if (newFailures.length === MAX_ALERTS_PER_TICK) {
      console.warn(
        `[slack-alerts] hit per-tick alert cap (${MAX_ALERTS_PER_TICK}); ` +
          `additional unresolved failures will be picked up on the next tick`,
      )
    }

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
        emailSubject: row.email_subject,
        emailReceivedAt: row.email_received_at,
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
        es.view_job_link AS kimedics_link,
        es.subject       AS email_subject,
        es.created_at    AS email_received_at
      FROM slack_alerts sa
      JOIN job_event_log src ON src.id = sa.source_event_id::bigint
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
          AND (src.run_id IS NULL OR run_id = src.run_id)
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
        emailSubject: row.email_subject,
        emailReceivedAt: row.email_received_at,
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
