import type postgres from 'postgres'
import djcSql from './djcDb'

/**
 * DJC Insights — analytics aggregates over djc_candidates / djc_event_log / djc_candidate_sightings.
 * All candidate-population math lives here (the panel only renders). Drill-down rows come from
 * /api/djc/insights which reuses the same WHERE fragments via drillWhere().
 */

export interface InsightBucket {
  key: string
  label: string
  count: number
}

export interface DjcSpecialtyRow {
  target: string
  total: number
  netNew: number
  duplicates: number
  uncontactable: number
  contactable: number
  avgExperience: number | null
  avgRating: number | null
}

export interface DjcStateRow {
  state: string
  total: number
  netNew: number
}

export interface DjcCohortRow {
  cohort: string // YYYY or YYYY-Qn
  total: number
  activeLast90: number
}

export interface DjcViewsDay {
  day: string
  used: number
  total: number
}

export interface DjcViewsLedgerDay {
  day: string
  viewsUsed: number
  opens: number
  netNew: number
  duplicates: number
  uncontactable: number
  manualOrOther: number
}

export interface DjcViewsLedger {
  quarterStart: string
  used: number
  total: number
  outcomes: { opens: number; netNew: number; duplicates: number; uncontactable: number }
  manualOrOther: number
  days: DjcViewsLedgerDay[]
}

export type InsightsPeriod = 'quarter' | 'all'

export interface DjcInsights {
  period: InsightsPeriod
  periodStart: string | null // quarter start day when period = 'quarter'
  totals: {
    observed: number
    opened: number
    contactable: number
    netNew: number
    inSalesforce: number
    createdByAutomation: number
    phoneFromResumeOnly: number
    factsCoverage: number // candidates with registered_on filled (backfill progress)
  }
  funnel: { key: string; label: string; count: number; note: string }[]
  contactSources: InsightBucket[]
  specialties: DjcSpecialtyRow[]
  states: DjcStateRow[]
  experience: InsightBucket[]
  gradYears: InsightBucket[]
  activity: { overall: InsightBucket[]; netNew: InsightBucket[] }
  registeredCohorts: DjcCohortRow[]
  dropoff: InsightBucket[]
  rating: { distribution: InsightBucket[]; avg: number | null }
  viewsBurndown: DjcViewsDay[]
  viewsLedger: DjcViewsLedger | null
  sightingsSince: string | null // first day of longitudinal tracking, null until data exists
}

/** Parse DJC's M/D/YY last_activity text into a date; NULL for anything unparseable. */
const LAST_ACT = `case when last_activity ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$'
  then to_date(last_activity, 'FMMM/FMDD/FMYY') end`

/** Profile scraped by us (excludes early-dedup skips that never opened the profile). */
const OPENED = `contact_source is not null and contact_source not like 'skipped%'`

/**
 * Transparent 0–100 candidate rating. Weights (shown verbatim in the UI):
 * phone 25 · email 15 · CV 20 · experience up to 20 (1/yr, capped) · activity 20/10/0 (≤30d/≤90d).
 */
const RATING = `(
    case when phone is not null then 25 else 0 end
  + case when email is not null then 15 else 0 end
  + case when coalesce(cv_bytes_len, 0) > 0 or cv_uploaded then 20 else 0 end
  + least(coalesce(experience_years, 0), 20)
  + case when ${LAST_ACT} >= current_date - 30 then 20
         when ${LAST_ACT} >= current_date - 90 then 10 else 0 end
)`

const EXPERIENCE_BUCKET = `case
  when experience_years is null then 'unknown'
  when experience_years < 5 then '0-4'
  when experience_years < 10 then '5-9'
  when experience_years < 20 then '10-19'
  when experience_years < 30 then '20-29'
  else '30+' end`

const ACTIVITY_BUCKET = `case
  when ${LAST_ACT} is null then 'unknown'
  when ${LAST_ACT} >= current_date - 7 then '7d'
  when ${LAST_ACT} >= current_date - 30 then '30d'
  when ${LAST_ACT} >= current_date - 90 then '90d'
  when ${LAST_ACT} >= current_date - 180 then '180d'
  else 'older' end`

const DROPOFF_BUCKET = `case
  when ${LAST_ACT} - registered_on < 30 then '<1mo'
  when ${LAST_ACT} - registered_on < 90 then '1-3mo'
  when ${LAST_ACT} - registered_on < 365 then '3-12mo'
  when ${LAST_ACT} - registered_on < 730 then '1-2y'
  else '2y+' end`

