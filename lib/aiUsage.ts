import sql from './db'
import djcSql from './djcDb'
import type { AiActivity } from './aiCost'

export interface UsageWindows {
  sevenDay: AiActivity
  thirtyDay: AiActivity
}

const EMPTY: AiActivity = { jobsCreated: 0, dateCalls: 0, fieldCalls: 0, matchCalls: 0, emailsProcessed: 0, cvParses: 0 }

// What fraction of processed posts trigger the gated AI steps. Derived from the
// 7-day backtest (~15% have a top-line date change; ~1% are malformed). These are
// the only modeled numbers; the rest come straight from logged events.
const DATE_RATE = 0.15
const FIELD_RATE = 0.01

/** Kimedics (OpenAI) AI activity for the last 7 and 30 days. */
export async function getKimedicsAiUsage(): Promise<UsageWindows> {
  if (!sql) return { sevenDay: EMPTY, thirtyDay: EMPTY }
  try {
    const [ev] = await sql<Record<string, number>[]>`
      SELECT
        count(*) FILTER (WHERE event_type='job_created_in_salesforce' AND created_at >= now()-interval '7 days')::int  AS jobs_7,
        count(*) FILTER (WHERE event_type='job_created_in_salesforce' AND created_at >= now()-interval '30 days')::int AS jobs_30,
        count(*) FILTER (WHERE event_type IN ('mapping_ai_match','mapping_no_match') AND created_at >= now()-interval '7 days')::int  AS match_7,
        count(*) FILTER (WHERE event_type IN ('mapping_ai_match','mapping_no_match') AND created_at >= now()-interval '30 days')::int AS match_30
      FROM job_event_log`
    const [em] = await sql<Record<string, number>[]>`
      SELECT
        count(*) FILTER (WHERE coalesce("date",created_at) >= now()-interval '7 days')::int  AS em_7,
        count(*) FILTER (WHERE coalesce("date",created_at) >= now()-interval '30 days')::int AS em_30
      FROM email_scrapes WHERE job_post_id IS NOT NULL AND job_post_id <> ''`
    const win = (jobs: number, match: number, em: number): AiActivity => ({
      jobsCreated: jobs,
      matchCalls: match,
      emailsProcessed: em,
      dateCalls: Math.round(em * DATE_RATE),
      fieldCalls: Math.round(em * FIELD_RATE),
      cvParses: 0,
    })
    return {
      sevenDay: win(Number(ev?.jobs_7 ?? 0), Number(ev?.match_7 ?? 0), Number(em?.em_7 ?? 0)),
      thirtyDay: win(Number(ev?.jobs_30 ?? 0), Number(ev?.match_30 ?? 0), Number(em?.em_30 ?? 0)),
    }
  } catch {
    return { sevenDay: EMPTY, thirtyDay: EMPTY }
  }
}

/** DJC (Anthropic) AI activity for the last 7 and 30 days. */
export async function getDjcAiUsage(): Promise<UsageWindows> {
  if (!djcSql) return { sevenDay: EMPTY, thirtyDay: EMPTY }
  try {
    const [r] = await djcSql<Record<string, number>[]>`
      SELECT
        count(*) FILTER (WHERE event_type='cv_downloaded' AND created_at >= now()-interval '7 days')::int  AS cv_7,
        count(*) FILTER (WHERE event_type='cv_downloaded' AND created_at >= now()-interval '30 days')::int AS cv_30
      FROM djc_event_log`
    return {
      sevenDay: { ...EMPTY, cvParses: Number(r?.cv_7 ?? 0) },
      thirtyDay: { ...EMPTY, cvParses: Number(r?.cv_30 ?? 0) },
    }
  } catch {
    return { sevenDay: EMPTY, thirtyDay: EMPTY }
  }
}
