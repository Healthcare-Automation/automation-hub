import djcSql from './djcDb'

/**
 * DJC operating data: view cycles, sourcing volume and what the automation produced.
 *
 * Everything here counts SCHEDULED runs only. Backfills, manual pulls and tests were one-off
 * catch-up work with a completely different hit rate, and mixing them in made the automation's own
 * behaviour unreadable.
 */

/** A view cycle runs 15th to the 14th — the day the DJC allowance refills. */
const CYCLE_START = `(case
  when extract(day from (e.created_at at time zone 'America/New_York')) >= 15
    then date_trunc('month', e.created_at at time zone 'America/New_York') + interval '14 days'
    else date_trunc('month', e.created_at at time zone 'America/New_York') - interval '1 month' + interval '14 days'
  end)::date`

const SCHEDULED = `join djc_runs r on r.id = e.run_id and r.trigger = 'scheduled'`

export const VIEW_CAP = 750

/** postgres.js hands back Date objects for date columns; String(d).slice(0,10) yields "Thu May 14". */
const isoDate = (d: unknown): string =>
  d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)

export interface ViewCycle {
  cycleStart: string
  views: number
  cap: number
  addedToSf: number
  alreadyInSf: number
  noContact: number
  other: number
  isCurrent: boolean
}

export interface CycleProjection {
  cycleStart: string
  cycleEnd: string
  used: number
  daysElapsed: number
  daysRemaining: number
  perDay: number
  perWeek: number
  projectedTotal: number
  byWeekday: { day: string; views: number }[]
}

export interface SourcingMonth {
  month: string
  generalDentist: number
  specialist: number
  hygienist: number
  assistant: number
}

export interface AutomationFunnel {
  sourced: number
  applied: number
  submitted: number
  placed: number
}

/**
 * Views per cycle, from DJC's own counter — not from what the automation did.
 *
 * This previously counted profile_scraped events on scheduled runs, which is only the automation's
 * own spend. DJC's counter also moves for manual logins, backfills and anything a person does in
 * the browser. For the cycle beginning 15 Jul the automation accounts for ~230 views while the real
 * counter reads 827 against a 750 cap — the chart said we had headroom when we were 77 over.
 *
 * `used` is the peak the counter reached in the cycle; add-on packs can push it past `total`.
 */
export async function getViewCycles(): Promise<ViewCycle[]> {
  const sql = djcSql
  if (!sql) return []
  // One row per day with the highest counter reading seen that day.
  const days = await sql<{ day: string; used: number; total: number }[]>`
    select to_char((created_at at time zone 'America/New_York')::date, 'YYYY-MM-DD') as day,
           max((payload->>'used')::int)::int   as used,
           max((payload->>'total')::int)::int  as total
    from djc_event_log
    where event_type = 'profile_views_snapshot'
    group by 1 order by 1
  `
  if (!days.length) return []

  // A cycle starts wherever the counter drops — that is the refill, whatever date it lands on.
  type Cyc = { start: string; used: number; total: number }
  const cycles: Cyc[] = []
  for (let i = 0; i < days.length; i++) {
    const d = days[i]
    if (i === 0 || d.used < days[i - 1].used) cycles.push({ start: d.day, used: d.used, total: d.total })
    else {
      const cur = cycles[cycles.length - 1]
      cur.used = Math.max(cur.used, d.used)
      cur.total = d.total
    }
  }

  // What the automation itself opened in each window, so the rest can be shown as manual/other.
  const auto = await sql<{ day: string; opens: number; created: number; dupes: number; no_contact: number }[]>`
    select to_char((e.created_at at time zone 'America/New_York')::date, 'YYYY-MM-DD') as day,
           (count(*) filter (where e.event_type = 'profile_scraped')
            - count(*) filter (where e.event_type = 'profile_view_quota_blocked'))::int as opens,
           count(*) filter (where e.event_type = 'contact_created')::int          as created,
           count(*) filter (where e.event_type = 'dedup_match')::int              as dupes,
           count(*) filter (where e.event_type = 'candidate_uncontactable')::int  as no_contact
    from djc_event_log e
    group by 1
  `
  const autoBy = new Map(auto.map(a => [a.day, a]))
  const latest = cycles[cycles.length - 1]?.start

  return cycles.map((c, i) => {
    const end = cycles[i + 1]?.start ?? '9999-12-31'
    let opens = 0, created = 0, dupes = 0, noContact = 0
    for (const [day, a] of autoBy) {
      if (day >= c.start && day < end) {
        opens += a.opens; created += a.created; dupes += a.dupes; noContact += a.no_contact
      }
    }
    const withinAuto = Math.max(opens - created - noContact, 0)
    return {
      cycleStart: c.start,
      views: c.used,
      cap: c.total,
      addedToSf: created,
      alreadyInSf: Math.min(dupes, withinAuto),
      noContact,
      // Counter movement the automation cannot account for: manual browsing, backfills, anyone
      // logged in on the shared account.
      other: Math.max(c.used - created - noContact - Math.min(dupes, withinAuto), 0),
      isCurrent: c.start === latest,
    }
  })
}

