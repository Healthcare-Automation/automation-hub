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