const RATING_BUCKET = `case
  when ${RATING} < 20 then '0-19' when ${RATING} < 40 then '20-39'
  when ${RATING} < 60 then '40-59' when ${RATING} < 80 then '60-79'
  else '80-100' end`

export const ACTIVITY_LABELS: Record<string, string> = {
  '7d': 'active in last 7 days', '30d': '8–30 days', '90d': '31–90 days',
  '180d': '91–180 days', older: 'over 180 days', unknown: 'no activity date',
}

export const CONTACT_SOURCE_LABELS: Record<string, string> = {
  profile: 'Phone/email on DJC profile',
  cv: 'Recovered from resume only',
  'profile+cv': 'Profile + resume combined',
  none: 'No contact found anywhere',
}

function buckets(rows: { key: string; count: number }[], order: string[], labels: Record<string, string>): InsightBucket[] {
  const byKey = new Map(rows.map(r => [r.key, Number(r.count)]))
  return order.map(k => ({ key: k, label: labels[k] ?? k, count: byKey.get(k) ?? 0 }))
}

/** Per-ET-day max of the Profile Views used-counter (ET so the 8 PM run stays on its own day). */
async function viewsUsedByDay(sql: NonNullable<typeof djcSql>): Promise<{ day: string; used: number; total: number }[]> {
  const rows = await sql<{ day: string; used: number; total: number }[]>`
    select to_char((created_at at time zone 'America/New_York')::date, 'YYYY-MM-DD') as day,
           max((payload->>'used')::int)::int as used,
           max((payload->>'total')::int)::int as total
    from djc_event_log
    where event_type = 'profile_views_snapshot'
    group by 1 order by 1
  `
  return rows.map(r => ({ day: r.day, used: Number(r.used), total: Number(r.total) }))
}

/** First day of the current quota period = the last day the used-counter dropped (quarterly reset). */
function quarterStartOf(days: { day: string; used: number }[]): string | null {
  if (!days.length) return null
  let start = 0
  for (let i = 1; i < days.length; i++) if (days[i].used < days[i - 1].used) start = i
  return days[start].day
}

/**
 * The quarter's views ledger: what each day's spend bought. A view's outcome (net new vs
 * already-in-SF vs no contact) is only knowable AFTER the profile is opened, so "wasted" views
 * are the price of discovery, not a bug. manualOrOther = counter movement the automation's opens
 * can't explain (human browsing on the shared login).
 */
async function getViewsLedger(sql: NonNullable<typeof djcSql>): Promise<DjcViewsLedger | null> {
  const allDays = await viewsUsedByDay(sql)
  const quarterStart = quarterStartOf(allDays)
  if (!quarterStart) return null
  const days = allDays.filter(d => d.day >= quarterStart)

  const openRows = await sql<{
    day: string; opens: number; net_new: number; duplicates: number; uncontactable: number
  }[]>`
    with opened as (
      select distinct to_char((e.created_at at time zone 'America/New_York')::date, 'YYYY-MM-DD') as day,
             e.candidate_id
      from djc_event_log e
      where e.event_type = 'profile_scraped'
        and (e.created_at at time zone 'America/New_York')::date >= ${quarterStart}::date)
    select o.day,
           count(*)::int as opens,
           count(*) filter (where c.dedup_status = 'new')::int as net_new,
           count(*) filter (where c.dedup_status = 'duplicate')::int as duplicates,
           count(*) filter (where c.contact_source = 'none')::int as uncontactable
    from opened o join djc_candidates c using (candidate_id)
    group by 1 order by 1
  `
  const opensByDay = new Map(openRows.map(r => [r.day, r]))

  let prevUsed = 0
  const ledgerDays: DjcViewsLedgerDay[] = days.map(d => {
    const o = opensByDay.get(d.day)
    const viewsUsed = Math.max(d.used - prevUsed, 0)
    prevUsed = d.used
    const opens = Number(o?.opens ?? 0)
    return {
      day: d.day,
      viewsUsed,
      opens,
      netNew: Number(o?.net_new ?? 0),
      duplicates: Number(o?.duplicates ?? 0),
      uncontactable: Number(o?.uncontactable ?? 0),
      manualOrOther: Math.max(viewsUsed - opens, 0),
    }
  })

  const latest = days.at(-1)!
  const sum = (k: keyof DjcViewsLedgerDay) => ledgerDays.reduce((a, d) => a + (d[k] as number), 0)
  return {
    quarterStart,
    used: latest.used,
    total: latest.total,
    outcomes: {
      opens: sum('opens'),
      netNew: sum('netNew'),
      duplicates: sum('duplicates'),
      uncontactable: sum('uncontactable'),
    },
    manualOrOther: sum('manualOrOther'),
    days: ledgerDays.slice().reverse(), // newest first for the table
  }
}