/**
 * How many views this cycle will end on, from the recent daily rate.
 *
 * Uses calendar days rather than only days the automation ran: the schedule is weekdays-only, so
 * dividing by active days alone would overstate the run-rate by about 40%.
 */
export async function getCycleProjection(): Promise<CycleProjection | null> {
  const sql = djcSql
  if (!sql) return null
  const [row] = await sql<{ used: number; cycle_start: string }[]>`
    select (count(*) filter (where e.event_type = 'profile_scraped')
            - count(*) filter (where e.event_type = 'profile_view_quota_blocked'))::int as used,
           ${sql.unsafe(CYCLE_START)} as cycle_start
    from djc_event_log e ${sql.unsafe(SCHEDULED)}
    group by 2 order by 2 desc limit 1
  `
  if (!row) return null
  const [rate] = await sql<{ total: number }[]>`
    select (count(*) filter (where e.event_type = 'profile_scraped')
            - count(*) filter (where e.event_type = 'profile_view_quota_blocked'))::int as total
    from djc_event_log e ${sql.unsafe(SCHEDULED)}
    where e.created_at >= now() - interval '21 days'
  `
  // dow is computed in the subquery: an aggregate cannot appear in GROUP BY, which silently
  // failed the whole ops block and rendered nothing.
  const weekday = await sql<{ day: string; views: number }[]>`
    select day, round(avg(v))::int as views
    from (
      select to_char((e.created_at at time zone 'America/New_York')::date, 'Dy') as day,
             extract(dow from (e.created_at at time zone 'America/New_York')::date)::int as dow,
             (e.created_at at time zone 'America/New_York')::date as d,
             (count(*) filter (where e.event_type = 'profile_scraped')
              - count(*) filter (where e.event_type = 'profile_view_quota_blocked'))::int as v
      from djc_event_log e ${sql.unsafe(SCHEDULED)}
      where e.created_at >= now() - interval '28 days'
      group by 1, 2, 3
    ) x
    group by day, dow order by dow
  `
  const start = new Date(isoDate(row.cycle_start) + 'T00:00:00Z')
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1)
  const now = new Date()
  const day = 86_400_000
  const daysElapsed = Math.max(Math.round((now.getTime() - start.getTime()) / day), 1)
  const daysRemaining = Math.max(Math.round((end.getTime() - now.getTime()) / day), 0)
  const perDay = (rate?.total ?? 0) / 21
  return {
    cycleStart: isoDate(row.cycle_start),
    cycleEnd: end.toISOString().slice(0, 10),
    used: row.used,
    daysElapsed,
    daysRemaining,
    perDay: Math.round(perDay * 10) / 10,
    perWeek: Math.round(perDay * 7),
    projectedTotal: Math.round(row.used + perDay * daysRemaining),
    byWeekday: weekday.map(w => ({ day: w.day.trim(), views: w.views })),
  }
}

/** Contacts the automation created, per month, split by the roles Proxi thinks in. */
export async function getSourcingByMonth(): Promise<SourcingMonth[]> {
  const sql = djcSql
  if (!sql) return []
  const rows = await sql<
    { month: string; role: string; n: number }[]
  >`
    select to_char(date_trunc('month', first_seen_at), 'YYYY-MM') as month,
           case when target = 'Dental Assistant' then 'assistant'
                when target = 'Dental Hygienist' then 'hygienist'
                when target = 'General Dentistry' then 'general'
                else 'specialist' end                            as role,
           count(*)::int                                         as n
    from djc_candidates
    where dedup_status = 'new' and sf_contact_id is not null
    group by 1, 2 order by 1
  `
  const byMonth = new Map<string, SourcingMonth>()
  for (const r of rows) {
    const m = byMonth.get(r.month)
      ?? { month: r.month, generalDentist: 0, specialist: 0, hygienist: 0, assistant: 0 }
    if (r.role === 'general') m.generalDentist = r.n
    else if (r.role === 'specialist') m.specialist = r.n
    else if (r.role === 'hygienist') m.hygienist = r.n
    else m.assistant = r.n
    byMonth.set(r.month, m)
  }
  return [...byMonth.values()]
}

