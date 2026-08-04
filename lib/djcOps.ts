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
  /** The day the allowance refilled — what the cycle is actually NAMED after. */
  refillDate: string
  /** First day we have a counter reading for. Differs from refillDate only on the first cycle,
   *  where tracking began mid-way through and we never saw that cycle's refill. */
  observedFrom: string
  cycleStart: string
  views: number
  cap: number
  /** Profiles the automation actually opened — its real spend against the counter. */
  autoOpens: number
  /** Duplicates it recognised without opening anything, so they cost nothing. */
  freeSkips: number
  /** Counter already spent before we began reading it — only ever the first, partial cycle. */
  beforeTracking: number
  /** One-off jobs that opened profiles in bulk without logging per profile (e.g. 22 Jul 2026). */
  bulkUnlogged: number
  /** Days on which bulk spend landed, so the UI can name them rather than hand-wave. */
  bulkDays: { day: string; views: number }[]
  addedToSf: number
  alreadyInSf: number
  noContact: number
  other: number
  isCurrent: boolean
  /** First tracked window: snapshots began mid-cycle, so it is an observation, not a full cycle. */
  partialStart: boolean
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
  const auto = await sql<
    { day: string; opens: number; blocked: number; created: number; dupes: number; no_contact: number }[]
  >`
    select to_char((e.created_at at time zone 'America/New_York')::date, 'YYYY-MM-DD') as day,
           (count(*) filter (where e.event_type = 'profile_scraped')
            - count(*) filter (where e.event_type = 'profile_view_quota_blocked'))::int as opens,
           count(*) filter (where e.event_type = 'profile_view_quota_blocked')::int as blocked,
           count(*) filter (where e.event_type = 'contact_created')::int          as created,
           count(*) filter (where e.event_type = 'dedup_match')::int              as dupes,
           count(*) filter (where e.event_type = 'candidate_uncontactable')::int  as no_contact
    from djc_event_log e
    group by 1
  `
  const autoBy = new Map(auto.map(a => [a.day, a]))
  const latest = cycles[cycles.length - 1]?.start

  /** The allowance refills on the 15th, so a cycle beginning on any date belongs to the 15th on
   *  or before it. Without this the first bar was labelled with the day we happened to start
   *  reading the counter (9 July), which reads as a cycle that never existed. */
  const refillFor = (day: string) => {
    const [y, m, d] = day.split('-').map(Number)
    const month = d >= 15 ? m : m === 1 ? 12 : m - 1
    const year = d >= 15 ? y : m === 1 ? y - 1 : y
    return `${year}-${String(month).padStart(2, '0')}-15`
  }

  return cycles.map((c, i) => {
    const end = cycles[i + 1]?.start ?? '9999-12-31'
    let opens = 0, blocked = 0, created = 0, dupes = 0, noContact = 0
    for (const [day, a] of autoBy) {
      if (day >= c.start && day < end) {
        opens += a.opens; blocked += a.blocked
        created += a.created; dupes += a.dupes; noContact += a.no_contact
      }
    }

    // Split the counter movement the automation did not log, day by day, so the chart can name it
    // instead of showing one anonymous grey block. Three very different things hide in there:
    //   * spend that predates our first counter reading (only the first, partial cycle);
    //   * a one-off job that opened profiles in bulk and logged nothing per profile — the 22 July
    //     2026 profile-facts pass moved the counter 623 in a night;
    //   * genuine day-to-day drift, which in practice is ~0.
    const BULK_DAY = 100   // a human browsing does not open a hundred profiles in a day
    const cycleDays = days.filter(d => d.day >= c.start && d.day < end)
    let beforeTracking = 0, bulkUnlogged = 0, drift = 0
    const bulkDays: { day: string; views: number }[] = []
    let prevUsed: number | null = null
    for (const d of cycleDays) {
      const moved = prevUsed === null ? d.used : d.used - prevUsed
      prevUsed = d.used
      const ours = autoBy.get(d.day)?.opens ?? 0
      const unlogged = Math.max(moved - ours, 0)
      if (unlogged <= 0) continue
      if (i === 0 && bulkDays.length === 0 && beforeTracking === 0 && d === cycleDays[0]) {
        // First reading of the first cycle: the counter was already part-spent when we arrived.
        beforeTracking += unlogged
      } else if (unlogged >= BULK_DAY) {
        bulkUnlogged += unlogged
        bulkDays.push({ day: d.day, views: unlogged })
      } else {
        drift += unlogged
      }
    }
    // The automation's OWN spend is the profiles it opened, net of the ones the quota wall
    // refused (a walled profile is served an "Oops" page and costs nothing).
    //
    // Outcomes cannot be used as a spend breakdown, which is what the old arithmetic did: it
    // subtracted created + no-contact + duplicates from the counter and called the remainder
    // manual. But most duplicate skips and some no-contact skips are decided for FREE — from the
    // list card or the DJC link — so outcomes routinely exceed opens (this cycle: 656 outcomes
    // against 299 paid opens), which pushed hundreds of the automation's own views into the
    // "manual" band and made the shared login look far busier than it is.
    const noContactPaid = Math.max(noContact - blocked, 0)
    const alreadyInSfPaid = Math.min(dupes, Math.max(opens - created - noContactPaid, 0))
    return {
      refillDate: refillFor(c.start),
      observedFrom: c.start,
      cycleStart: c.start,
      views: c.used,
      // DJC's counter reports `total` inflated by purchased add-on packs (850 when a 100-pack was
      // bought). The plan's allowance has always been 750 — that is the line the chart draws.
      cap: VIEW_CAP,
      autoOpens: opens,
      freeSkips: Math.max(dupes - alreadyInSfPaid, 0),
      addedToSf: created,
      alreadyInSf: alreadyInSfPaid,
      noContact: noContactPaid,
      ...(() => {
        // The day-by-day figures are indicative, not exact: a day with no counter reading folds its
        // movement into the next one, so the raw parts can exceed what the counter actually moved.
        // Clamp them to the cycle's real unlogged total so the bands always sum to the counter.
        const unlogged = Math.max(c.used - opens, 0)
        const bulk = Math.min(bulkUnlogged, unlogged)
        const before = Math.min(beforeTracking, unlogged - bulk)
        return { beforeTracking: before, bulkUnlogged: bulk, bulkDays }
      })(),
      // Whatever is left once the automation's opens, the pre-tracking spend and the bulk jobs are
      // accounted for. Kept as its own band so it cannot quietly absorb the others again.
      other: Math.max(c.used - opens - Math.min(beforeTracking, Math.max(c.used - opens, 0))
        - Math.min(bulkUnlogged, Math.max(c.used - opens, 0)), 0),
      isCurrent: c.start === latest,
      partialStart: i === 0,
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

export interface ActivityBucketByRole {
  role: 'general' | 'specialist' | 'hygienist' | 'assistant' | string
  label: string
  ord: number
  count: number
}

export interface ActivityBucket { label: string; count: number; pct: number }

/** Roll the per-role rows up into the flat all-roles split most callers want. */
export function rollUpActivity(rows: ActivityBucketByRole[]): ActivityBucket[] {
  const byLabel = new Map<string, { ord: number; count: number }>()
  for (const r of rows) {
    const cur = byLabel.get(r.label) ?? { ord: r.ord, count: 0 }
    cur.count += r.count
    byLabel.set(r.label, cur)
  }
  const total = [...byLabel.values()].reduce((s, b) => s + b.count, 0) || 1
  return [...byLabel.entries()]
    .sort((a, b) => a[1].ord - b[1].ord)
    .map(([label, b]) => ({ label, count: b.count, pct: Math.round((b.count / total) * 1000) / 10 }))
}

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
/**
 * When the candidates WE HAVE SEEN were last active on DJC — split by role so the block's role
 * toggle can re-scope it.
 *
 * Important: this is not the whole of DentistJobCafe. It counts the candidates the automation has
 * recorded (`djc_candidates`), which is everyone it has surfaced in a list scan — viewed or not —
 * not DJC's entire membership, which we have no way to count.
 */
export async function getActivityBuckets(): Promise<ActivityBucketByRole[]> {
  const sql = djcSql
  if (!sql) return []
  const rows = await sql<{ role: string; label: string; ord: number; n: number }[]>`
    with a as (
      select case when target = 'Dental Assistant' then 'assistant'
                  when target = 'Dental Hygienist' then 'hygienist'
                  when target = 'General Dentistry' then 'general'
                  else 'specialist' end as role,
             case when last_activity ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$'
                  then to_date(last_activity, 'FMMM/FMDD/FMYY') end as la
      from djc_candidates
    )
    select role,
           case when la is null then 'No activity date'
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
    from a group by 1, 2, 3 order by 3
  `
  return rows.map(r => ({ role: r.role, label: r.label, ord: r.ord, count: r.n }))
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

export interface OutreachChannel {
  key: 'text' | 'email' | 'call'
  label: string
  contacted: number      // people reached at least once on this channel
  engaged: number        // ...who demonstrably engaged (read / opened / spoke)
  engagedWord: string
  forwarded: number      // ...who were eventually put forward for a job
}

export interface OutreachDetail {
  reach: ReachStage[]
  channels: OutreachChannel[]
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

/** Same mutually-exclusive buckets, windowed from a date — used for the current view cycle so
 *  the budget tiles count PEOPLE the automation saw, matching what their drills list. */
/**
 * What happened INSIDE a cycle window, counted the same way the cycle bars count it.
 *
 * Event dates, not first-seen dates. A candidate surfaced in one cycle can be created in the next
 * (a quota-block retry, a dedup that resolved later), and counting those by first-seen made the
 * tiles disagree with the bars directly beneath them and with the panel behind the click — 154 vs
 * 166 for the same three words. The event is when the outcome actually happened, so it is the one
 * frame all three can share.
 *
 * `unique` stays first-seen based on purpose: it answers "how many people did we look at this
 * cycle", which is a sighting, not an outcome.
 */
export async function getCandidateOutcomesSince(fromDate: string): Promise<CandidateOutcomes> {
  const sql = djcSql
  if (!sql) return { unique: 0, addedToSf: 0, alreadyInSf: 0, noContact: 0, other: 0 }
  const inWindow = sql`(e.created_at at time zone 'America/New_York')::date >= ${fromDate}::date`
  const [r] = await sql<CandidateOutcomes[]>`
    select
      (select count(*)::int from djc_candidates c where c.first_seen_at >= ${fromDate}::date) as unique,
      (select count(distinct e.candidate_id)::int from djc_event_log e
       where e.event_type = 'contact_created' and ${inWindow})                    as "addedToSf",
      (select count(distinct e.candidate_id)::int from djc_event_log e
       where e.event_type = 'dedup_match' and ${inWindow})                        as "alreadyInSf",
      (select count(distinct e.candidate_id)::int from djc_event_log e
       where e.event_type = 'candidate_uncontactable' and ${inWindow})            as "noContact",
      0 as other
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
           (select count(*)::int from sf_placements p
            where p.job_state = j.state and not p.is_extension) as ever_placed,
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
  const empty: OutreachDetail = { channels: [], calls: 0, emails: 0, touchesEach: 0, contactedNotForward: 0,
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
             coalesce(emails_opened, 0)    as opened,
             coalesce(sms_sent, 0)         as sms,
             exists (select 1 from djc_sf_applications a
                     where a.applicant_sf_id = djc_candidates.sf_contact_id) as fwd
      from djc_candidates
      where sf_contact_id is not null and dedup_status = 'new'
    )
    select count(*)::int                                                     as sourced,
           count(*) filter (where touches > 0)::int                          as attempted,
           count(*) filter (where sms_read > 0 or opened > 0)::int           as read,
           count(*) filter (where convs > 0)::int                            as talked,
           count(*) filter (where fwd)::int                                  as forwarded,
           count(*) filter (where touches > 0 and convs = 0 and sms_read = 0 and opened = 0)::int as only_failed,
           count(*) filter (where convs > 0 and fwd)::int                    as conv_fwd,
           coalesce(sum(sms), 0)::int                                        as sms,
           coalesce(sum(sms_read), 0)::int                                   as sms_read,
           coalesce(sum(convs), 0)::int                                      as convs
    from c
  `
  // Which channel actually works. Salesforce files most texts as "Call" tasks, so a real phone
  // call is a Call task that is NOT an SMS disposition — hence call_tasks - sms.
  const [ch] = await sql<Record<string, number>[]>`
    with c as (
      select coalesce(sms_sent, 0) as sms, coalesce(sms_read, 0) as sms_read,
             coalesce(emails_sent, 0) as em, coalesce(emails_opened, 0) as em_open,
             coalesce(outreach_calls, 0) as call_tasks, coalesce(conversations, 0) as convs,
             exists (select 1 from djc_sf_applications a
                     where a.applicant_sf_id = djc_candidates.sf_contact_id) as fwd
      from djc_candidates where sf_contact_id is not null and dedup_status = 'new'
    )
    select count(*) filter (where sms > 0)::int                            as text_contacted,
           count(*) filter (where sms > 0 and sms_read > 0)::int           as text_engaged,
           count(*) filter (where sms > 0 and fwd)::int                    as text_fwd,
           count(*) filter (where em > 0)::int                             as email_contacted,
           count(*) filter (where em > 0 and em_open > 0)::int             as email_engaged,
           count(*) filter (where em > 0 and fwd)::int                     as email_fwd,
           count(*) filter (where call_tasks - sms > 0)::int               as call_contacted,
           count(*) filter (where call_tasks - sms > 0 and convs > 0)::int as call_engaged,
           count(*) filter (where call_tasks - sms > 0 and fwd)::int       as call_fwd
    from c
  `

  return {
    calls: r?.calls ?? 0,
    emails: r?.emails ?? 0,
    channels: [
      { key: 'call' as const, label: 'Phone call', engagedWord: 'spoke',
        contacted: ch?.call_contacted ?? 0, engaged: ch?.call_engaged ?? 0, forwarded: ch?.call_fwd ?? 0 },
      { key: 'text' as const, label: 'Text', engagedWord: 'read it',
        contacted: ch?.text_contacted ?? 0, engaged: ch?.text_engaged ?? 0, forwarded: ch?.text_fwd ?? 0 },
      { key: 'email' as const, label: 'Email', engagedWord: 'opened it',
        contacted: ch?.email_contacted ?? 0, engaged: ch?.email_engaged ?? 0, forwarded: ch?.email_fwd ?? 0 },
    ],
    // Labels say who did what to whom. Everything below the first step depends on a recruiter
    // logging the activity in Salesforce — unlogged outreach is invisible to this ladder.
    reach: [
      { label: 'Added to Salesforce', people: reach?.sourced ?? 0, note: 'the automation created the contact' },
      { label: 'Recruiter reached out', people: reach?.attempted ?? 0,
        note: 'at least one call, text or email logged in Salesforce' },
      { label: 'Message was read', people: reach?.read ?? 0,
        note: 'a text marked read, or a tracked email opened' },
      { label: 'Spoke with a recruiter', people: reach?.talked ?? 0,
        note: 'an activity logged with a live-conversation outcome' },
      { label: 'Put forward for a job', people: reach?.forwarded ?? 0, note: 'has a job application' },
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
export interface CityDemand { name: string; opened: number; filled: number; everPlaced: number }
export interface OpenGroup { name: string; jobs: number; stale: number }

export interface JobEffectiveness {
  months: JobMonth[]
  weeks: { weekStart: string; opened: number; submitted: number; filled: number }[]
  years: { year: number; opened: number; submitted: number; filled: number }[]
  quarters: { label: string; opened: number; submitted: number; filled: number; priorYear: number | null }[]
  durations: JobDuration[]
  byState: JobGroup[]
  byType: JobGroup[]
  byPractice: JobGroup[]
  byCity: CityDemand[]
  openAges: OpenJobAge[]
  openByState: OpenGroup[]
  openByType: OpenGroup[]
  ytdOpened: number
  ytdFilled: number
  ytdSubmitted: number
  allOpened: number
  allFilled: number
  allSubmitted: number
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

  // Weekly intake: monthly is the planning view, but the week is the operational one — how many
  // jobs landed on the desk in the last few weeks is what staffing decisions actually run on.
  const weeks = await sql<
    { week_start: string; opened: number; submitted: number; filled: number }[]
  >`
    select to_char(date_trunc('week', open_date), 'YYYY-MM-DD')  as week_start,
           count(*)::int                                          as opened,
           count(*) filter (where coalesce(submittals, 0) > 0)::int as submitted,
           count(*) filter (where filled)::int                     as filled
    from djc_jobs
    where open_date >= date_trunc('week', now()) - interval '12 weeks' and open_date <= now()
    group by 1 order by 1
  `

  const years = await sql<{ y: number; opened: number; submitted: number; filled: number }[]>`
    select extract(year from open_date)::int                       as y,
           count(*)::int                                            as opened,
           count(*) filter (where coalesce(submittals, 0) > 0)::int as submitted,
           count(*) filter (where filled)::int                      as filled
    from djc_jobs where open_date is not null
    group by 1 order by 1
  `

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

  // City-level demand — the Notion ask was explicit that state can be too big: certain LOCATIONS
  // have heavy repeat demand, and whether we have ever placed there changes how hard they are.
  const byCity = await sql<
    { name: string; opened: number; filled: number; ever_placed: number }[]
  >`
    select coalesce(city_state, 'Unknown')                                    as name,
           count(*) filter (where open_date >= now() - interval '12 months')::int as opened,
           count(*) filter (where open_date >= now() - interval '12 months'
                              and filled)::int                                as filled,
           count(*) filter (where filled)::int                                as ever_placed
    from djc_jobs
    group by 1
    having count(*) filter (where open_date >= now() - interval '12 months') >= 2
    order by 2 desc limit 14
  `

  const openGroup = async (col: 'state' | 'specialty') => sql<
    { name: string; jobs: number; stale: number }[]
  >`
    select coalesce(${sql(col)}, 'Unknown')                        as name,
           count(*)::int                                            as jobs,
           count(*) filter (where days_open > 90)::int              as stale
    from djc_jobs where status = 'Open'
    group by 1 having count(*) >= 2
    order by count(*) desc limit 10
  `
  const [openByState, openByType] = [await openGroup('state'), await openGroup('specialty')]

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
      top_practice: number; open_now: number; all_opened: number; all_filled: number;
      all_submitted: number }[]
  >`
    select count(*) filter (where extract(year from open_date) = extract(year from now()))::int as opened,
           count(*)::int                                                                        as all_opened,
           count(*) filter (where filled)::int                                                  as all_filled,
           count(*) filter (where coalesce(submittals, 0) > 0)::int                             as all_submitted,
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
    weeks: weeks.map(w => ({ weekStart: String(w.week_start).slice(0, 10), opened: w.opened,
      submitted: w.submitted, filled: w.filled })),
    years: years.map(y => ({ year: y.y, opened: y.opened, submitted: y.submitted, filled: y.filled })),
    quarters: quarters.map(r => ({
      label: `Q${r.q} ${String(r.y).slice(2)}`, opened: r.opened, submitted: r.submitted,
      filled: r.filled, priorYear: qOpened.get(`${r.y - 1}-${r.q}`) ?? null,
    })),
    durations: durations.map(d => ({
      label: d.label, jobs: d.jobs, filled: d.filled,
      pct: Math.round((d.jobs / durTotal) * 100),
    })),
    byState, byType, byPractice,
    byCity: byCity.map(c => ({ name: c.name, opened: c.opened, filled: c.filled, everPlaced: c.ever_placed })),
    openAges: openAges.map(a => ({ label: a.label, jobs: a.jobs })),
    openByState, openByType,
    ytdOpened: ytd?.opened ?? 0,
    ytdFilled: ytd?.filled ?? 0,
    ytdSubmitted: ytd?.submitted ?? 0,
    allOpened: ytd?.all_opened ?? 0,
    allFilled: ytd?.all_filled ?? 0,
    allSubmitted: ytd?.all_submitted ?? 0,
    priorYtdOpened: ytd?.prior ?? 0,
    practicesTotal: ytd?.practices ?? 0,
    topPracticeShare: ytd?.top_practice ?? 0,
    openNow: ytd?.open_now ?? 0,
  }
}

/* ── client-report extras ─────────────────────────────────────────────────── */

export const OPEN_AGE_BANDS = ['Under a week', '1-4 weeks', '1-3 months', 'Over 3 months']

export interface DurationBandRow { name: string; bands: number[]; total: number; median: number | null }

/**
 * How long the jobs that are open RIGHT NOW have been waiting.
 *
 * Deliberately open-jobs-only. Salesforce's Days_Open__c is a live counter measured from the
 * opening date to today and it never freezes when a job closes — a job closed in 2015 still reads
 * 4,600+ days. So for a closed job the field says nothing about how long it took to fill, and any
 * "time to fill" built on it is really just "how long ago it was posted". For a job that is still
 * open, though, days-since-posted IS the wait so far, which is exactly what this shows.
 *
 * A genuine time-to-fill needs Salesforce to (a) stop overwriting the job record per location and
 * (b) stamp a close/fill date — the same per-job tracking gap the arriving chart calls out.
 */
export async function getOpenAgeBands(): Promise<{
  overall: { label: string; jobs: number; pct: number }[]
  median: number | null
  byState: DurationBandRow[]
  byType: DurationBandRow[]
}> {
  const sql = djcSql
  if (!sql) return { overall: [], median: null, byState: [], byType: [] }

  const AGE_CASE = sql`case when days_open <= 7 then 0 when days_open <= 30 then 1
                            when days_open <= 90 then 2 else 3 end`

  const overallRows = await sql<{ ord: number; jobs: number }[]>`
    select ${AGE_CASE} as ord, count(*)::int as jobs
    from djc_jobs where status = 'Open' and days_open is not null
    group by 1 order by 1
  `
  const total = overallRows.reduce((a, r) => a + r.jobs, 0) || 1
  const overall = OPEN_AGE_BANDS.map((label, i) => {
    const jobs = overallRows.find(r => r.ord === i)?.jobs ?? 0
    return { label, jobs, pct: Math.round((jobs / total) * 100) }
  })

  const [med] = await sql<{ median: number | null }[]>`
    select percentile_cont(0.5) within group (order by days_open)::numeric as median
    from djc_jobs where status = 'Open' and days_open is not null
  `

  const grouped = async (col: 'state' | 'specialty') => {
    const rows = await sql<{ name: string; ord: number; jobs: number }[]>`
      select coalesce(nullif(${sql(col)}, ''), 'Unknown') as name,
             ${AGE_CASE} as ord, count(*)::int as jobs
      from djc_jobs where status = 'Open' and days_open is not null
      group by 1, 2
    `
    const medians = await sql<{ name: string; median: number | null }[]>`
      select coalesce(nullif(${sql(col)}, ''), 'Unknown')                   as name,
             percentile_cont(0.5) within group (order by days_open)::numeric as median
      from djc_jobs where status = 'Open' and days_open is not null
      group by 1
    `
    const med = new Map(medians.map(m => [m.name, m.median === null ? null : Math.round(Number(m.median))]))
    const byName = new Map<string, DurationBandRow>()
    for (const r of rows) {
      const row = byName.get(r.name) ?? { name: r.name, bands: [0, 0, 0, 0], total: 0, median: null }
      row.bands[r.ord] = r.jobs
      row.total += r.jobs
      row.median = med.get(r.name) ?? null
      byName.set(r.name, row)
    }
    return [...byName.values()]
      .filter(r => r.total >= 3).sort((a, b) => b.total - a.total).slice(0, 12)
  }

  return {
    overall,
    median: med?.median === null || med?.median === undefined ? null : Math.round(Number(med.median)),
    byState: await grouped('state'),
    byType: await grouped('specialty'),
  }
}

export interface MonthOutcome {
  name: string           // 'YYYY-MM' for months, 'Q3 26' for quarters
  intake: number
  filled: number
  closedUnfilled: number
  openUnfilled: number
  medianAgeOpen: number | null
}

/**
 * What became of each month's intake: filled, closed without a fill, or still waiting.
 *
 * This is the one trend the jobs mirror can honestly support. Duration cannot be trended —
 * Salesforce's days-open counter never freezes, so it only measures how long ago a job was posted
 * (see getOpenAgeBands). Outcomes, though, are recorded per job, so "of the 99 that arrived in
 * June, 31 filled and 33 are still waiting" is real.
 *
 * Read with maturity in mind: a month that opened last week has had no time to clear, so its
 * still-waiting share is high by construction. Comparing like months across years is what makes a
 * seasonal read possible — and that needs a full year of dense history, which starts around April
 * 2026 here.
 */
export async function getMonthOutcomes(): Promise<{ months: MonthOutcome[]; quarters: MonthOutcome[] }> {
  const sql = djcSql
  if (!sql) return { months: [], quarters: [] }
  const rows = await sql<
    { name: string; intake: number; filled: number; closed_unfilled: number;
      open_unfilled: number; median_age_open: number | null }[]
  >`
    select to_char(date_trunc('month', open_date), 'YYYY-MM')                    as name,
           count(*)::int                                                         as intake,
           count(*) filter (where filled)::int                                   as filled,
           count(*) filter (where status <> 'Open' and not filled)::int          as closed_unfilled,
           count(*) filter (where status = 'Open' and not filled)::int           as open_unfilled,
           percentile_cont(0.5) within group (order by days_open)
             filter (where status = 'Open')::numeric                             as median_age_open
    from djc_jobs
    where open_date is not null and open_date >= date_trunc('year', now()) - interval '1 year'
    group by 1 order by 1
  `
  const months: MonthOutcome[] = rows.map(r => ({
    name: r.name, intake: r.intake, filled: r.filled, closedUnfilled: r.closed_unfilled,
    openUnfilled: r.open_unfilled,
    medianAgeOpen: r.median_age_open === null ? null : Math.round(Number(r.median_age_open)),
  }))

  const qMap = new Map<string, MonthOutcome>()
  for (const m of months) {
    const [y, mm] = m.name.split('-').map(Number)
    const key = `Q${Math.floor((mm - 1) / 3) + 1} ${String(y).slice(2)}`
    const q = qMap.get(key)
      ?? { name: key, intake: 0, filled: 0, closedUnfilled: 0, openUnfilled: 0, medianAgeOpen: null }
    q.intake += m.intake; q.filled += m.filled
    q.closedUnfilled += m.closedUnfilled; q.openUnfilled += m.openUnfilled
    qMap.set(key, q)
  }
  return { months, quarters: [...qMap.values()] }
}

export interface RoleDemandRow {
  role: string          // the DJC scrape target
  sourced: number       // contacts the automation created for this role
  withMatch: number     // ...that have at least one live job match
  forwarded: number     // ...that were put forward for a job
  openJobs: number      // jobs Proxi has open in that specialty right now
}

/**
 * Sourcing against demand, per role — the answer to "why does almost nobody get put forward".
 *
 * A candidate can only be put forward if there is a job to put them forward for. Half the contacts
 * the automation creates have no live match at all, and that is not spread evenly: it is
 * concentrated in the roles Proxi barely staffs. Pairing what we sourced with what is open makes
 * the mismatch a fact rather than an impression.
 */
export async function getRoleDemand(): Promise<RoleDemandRow[]> {
  const sql = djcSql
  if (!sql) return []
  const rows = await sql<RoleDemandRow[]>`
    with sourced as (
      select coalesce(target, 'Unknown')                                        as role,
             count(*)::int                                                       as sourced,
             count(*) filter (where coalesce(open_match_count, 0) > 0)::int      as "withMatch",
             count(*) filter (where exists (
               select 1 from djc_sf_applications a
               where a.applicant_sf_id = djc_candidates.sf_contact_id))::int     as forwarded
      from djc_candidates
      where sf_contact_id is not null and dedup_status = 'new'
      group by 1
    ), demand as (
      select coalesce(specialty, 'Unknown') as role, count(*)::int as "openJobs"
      from djc_jobs where status = 'Open' group by 1
    )
    select s.role, s.sourced, s."withMatch", s.forwarded, coalesce(d."openJobs", 0) as "openJobs"
    from sourced s left join demand d on d.role = s.role
    order by s.sourced desc
  `
  return rows
}

export interface MatchCompetition {
  openJobs: number
  candidatesWaiting: number     // distinct candidates matched to an open job
  medianPerJob: number          // typical number of candidates queued on one open job
  mostPerJob: number
  ourAvgRivals: number          // for candidates the automation added: rivals on the jobs they match
}

/**
 * How contested the open jobs are.
 *
 * "Has a live job match" reads like a candidate is in play, but a match on a job that already has
 * two hundred other candidates on it is not the same thing as a match on a job with three. This
 * measures the queue, which is what decides whether more sourcing can help at all.
 */
export async function getMatchCompetition(): Promise<MatchCompetition | null> {
  const sql = djcSql
  if (!sql) return null
  const [r] = await sql<Record<string, number>[]>`
    with per as (
      select j.job_sf_id, count(distinct m.sf_contact_id)::int as c
      from djc_jobs j join djc_job_matches m on m.job_sf_id = j.job_sf_id and m.is_live
      where j.status = 'Open' group by 1
    ), mine as (
      select round(avg(per.c))::int as avg_rivals
      from djc_candidates c
      join djc_job_matches m on m.sf_contact_id = c.sf_contact_id and m.is_live
      join per on per.job_sf_id = m.job_sf_id
      where c.sf_contact_id is not null and c.dedup_status = 'new'
    )
    select (select count(*)::int from djc_jobs where status = 'Open')            as open_jobs,
           (select count(distinct m.sf_contact_id)::int from djc_job_matches m
            join djc_jobs j on j.job_sf_id = m.job_sf_id
            where m.is_live and j.status = 'Open')                               as candidates_waiting,
           coalesce(percentile_cont(0.5) within group (order by per.c), 0)::int  as median_per_job,
           coalesce(max(per.c), 0)::int                                          as most_per_job,
           (select avg_rivals from mine)                                         as our_avg_rivals
    from per
  `
  if (!r) return null
  return {
    openJobs: r.open_jobs ?? 0,
    candidatesWaiting: r.candidates_waiting ?? 0,
    medianPerJob: r.median_per_job ?? 0,
    mostPerJob: r.most_per_job ?? 0,
    ourAvgRivals: r.our_avg_rivals ?? 0,
  }
}

export interface ScopedGroup {
  name: string
  opened3m: number; filled3m: number
  opened12m: number; filled12m: number
  openedAll: number; filledAll: number
}

/** State / role demand tables in three time scopes, so the block can carry a toggle. */
export async function getScopedGroups(): Promise<{ byState: ScopedGroup[]; byType: ScopedGroup[] }> {
  const sql = djcSql
  if (!sql) return { byState: [], byType: [] }
  const grouped = (col: 'state' | 'specialty') => sql<ScopedGroup[]>`
    select coalesce(nullif(${sql(col)}, ''), 'Unknown') as name,
           count(*) filter (where open_date >= current_date - 90)::int                as "opened3m",
           count(*) filter (where open_date >= current_date - 90 and filled)::int     as "filled3m",
           count(*) filter (where open_date >= current_date - 365)::int               as "opened12m",
           count(*) filter (where open_date >= current_date - 365 and filled)::int    as "filled12m",
           count(*)::int                                                              as "openedAll",
           count(*) filter (where filled)::int                                        as "filledAll"
    from djc_jobs
    group by 1 having count(*) >= 2
    order by count(*) filter (where open_date >= current_date - 365) desc, count(*) desc
    limit 15
  `
  return { byState: await grouped('state'), byType: await grouped('specialty') }
}

export interface SourcingDetailRow { month: string; target: string; n: number }

/** New Salesforce candidates per month × DJC role/specialty — feeds the role and specialty toggles. */
export interface NewAccountRow { month: string; target: string; n: number }

/**
 * Accounts newly created on DentistJobCafe, by the month the candidate registered.
 *
 * This is the supply side: who is arriving on the platform, before any question of what we did
 * with them. Counted from the registered date on the candidate's card, over the candidates the
 * automation has surfaced — not DJC's whole membership, which we cannot see.
 *
 * Coverage caveat worth carrying into the UI: the scheduled sweep only started scraping the
 * hygienist and assistant targets in June 2026, so months before that undercount those two roles
 * severely. Dentist coverage runs the whole period.
 */
export async function getNewAccountsByMonth(): Promise<NewAccountRow[]> {
  const sql = djcSql
  if (!sql) return []
  return sql<NewAccountRow[]>`
    select to_char(date_trunc('month', registered_on), 'YYYY-MM') as month,
           coalesce(nullif(target, ''), 'Unknown')                 as target,
           count(*)::int                                           as n
    from djc_candidates
    where registered_on is not null
      and registered_on >= date_trunc('year', now()) - interval '1 year'
      and registered_on <= current_date
    group by 1, 2 order by 1
  `
}

export async function getSourcingDetailByMonth(): Promise<SourcingDetailRow[]> {
  const sql = djcSql
  if (!sql) return []
  return sql<SourcingDetailRow[]>`
    select to_char(date_trunc('month', first_seen_at), 'YYYY-MM') as month,
           coalesce(target, 'Unknown')                             as target,
           count(*)::int                                           as n
    from djc_candidates
    where dedup_status = 'new' and sf_contact_id is not null
    group by 1, 2 order by 1
  `
}