export async function getDjcInsights(period: InsightsPeriod = 'quarter'): Promise<DjcInsights | null> {
  const sql = djcSql
  if (!sql) return null

  const [totalsRows, sourceRows, specialtyRows, stateRows, expRows, gradRows,
    actRows, cohortRows, dropRows, ratingRows, ratingAvgRows, viewRows, sightRows] = await Promise.all([
    sql<Record<string, number>[]>`
      select count(*)::int as observed,
             count(*) filter (where ${sql.unsafe(OPENED)})::int as opened,
             count(*) filter (where phone is not null or email is not null)::int as contactable,
             count(*) filter (where dedup_status = 'new')::int as net_new,
             count(*) filter (where sf_contact_id is not null)::int as in_salesforce,
             count(*) filter (where contact_source = 'cv' and phone is not null)::int as phone_from_resume_only,
             count(*) filter (where registered_on is not null)::int as facts_coverage
      from djc_candidates`,
    sql<{ key: string; count: number }[]>`
      select contact_source as key, count(*)::int as count
      from djc_candidates where ${sql.unsafe(OPENED)}
      group by 1 order by 2 desc`,
    sql<{
      target: string; total: number; net_new: number; duplicates: number; uncontactable: number
      contactable: number; avg_experience: number | null; avg_rating: number | null
    }[]>`
      select coalesce(target, 'Unknown') as target,
             count(*)::int as total,
             count(*) filter (where dedup_status = 'new')::int as net_new,
             count(*) filter (where dedup_status = 'duplicate')::int as duplicates,
             count(*) filter (where contact_source = 'none')::int as uncontactable,
             count(*) filter (where phone is not null or email is not null)::int as contactable,
             round(avg(experience_years) filter (where experience_years is not null), 1)::float as avg_experience,
             round(avg(${sql.unsafe(RATING)}) filter (where ${sql.unsafe(OPENED)}), 0)::float as avg_rating
      from djc_candidates
      group by 1 order by 2 desc`,
    sql<{ state: string; total: number; net_new: number }[]>`
      select coalesce(nullif(trim(mailing_state), ''), 'Unknown') as state,
             count(*)::int as total,
             count(*) filter (where dedup_status = 'new')::int as net_new
      from djc_candidates
      group by 1 order by 2 desc limit 16`,
    sql<{ key: string; count: number }[]>`
      select ${sql.unsafe(EXPERIENCE_BUCKET)} as key, count(*)::int as count
      from djc_candidates group by 1`,
    sql<{ key: string; count: number }[]>`
      select (floor(grad_year / 10) * 10)::int::text || 's' as key, count(*)::int as count
      from djc_candidates where grad_year between 1950 and 2035
      group by 1 order by 1`,
    sql<{ scope: string; key: string; count: number }[]>`
      select scope, key, count::int from (
        select 'overall' as scope, ${sql.unsafe(ACTIVITY_BUCKET)} as key, count(*) as count
        from djc_candidates group by 2
        union all
        select 'netNew', ${sql.unsafe(ACTIVITY_BUCKET)}, count(*)
        from djc_candidates where dedup_status = 'new' group by 2
      ) t`,
    sql<{ cohort: string; total: number; active_last90: number }[]>`
      select to_char(date_trunc('quarter', registered_on), 'YYYY "Q"Q') as cohort,
             count(*)::int as total,
             count(*) filter (where ${sql.unsafe(LAST_ACT)} >= current_date - 90)::int as active_last90
      from djc_candidates where registered_on is not null
      group by date_trunc('quarter', registered_on)
      order by date_trunc('quarter', registered_on)`,
    sql<{ key: string; count: number }[]>`
      select ${sql.unsafe(DROPOFF_BUCKET)} as key, count(*)::int as count
      from djc_candidates
      where registered_on is not null and ${sql.unsafe(LAST_ACT)} is not null
      group by 1`,
    sql<{ key: string; count: number }[]>`
      select ${sql.unsafe(RATING_BUCKET)} as key, count(*)::int as count
      from djc_candidates where ${sql.unsafe(OPENED)}
      group by 1`,
    sql<{ avg: number | null }[]>`
      select round(avg(${sql.unsafe(RATING)}), 0)::float as avg
      from djc_candidates where ${sql.unsafe(OPENED)}`,
    sql<{ day: string; used: number; total: number }[]>`
      select to_char(created_at::date, 'YYYY-MM-DD') as day,
             max((payload->>'used')::int)::int as used,
             max((payload->>'total')::int)::int as total
      from djc_event_log
      where event_type = 'profile_views_snapshot'
      group by 1 order by 1`,
    sql<{ first_day: string | null }[]>`
      select to_char(min(seen_on), 'YYYY-MM-DD') as first_day from djc_candidate_sightings`,
  ])

  const viewsLedger = await getViewsLedger(sql).catch(() => null)
  const quarterStart = viewsLedger?.quarterStart ?? null

  const t = totalsRows[0]
  const totals = {
    observed: Number(t.observed),
    opened: Number(t.opened),
    contactable: Number(t.contactable),
    netNew: Number(t.net_new),
    inSalesforce: Number(t.in_salesforce),
    createdByAutomation: 0, // filled below from run counters
    phoneFromResumeOnly: Number(t.phone_from_resume_only),
    factsCoverage: Number(t.facts_coverage),
  }
  const [created] = await sql<{ created: number }[]>`
    select coalesce(sum(created), 0)::int as created from djc_runs`
  totals.createdByAutomation = Number(created.created)

  // Funnel: period-scoped when a quarter filter is active — "observed" = first seen since the
  // quarter started; later stages = outcomes of profiles OPENED this quarter.
  let funnel: DjcInsights['funnel']
  if (period === 'quarter' && quarterStart) {
    const [f] = await sql<Record<string, number>[]>`
      with opened as (
        select distinct e.candidate_id from djc_event_log e
        where e.event_type = 'profile_scraped'
          and (e.created_at at time zone 'America/New_York')::date >= ${quarterStart}::date)
      select (select count(*) from djc_candidates where first_seen_at >= ${quarterStart}::date)::int as observed,
             (select count(*) from opened)::int as opened,
             count(*) filter (where c.phone is not null or c.email is not null)::int as contactable,
             count(*) filter (where c.dedup_status = 'new')::int as net_new,
             count(*) filter (where c.dedup_status = 'new' and c.sf_contact_id is not null)::int as created
      from djc_candidates c join opened using (candidate_id)
    `
    funnel = [
      { key: 'first_seen_since', label: 'New to our scans', count: Number(f.observed), note: 'candidates first observed since the quarter started' },
      { key: 'opened:all', label: 'Profile opened', count: Number(f.opened), note: 'profiles the automation opened this quarter' },
      { key: 'opened:contactable', label: 'Contact recovered', count: Number(f.contactable), note: 'phone or email found on profile or resume' },
      { key: 'opened:net_new', label: 'Net new', count: Number(f.net_new), note: 'not already in Salesforce by any match rule' },
      { key: 'opened:created', label: 'Created in Salesforce', count: Number(f.created), note: 'new contacts created this quarter' },
    ]
  } else {
    funnel = [
      { key: 'observed', label: 'Observed in searches', count: totals.observed, note: 'every unique candidate our scans have seen' },
      { key: 'opened', label: 'Profile opened', count: totals.opened, note: 'skips candidates already in Salesforce (no view spent)' },
      { key: 'contactable', label: 'Contact recovered', count: totals.contactable, note: 'phone or email found on profile or resume' },
      { key: 'netNew', label: 'Net new', count: totals.netNew, note: 'not already in Salesforce by any match rule' },
      { key: 'created', label: 'Created in Salesforce', count: totals.createdByAutomation, note: 'contacts the automation created' },
    ]
  }

  return {
    period,
    periodStart: quarterStart,
    totals,
    funnel,
    contactSources: sourceRows.map(r => ({
      key: r.key, label: CONTACT_SOURCE_LABELS[r.key] ?? r.key, count: Number(r.count),
    })),
    specialties: specialtyRows.map(r => ({
      target: r.target, total: Number(r.total), netNew: Number(r.net_new),
      duplicates: Number(r.duplicates), uncontactable: Number(r.uncontactable),
      contactable: Number(r.contactable),
      avgExperience: r.avg_experience === null ? null : Number(r.avg_experience),
      avgRating: r.avg_rating === null ? null : Number(r.avg_rating),
    })),
    states: stateRows.map(r => ({ state: r.state, total: Number(r.total), netNew: Number(r.net_new) })),
    experience: buckets(expRows, ['0-4', '5-9', '10-19', '20-29', '30+', 'unknown'],
      { unknown: 'not stated' }),
    gradYears: gradRows.map(r => ({ key: r.key, label: r.key, count: Number(r.count) })),
    activity: {
      overall: buckets(actRows.filter(r => r.scope === 'overall'), ['7d', '30d', '90d', '180d', 'older', 'unknown'], ACTIVITY_LABELS),
      netNew: buckets(actRows.filter(r => r.scope === 'netNew'), ['7d', '30d', '90d', '180d', 'older', 'unknown'], ACTIVITY_LABELS),
    },
    registeredCohorts: cohortRows.map(r => ({
      cohort: r.cohort, total: Number(r.total), activeLast90: Number(r.active_last90),
    })),
    dropoff: buckets(dropRows, ['<1mo', '1-3mo', '3-12mo', '1-2y', '2y+'], {}),
    rating: {
      distribution: buckets(ratingRows, ['0-19', '20-39', '40-59', '60-79', '80-100'], {}),
      avg: ratingAvgRows[0]?.avg === null ? null : Number(ratingAvgRows[0]?.avg),
    },
    // Only the current allowance period. The quarterly reset zeroes the used-counter, so start
    // the series at the last day `used` dropped — charting across a reset draws a fake cliff.
    viewsBurndown: (() => {
      const days = viewRows.map(r => ({ day: r.day, used: Number(r.used), total: Number(r.total) }))
      let start = 0
      for (let i = 1; i < days.length; i++) if (days[i].used < days[i - 1].used) start = i
      return days.slice(start)
    })(),
    viewsLedger,
    sightingsSince: sightRows[0]?.first_day ?? null,
  }
}