/** What happened to the candidates the automation created. */
export async function getAutomationFunnel(): Promise<AutomationFunnel> {
  const sql = djcSql
  if (!sql) return { sourced: 0, applied: 0, submitted: 0, placed: 0 }
  const [r] = await sql<AutomationFunnel[]>`
    select count(*)::int as sourced,
           count(*) filter (where exists (
             select 1 from djc_sf_applications a where a.applicant_sf_id = c.sf_contact_id))::int as applied,
           count(*) filter (where exists (
             select 1 from djc_sf_applications a
             where a.applicant_sf_id = c.sf_contact_id and a.submittal_on is not null))::int as submitted,
           count(*) filter (where exists (
             select 1 from djc_sf_applications a
             where a.applicant_sf_id = c.sf_contact_id and a.placed_on is not null))::int as placed
    from djc_candidates c
    where c.dedup_status = 'new' and c.sf_contact_id is not null
  `
  return r ?? { sourced: 0, applied: 0, submitted: 0, placed: 0 }
}

export interface EfficiencyWeek {
  week: string
  general: number
  specialist: number
  hygienist: number
  assistant: number
  views: number
  created: number
}

export interface RoleSpend {
  role: string
  views: number
  added: number
  viewsEach: number
  hitRate: number
}

export interface ActivityBucket { label: string; count: number; pct: number }

/**
 * Views spent per week, split by the role the view was spent on.
 *
 * Counts are the unit, not a rate: this chart is read to judge whether the automation is spending
 * at a sensible pace, and a percentage axis on weekly counts hid the volume entirely.
 */
export async function getEfficiencyWeeks(months = 6): Promise<EfficiencyWeek[]> {
  const sql = djcSql
  if (!sql) return []
  const rows = await sql<
    { week: string; role: string; views: number; created: number }[]
  >`
    select to_char(date_trunc('week', e.created_at at time zone 'America/New_York'), 'YYYY-MM-DD') as week,
           case when c.target = 'Dental Assistant' then 'assistant'
                when c.target = 'Dental Hygienist' then 'hygienist'
                when c.target = 'General Dentistry' then 'general'
                else 'specialist' end                                          as role,
           (count(*) filter (where e.event_type = 'profile_scraped')
            - count(*) filter (where e.event_type = 'profile_view_quota_blocked'))::int as views,
           count(*) filter (where e.event_type = 'contact_created')::int        as created
    from djc_event_log e ${sql.unsafe(SCHEDULED)}
    left join djc_candidates c on c.candidate_id = e.candidate_id
    where e.created_at >= now() - (${months} || ' months')::interval
      and e.candidate_id is not null
    group by 1, 2 order by 1
  `
  const byWeek = new Map<string, EfficiencyWeek>()
  for (const r of rows) {
    const w = byWeek.get(r.week)
      ?? { week: r.week, general: 0, specialist: 0, hygienist: 0, assistant: 0, views: 0, created: 0 }
    if (r.role === 'general') w.general += r.views
    else if (r.role === 'specialist') w.specialist += r.views
    else if (r.role === 'hygienist') w.hygienist += r.views
    else w.assistant += r.views
    w.views += r.views
    w.created += r.created
    byWeek.set(r.week, w)
  }
  return [...byWeek.values()]
}

/** How recently every candidate we know of was active on DJC — share and absolute. */
export async function getActivityBuckets(): Promise<ActivityBucket[]> {
  const sql = djcSql
  if (!sql) return []
  const rows = await sql<{ label: string; ord: number; n: number }[]>`
    with a as (
      select case when last_activity ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$'
                  then to_date(last_activity, 'FMMM/FMDD/FMYY') end as la
      from djc_candidates
    )
    select case when la is null then 'No activity date'
                when la >= current_date - 7 then 'Active this week'
                when la >= current_date - 30 then '8-30 days ago'
                when la >= current_date - 90 then '1-3 months ago'
                when la >= current_date - 180 then '3-6 months ago'
                else 'Over 6 months ago' end as label,
           case when la is null then 6
                when la >= current_date - 7 then 0
                when la >= current_date - 30 then 1
                when la >= current_date - 90 then 2
                when la >= current_date - 180 then 3
                else 4 end                   as ord,
           count(*)::int                     as n
    from a group by 1, 2 order by 2
  `
  const total = rows.reduce((s, r) => s + r.n, 0) || 1
  return rows.map(r => ({ label: r.label, count: r.n, pct: Math.round((r.n / total) * 1000) / 10 }))
}

