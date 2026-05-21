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