// ── Drill-down (used by /api/djc/insights) ────────────────────────────────────────────────────

export interface DrillRow {
  candidateId: string
  name: string | null
  target: string | null
  city: string | null
  state: string | null
  lastActivity: string | null
  registeredOn: string | null
  experienceYears: number | null
  rating: number | null
  contactSource: string | null
  dedupStatus: string | null
  dedupReason: string | null
  sfContactId: string | null
  profileUrl: string | null
}

export interface CandidateEvent {
  at: string // ET timestamp
  type: string
  stage: string | null
  level: string
  message: string | null
  payload: Record<string, unknown> | null
}

/** Full pipeline event trail for one candidate — the "exact process reasoning" behind a drill row. */
export async function getCandidateTrail(candidateId: string): Promise<CandidateEvent[] | null> {
  const sql = djcSql
  if (!sql) return null
  if (!/^[\w.-]{1,40}$/.test(candidateId)) return null
  const rows = await sql<{
    at: string; event_type: string; stage: string | null; level: string
    message: string | null; payload: Record<string, unknown> | null
  }[]>`
    select to_char(created_at at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI') as at,
           event_type, stage, level, message, payload
    from djc_event_log
    where candidate_id = ${candidateId}
    order by created_at
    limit 200
  `
  return rows.map(r => ({
    at: r.at, type: r.event_type, stage: r.stage, level: r.level,
    message: r.message, payload: r.payload,
  }))
}