export interface CandidateOutcomes {
  unique: number
  addedToSf: number
  alreadyInSf: number
  noContact: number
  other: number
}

export interface LocationSupply {
  state: string
  openJobs: number
  candidates: number
  everPlaced: number      // placements we have ever made in that state
  practices: number       // distinct clients there
}

export interface OutreachMonth {
  month: string
  sourced: number
  contacted: number
  putForward: number
  submitted: number
  placed: number
}

export interface TouchBucket {
  label: string
  people: number
  forward: number
  rate: number
}

export interface EmailEngagement {
  contacts: number
  sent: number
  opened: number
  replied: number
  bounced: number
  openRate: number
  replyRate: number
}

export interface ReachStage {
  label: string
  people: number
  note: string
}

export interface OutreachDetail {
  reach: ReachStage[]
  conversations: number
  smsSent: number
  smsRead: number
  onlyFailed: number
  convThenForward: number
  email: EmailEngagement
  poolTotal: number
  poolContacted: number
  poolCalls: number
  poolEmails: number
  medianDaysToFirst: number | null
  contactedWithinDay: number
  contactedTotal: number
  buckets: TouchBucket[]
  calls: number
  emails: number
  touchesEach: number
  contactedNotForward: number
  neverContacted: number
  forwardWithOutreach: number
  putForward: number
}

/**
 * Distinct candidates the automation touched in a window, split by what happened to each.
 *
 * People, not events: a candidate seen in three runs is one person here. The four buckets are
 * mutually exclusive and sum to the total, so the card cannot show parts that exceed the whole.
 */
export async function getCandidateOutcomes(sinceDays: number | null): Promise<CandidateOutcomes> {
  const sql = djcSql
  if (!sql) return { unique: 0, addedToSf: 0, alreadyInSf: 0, noContact: 0, other: 0 }
  const where = sinceDays === null
    ? sql`true`
    : sql`c.first_seen_at >= now() - (${sinceDays} || ' days')::interval`
  const [r] = await sql<CandidateOutcomes[]>`
    select count(*)::int                                                       as unique,
           count(*) filter (where c.dedup_status = 'new'
                              and c.sf_contact_id is not null)::int            as "addedToSf",
           count(*) filter (where c.dedup_status = 'duplicate')::int           as "alreadyInSf",
           count(*) filter (where c.dedup_status is distinct from 'new'
                              and c.dedup_status is distinct from 'duplicate'
                              and c.contact_source = 'none')::int              as "noContact",
           count(*) filter (where c.dedup_status is distinct from 'new'
                              and c.dedup_status is distinct from 'duplicate'
                              and c.contact_source is distinct from 'none')::int as other
    from djc_candidates c
    where ${where}
  `
  return r ?? { unique: 0, addedToSf: 0, alreadyInSf: 0, noContact: 0, other: 0 }
}

/** Open jobs against available candidates, per state — where sourcing would actually pay. */
export async function getLocationSupply(): Promise<LocationSupply[]> {
  const sql = djcSql
  if (!sql) return []
  const rows = await sql<
    { state: string; open_jobs: number; candidates: number; ever_placed: number; practices: number }[]
  >`
    with cands as (
      select distinct m.sf_contact_id, split_part(m.job_city_state, ', ', 2) as st
      from djc_job_matches m
      join djc_candidates c on c.sf_contact_id = m.sf_contact_id
      where m.is_live
        and case when c.last_activity ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$'
                 then to_date(c.last_activity, 'FMMM/FMDD/FMYY') end >= current_date - 90
        and not exists (select 1 from djc_sf_applications a
                        where a.applicant_sf_id = c.sf_contact_id and a.placed_on is not null)
    )
    select coalesce(nullif(j.state, ''), 'Unknown')                   as state,
           count(distinct j.job_sf_id)::int                           as open_jobs,
           (select count(*)::int from cands where cands.st = j.state)  as candidates,
           -- Track record: a state we have filled before is a very different prospect from one we
           -- have never cracked, even at the same supply ratio.
           (select count(*)::int from sf_placements p where p.job_state = j.state) as ever_placed,
           (select count(distinct practice)::int from djc_jobs d where d.state = j.state) as practices
    from djc_open_jobs j
    group by j.state
    order by count(distinct j.job_sf_id) desc
  `
  return rows.map(r => ({
    state: r.state, openJobs: r.open_jobs, candidates: r.candidates,
    everPlaced: r.ever_placed, practices: r.practices,
  }))
}

/** Month by month: of the candidates sourced then, how many moved down the pipeline. */
export async function getOutreachByMonth(): Promise<OutreachMonth[]> {
  const sql = djcSql
  if (!sql) return []
  const rows = await sql<OutreachMonth[]>`
    select to_char(date_trunc('month', c.first_seen_at), 'YYYY-MM')  as month,
           count(*)::int                                            as sourced,
           count(*) filter (where coalesce(c.outreach_total, 0) > 0)::int as contacted,
           count(*) filter (where exists (
             select 1 from djc_sf_applications a
             where a.applicant_sf_id = c.sf_contact_id))::int        as "putForward",
           count(*) filter (where exists (
             select 1 from djc_sf_applications a
             where a.applicant_sf_id = c.sf_contact_id and a.submittal_on is not null))::int as submitted,
           count(*) filter (where exists (
             select 1 from djc_sf_applications a
             where a.applicant_sf_id = c.sf_contact_id and a.placed_on is not null))::int as placed
    from djc_candidates c
    where c.dedup_status = 'new' and c.sf_contact_id is not null
    group by 1 order by 1
  `
  return rows
}

/**
 * Views spent and candidates gained, per role — the cost of a candidate by discipline.
 *
 * This is the question "who do we spend it on" actually needs answering: not the volume split,
 * which two stacked charts already showed twice, but what each discipline costs. General dentists
 * take 4.4 views per contact against 1.8 for assistants, and they absorb most of the budget.
 */
export async function getRoleSpend(): Promise<RoleSpend[]> {
  const sql = djcSql
  if (!sql) return []
  const rows = await sql<{ role: string; views: number; added: number }[]>`
    select case when c.target = 'Dental Assistant' then 'Assistants'
                when c.target = 'Dental Hygienist' then 'Hygienists'
                when c.target = 'General Dentistry' then 'General dentists'
                else 'Specialists' end                                          as role,
           (count(*) filter (where e.event_type = 'profile_scraped')
            - count(*) filter (where e.event_type = 'profile_view_quota_blocked'))::int as views,
           count(*) filter (where e.event_type = 'contact_created')::int         as added
    from djc_event_log e ${sql.unsafe(SCHEDULED)}
    join djc_candidates c on c.candidate_id = e.candidate_id
    group by 1 order by 2 desc
  `
  return rows.map(r => ({
    role: r.role,
    views: r.views,
    added: r.added,
    viewsEach: r.added ? Math.round((r.views / r.added) * 10) / 10 : 0,
    hitRate: r.views ? Math.round((r.added / r.views) * 100) : 0,
  }))
}

/**
 * The outreach step in detail — the gap the funnel could not previously explain.
 *
 * Salesforce logs a Task for every call, text and email on a Contact. Before this the funnel went
 * straight from "added" to "put forward", so the 372 who never advanced were one undifferentiated
 * mass. They are actually two different failures: people nobody ever called, and people who were
 * called and went no further. Only the second is a conversion problem.
 */