/** Whitelisted drill dimensions → WHERE fragment. Values are matched with parameters; the
 *  fragment strings themselves are constants (never user input). */
const DRILL_BUCKET_EXPRS: Record<string, string> = {
  contact_source: 'contact_source',
  dedup_status: 'dedup_status',
  specialty: `coalesce(target, 'Unknown')`,
  state: `coalesce(nullif(trim(mailing_state), ''), 'Unknown')`,
  experience: EXPERIENCE_BUCKET,
  activity: ACTIVITY_BUCKET,
  rating: RATING_BUCKET,
  registered_quarter: `to_char(date_trunc('quarter', registered_on), 'YYYY "Q"Q')`,
  grad_decade: `(floor(grad_year / 10) * 10)::int::text || 's'`,
  dropoff: DROPOFF_BUCKET,
  funnel: `''`, // handled specially below
}

const FUNNEL_WHERE: Record<string, string> = {
  observed: 'true',
  opened: OPENED,
  contactable: '(phone is not null or email is not null)',
  netNew: `dedup_status = 'new'`,
  created: `dedup_status = 'new' and sf_contact_id is not null`,
}

const OUTCOME_WHERE: Record<string, string> = {
  all: 'true',
  net_new: `dedup_status = 'new'`,
  duplicates: `dedup_status = 'duplicate'`,
  uncontactable: `contact_source = 'none'`,
  contactable: '(phone is not null or email is not null)',
  created: `dedup_status = 'new' and sf_contact_id is not null`,
}