export async function getOutreachDetail(): Promise<OutreachDetail> {
  const empty: OutreachDetail = { calls: 0, emails: 0, touchesEach: 0, contactedNotForward: 0,
    neverContacted: 0, forwardWithOutreach: 0, putForward: 0, poolTotal: 0, poolContacted: 0,
    poolCalls: 0, poolEmails: 0, medianDaysToFirst: null, contactedWithinDay: 0,
    contactedTotal: 0, buckets: [], reach: [], conversations: 0, smsSent: 0, smsRead: 0,
    onlyFailed: 0, convThenForward: 0,
    email: { contacts: 0, sent: 0, opened: 0, replied: 0, bounced: 0, openRate: 0, replyRate: 0 } }
  const sql = djcSql
  if (!sql) return empty
  const [r] = await sql<
    { calls: number; emails: number; touches: number; contacted: number; never_contacted: number;
      fwd_with: number; fwd: number }[]
  >`
    with c as (
      select djc_candidates.*,
             coalesce(outreach_total, 0) > 0 as touched,
             exists (select 1 from djc_sf_applications a
                     where a.applicant_sf_id = djc_candidates.sf_contact_id) as forwarded
      from djc_candidates
      where sf_contact_id is not null and dedup_status = 'new'
    )
    select coalesce(sum(outreach_calls), 0)::int                              as calls,
           coalesce(sum(outreach_emails), 0)::int                             as emails,
           coalesce(avg(outreach_total) filter (where touched), 0)::float     as touches,
           count(*) filter (where touched and not forwarded)::int             as contacted,
           count(*) filter (where not touched)::int                           as never_contacted,
           count(*) filter (where forwarded and touched)::int                 as fwd_with,
           count(*) filter (where forwarded)::int                             as fwd
    from c
  `
  // Does persistence pay? Bucketed by how many times a candidate was reached, against whether they
  // were ever put forward. This is the sharpest operational finding on the board.
  const buckets = await sql<{ b: string; ord: number; people: number; forward: number }[]>`
    with c as (
      select coalesce(outreach_total, 0) as n,
             exists (select 1 from djc_sf_applications a
                     where a.applicant_sf_id = djc_candidates.sf_contact_id) as fwd
      from djc_candidates
      where sf_contact_id is not null and dedup_status = 'new'
    )
    select case when n = 0 then 'Never called'
                when n = 1 then '1 touch'
                when n <= 3 then '2-3 touches'
                when n <= 6 then '4-6 touches'
                else '7+ touches' end                       as b,
           case when n = 0 then 0 when n = 1 then 1 when n <= 3 then 2
                when n <= 6 then 3 else 4 end               as ord,
           count(*)::int                                    as people,
           count(*) filter (where fwd)::int                 as forward
    from c group by 1, 2 order by 2
  `
  const [speed] = await sql<
    { med: number | null; within_day: number; total: number }[]
  >`
    select percentile_cont(0.5) within group (order by (first_outreach_at - first_seen_at::date)) as med,
           count(*) filter (where first_outreach_at <= first_seen_at::date + 1)::int as within_day,
           count(*) filter (where first_outreach_at is not null)::int                as total
    from djc_candidates
    where sf_contact_id is not null and dedup_status = 'new'
  `
  const [pool] = await sql<
    { total: number; contacted: number; calls: number; emails: number }[]
  >`
    select count(*)::int                                                    as total,
           count(*) filter (where coalesce(outreach_total, 0) > 0)::int     as contacted,
           coalesce(sum(outreach_calls), 0)::int                            as calls,
           coalesce(sum(outreach_emails), 0)::int                           as emails
    from djc_candidates where sf_contact_id is not null
  `
  // Email carries engagement signals a logged call cannot: opens, replies, bounces.
  const [em] = await sql<
    { contacts: number; sent: number; opened: number; replied: number; bounced: number }[]
  >`
    select count(*) filter (where coalesce(emails_sent, 0) > 0)::int as contacts,
           coalesce(sum(emails_sent), 0)::int                        as sent,
           coalesce(sum(emails_opened), 0)::int                      as opened,
           coalesce(sum(emails_replied), 0)::int                     as replied,
           coalesce(sum(emails_bounced), 0)::int                     as bounced
    from djc_candidates where sf_contact_id is not null
  `
  // Attempt is not contact. Most logged "calls" are texts, and only a few dispositions mean a
  // person actually spoke to the candidate — Connected, Connected - Screened, Answered - Talked to
  // Doc, Conversation, Contact. This ladder separates trying from reaching.
  const [reach] = await sql<
    { sourced: number; attempted: number; read: number; talked: number; forwarded: number;
      only_failed: number; conv_fwd: number; sms: number; sms_read: number; convs: number }[]
  >`
    with c as (
      select coalesce(outreach_total, 0)   as touches,
             coalesce(conversations, 0)    as convs,
             coalesce(sms_read, 0)         as sms_read,
             coalesce(sms_sent, 0)         as sms,
             exists (select 1 from djc_sf_applications a
                     where a.applicant_sf_id = djc_candidates.sf_contact_id) as fwd
      from djc_candidates
      where sf_contact_id is not null and dedup_status = 'new'
    )
    select count(*)::int                                                     as sourced,
           count(*) filter (where touches > 0)::int                          as attempted,
           count(*) filter (where sms_read > 0)::int                         as read,
           count(*) filter (where convs > 0)::int                            as talked,
           count(*) filter (where fwd)::int                                  as forwarded,
           count(*) filter (where touches > 0 and convs = 0 and sms_read = 0)::int as only_failed,
           count(*) filter (where convs > 0 and fwd)::int                    as conv_fwd,
           coalesce(sum(sms), 0)::int                                        as sms,
           coalesce(sum(sms_read), 0)::int                                   as sms_read,
           coalesce(sum(convs), 0)::int                                      as convs
    from c
  `
  return {
    calls: r?.calls ?? 0,
    emails: r?.emails ?? 0,
    reach: [
      { label: 'Sourced', people: reach?.sourced ?? 0, note: 'added to Salesforce' },
      { label: 'Someone tried', people: reach?.attempted ?? 0, note: 'a text, call or email was sent' },
      { label: 'Message was read', people: reach?.read ?? 0, note: 'text delivered and opened' },
      { label: 'Actually spoke', people: reach?.talked ?? 0, note: 'a two-way conversation logged' },
      { label: 'Put forward', people: reach?.forwarded ?? 0, note: 'matched to a job' },
    ],
    conversations: reach?.convs ?? 0,
    smsSent: reach?.sms ?? 0,
    smsRead: reach?.sms_read ?? 0,
    onlyFailed: reach?.only_failed ?? 0,
    convThenForward: reach?.conv_fwd ?? 0,
    email: {
      contacts: em?.contacts ?? 0,
      sent: em?.sent ?? 0,
      opened: em?.opened ?? 0,
      replied: em?.replied ?? 0,
      bounced: em?.bounced ?? 0,
      openRate: em?.sent ? Math.round((em.opened / em.sent) * 100) : 0,
      replyRate: em?.sent ? Math.round((em.replied / em.sent) * 100) : 0,
    },
    touchesEach: Math.round((r?.touches ?? 0) * 10) / 10,
    contactedNotForward: r?.contacted ?? 0,
    neverContacted: r?.never_contacted ?? 0,
    forwardWithOutreach: r?.fwd_with ?? 0,
    putForward: r?.fwd ?? 0,
    poolTotal: pool?.total ?? 0,
    poolContacted: pool?.contacted ?? 0,
    poolCalls: pool?.calls ?? 0,
    poolEmails: pool?.emails ?? 0,
    medianDaysToFirst: speed?.med === null || speed?.med === undefined ? null : Math.round(Number(speed.med)),
    contactedWithinDay: speed?.within_day ?? 0,
    contactedTotal: speed?.total ?? 0,
    buckets: buckets.map(b => ({
      label: b.b, people: b.people, forward: b.forward,
      rate: b.people ? Math.round((b.forward / b.people) * 100) : 0,
    })),
  }
}

export interface JobMonth {
  month: string
  opened: number
  submitted: number   // ...that we put someone forward for
  filled: number
  priorYear: number | null
}

export interface JobDuration { label: string; jobs: number; filled: number; pct: number }
export interface JobGroup { name: string; opened: number; submitted: number; filled: number }
export interface OpenJobAge { label: string; jobs: number }

export interface JobEffectiveness {
  months: JobMonth[]
  quarters: { label: string; opened: number; submitted: number; filled: number; priorYear: number | null }[]
  durations: JobDuration[]
  byState: JobGroup[]
  byType: JobGroup[]
  byPractice: JobGroup[]
  openAges: OpenJobAge[]
  ytdOpened: number
  ytdFilled: number
  ytdSubmitted: number
  priorYtdOpened: number
  practicesTotal: number
  topPracticeShare: number
  openNow: number
}

/**
 * How well Proxi fills the roles it takes on.
 *
 * Three outcomes per job, not one: did anyone get put forward, and was it ultimately filled. A job
 * that closed with nobody submitted failed differently from one where candidates were sent and
 * rejected, and the fix is different too.
 *
 * `days_open` is Salesforce's own Days_Open__c. Job_Closed_Date__c exists but is populated on only
 * 491 of 4,700 jobs and carries obviously wrong values (2019 close dates on open jobs), so it is
 * not used.
 */