export async function drillDjcCandidates(dim: string, value: string): Promise<DrillRow[] | null> {
  const sql = djcSql
  if (!sql) return null

  // Candidates first observed on/after a date (the quarter-scoped funnel's top stage).
  if (dim === 'first_seen_since') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
    return drillSelect(sql, sql`first_seen_at >= ${value}::date`)
  }

  // Ledger dims: candidates whose profile the automation opened on a given ET day / this quarter
  // with a given outcome. Both scope by profile_scraped events rather than candidate columns.
  if (dim === 'opened_day' || dim === 'opened_outcome') {
    if (dim === 'opened_day' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
    if (dim === 'opened_outcome' && !OUTCOME_WHERE[value]) return null
    const quarterStart = quarterStartOf(await viewsUsedByDay(sql))
    if (!quarterStart) return null
    const openedFilter =
      dim === 'opened_day'
        ? sql`(e.created_at at time zone 'America/New_York')::date = ${value}::date`
        : sql`(e.created_at at time zone 'America/New_York')::date >= ${quarterStart}::date`
    const outcomeFilter =
      dim === 'opened_outcome' ? sql`and ${sql.unsafe(OUTCOME_WHERE[value])}` : sql``
    return drillSelect(sql, sql`candidate_id in (
        select e.candidate_id from djc_event_log e
        where e.event_type = 'profile_scraped' and ${openedFilter})
      ${outcomeFilter}`)
  }

  const expr = DRILL_BUCKET_EXPRS[dim]
  if (!expr) return null
  if (dim === 'funnel' && !FUNNEL_WHERE[value]) return null

  // The fragments are compile-time constants from the whitelists above; only `value` is user
  // input and it is always passed as a bound parameter.
  const where =
    dim === 'funnel'
      ? sql`${sql.unsafe(FUNNEL_WHERE[value])}`
      : dim === 'rating' || dim === 'contact_source'
        ? sql`${sql.unsafe(expr)} = ${value} and ${sql.unsafe(OPENED)}`
        : sql`${sql.unsafe(expr)} = ${value}`

  return drillSelect(sql, where)
}

async function drillSelect(sql: NonNullable<typeof djcSql>, where: postgres.Fragment): Promise<DrillRow[]> {
  const rows = await sql<{
    candidate_id: string; name: string | null; target: string | null
    mailing_city: string | null; mailing_state: string | null
    last_activity: string | null; registered_on: string | null
    experience_years: number | null; rating: number | null
    contact_source: string | null; dedup_status: string | null
    dedup_reason: string | null; sf_contact_id: string | null; profile_url: string | null
  }[]>`
    select candidate_id, name, target, mailing_city, mailing_state, last_activity,
           to_char(registered_on, 'YYYY-MM-DD') as registered_on,
           experience_years,
           case when ${sql.unsafe(OPENED)} then ${sql.unsafe(RATING)} end as rating,
           contact_source, dedup_status, dedup_reason, sf_contact_id, profile_url
    from djc_candidates
    where ${where}
    order by updated_at desc
    limit 100
  `
  return rows.map(r => ({
    candidateId: r.candidate_id, name: r.name, target: r.target,
    city: r.mailing_city, state: r.mailing_state, lastActivity: r.last_activity,
    registeredOn: r.registered_on, experienceYears: r.experience_years,
    rating: r.rating === null ? null : Number(r.rating),
    contactSource: r.contact_source, dedupStatus: r.dedup_status,
    dedupReason: r.dedup_reason, sfContactId: r.sf_contact_id, profileUrl: r.profile_url,
  }))
}