export async function getJobEffectiveness(): Promise<JobEffectiveness | null> {
  const sql = djcSql
  if (!sql) return null

  const months = await sql<
    { month: string; opened: number; submitted: number; filled: number }[]
  >`
    select to_char(date_trunc('month', open_date), 'YYYY-MM')   as month,
           count(*)::int                                        as opened,
           count(*) filter (where coalesce(submittals, 0) > 0)::int as submitted,
           count(*) filter (where filled)::int                   as filled
    from djc_jobs
    where open_date >= date_trunc('month', now()) - interval '23 months' and open_date <= now()
    group by 1 order by 1
  `
  const byMonth = new Map(months.map(m => [m.month, m.opened]))
  const priorOf = (m: string) => {
    const [y, mm] = m.split('-').map(Number)
    return `${y - 1}-${String(mm).padStart(2, '0')}`
  }

  const quarters = await sql<
    { y: number; q: number; opened: number; submitted: number; filled: number }[]
  >`
    select extract(year from open_date)::int as y, extract(quarter from open_date)::int as q,
           count(*)::int as opened,
           count(*) filter (where coalesce(submittals, 0) > 0)::int as submitted,
           count(*) filter (where filled)::int as filled
    from djc_jobs
    where open_date >= date_trunc('year', now()) - interval '2 years' and open_date <= now()
    group by 1, 2 order by 1, 2
  `
  const qOpened = new Map(quarters.map(r => [`${r.y}-${r.q}`, r.opened]))

  // How long jobs stay open. Sub-day closures are called out separately: several were never really
  // available to fill, and lumping them in flatters the fill rate.
  const durations = await sql<{ label: string; ord: number; jobs: number; filled: number }[]>`
    select case when days_open < 1 then 'Under a day'
                when days_open <= 7 then '1-7 days'
                when days_open <= 30 then '8-30 days'
                when days_open <= 90 then '1-3 months'
                else 'Over 3 months' end                       as label,
           case when days_open < 1 then 0 when days_open <= 7 then 1
                when days_open <= 30 then 2 when days_open <= 90 then 3 else 4 end as ord,
           count(*)::int                                       as jobs,
           count(*) filter (where filled)::int                  as filled
    from djc_jobs where days_open is not null
    group by 1, 2 order by 2
  `
  const durTotal = durations.reduce((a, d) => a + d.jobs, 0) || 1

  const group = async (col: 'state' | 'specialty' | 'practice') => sql<
    { name: string; opened: number; submitted: number; filled: number }[]
  >`
    select coalesce(${sql(col)}, 'Unknown')                      as name,
           count(*)::int                                         as opened,
           count(*) filter (where coalesce(submittals, 0) > 0)::int as submitted,
           count(*) filter (where filled)::int                    as filled
    from djc_jobs
    where open_date >= now() - interval '12 months'
    group by 1 having count(*) >= 2
    order by count(*) desc limit 15
  `
  const [byState, byType, byPractice] = [await group('state'), await group('specialty'), await group('practice')]

  // Age of what is open right now — a long-open job is where a client is losing patience.
  const openAges = await sql<{ label: string; ord: number; jobs: number }[]>`
    select case when days_open <= 7 then 'Under a week'
                when days_open <= 30 then '1-4 weeks'
                when days_open <= 90 then '1-3 months'
                else 'Over 3 months' end as label,
           case when days_open <= 7 then 0 when days_open <= 30 then 1
                when days_open <= 90 then 2 else 3 end as ord,
           count(*)::int as jobs
    from djc_jobs where status = 'Open' and days_open is not null
    group by 1, 2 order by 2
  `
  const [ytd] = await sql<
    { opened: number; filled: number; submitted: number; prior: number; practices: number;
      top_practice: number; open_now: number }[]
  >`
    select count(*) filter (where extract(year from open_date) = extract(year from now()))::int as opened,
           count(*) filter (where extract(year from open_date) = extract(year from now())
                              and filled)::int                                                  as filled,
           count(*) filter (where extract(year from open_date) = extract(year from now())
                              and coalesce(submittals, 0) > 0)::int                             as submitted,
           count(*) filter (where extract(year from open_date) = extract(year from now()) - 1
                              and extract(doy from open_date) <= extract(doy from now()))::int  as prior,
           count(distinct practice)::int                                                        as practices,
           (select count(*)::int from djc_jobs j2
            where j2.practice = (select practice from djc_jobs group by practice
                                 order by count(*) desc limit 1))                               as top_practice,
           count(*) filter (where status = 'Open')::int                                         as open_now
    from djc_jobs
  `
  return {
    months: months.map(m => ({ ...m, priorYear: byMonth.get(priorOf(m.month)) ?? null })),
    quarters: quarters.map(r => ({
      label: `Q${r.q} ${String(r.y).slice(2)}`, opened: r.opened, submitted: r.submitted,
      filled: r.filled, priorYear: qOpened.get(`${r.y - 1}-${r.q}`) ?? null,
    })),
    durations: durations.map(d => ({
      label: d.label, jobs: d.jobs, filled: d.filled,
      pct: Math.round((d.jobs / durTotal) * 100),
    })),
    byState, byType, byPractice,
    openAges: openAges.map(a => ({ label: a.label, jobs: a.jobs })),
    ytdOpened: ytd?.opened ?? 0,
    ytdFilled: ytd?.filled ?? 0,
    ytdSubmitted: ytd?.submitted ?? 0,
    priorYtdOpened: ytd?.prior ?? 0,
    practicesTotal: ytd?.practices ?? 0,
    topPracticeShare: ytd?.top_practice ?? 0,
    openNow: ytd?.open_now ?? 0,
  }
}
