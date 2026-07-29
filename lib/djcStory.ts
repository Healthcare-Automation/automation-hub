import djcSql from './djcDb'
import { getJobEffectiveness, type JobEffectiveness } from './djcOps'

/**
 * The Overview page's data layer — deliberately narrow.
 *
 * The page answers four questions in order, and nothing else earns a place on it:
 *   1. Is the machine working?
 *   2. Are we placing more people, faster?
 *   3. Where is the gap between who we source and who there is work for?
 *   4. Is the automation itself earning its keep?
 *
 * Metrics that only demonstrate effort (candidates reviewed, runs completed, hours "saved") are
 * excluded on purpose. Proxi is a staffing business: the needle is placements, and the supply of
 * people who can be placed.
 */

export interface OpsMonth { month: string; placed: number; priorYear: number | null }
export interface OpsQuarter { label: string; year: number; quarter: number; placed: number; priorYear: number | null }
export interface OpsGroup { name: string; placed: number; priorYear: number }
export interface OpsPlacements {
  monthly: OpsMonth[]
  quarters: OpsQuarter[]
  byState: OpsGroup[]
  byClient: OpsGroup[]
  ytd: number
  ytdPriorYear: number
  avgPerMonth: number
  avgPerMonthPriorYear: number
  monthsElapsed: number
}

export interface SourceRow {
  source: string
  candidates: number
  applied: number
  placed: number
  appliedPct: number
  placedPct: number
  recentCandidates: number   // joined in the last 12 months
  recentPlaced: number
}

export interface DemandMonth {
  month: string
  opened: number       // jobs that arrived
  filled: number       // ...that we have staffed
  stillOpen: number    // ...still unfilled and still open
}

export interface DemandSpecialty {
  specialty: string
  opened: number
  filled: number
  candidates: number   // candidates we hold on the market in that specialty
}

export interface SupplyDemand {
  months: DemandMonth[]
  specialties: DemandSpecialty[]
  allTimeJobs: number
  allTimeFilled: number
  openNow: number
  openUnfilled: number
  activeCandidates: number
}

export interface SupplyDemandRow {
  specialty: string
  held: number
  onMarket: number     // active on DJC in 90 days AND never placed
  ready: number        // on the market AND has at least one live Salesforce match
  matches: number      // total live matches across the specialty
  avgMatches: number   // live matches per matched candidate
  openJobs: number
  closedJobs: number
}

export interface PlacementMonth {
  month: string
  placed: number
  placedPriorYear: number | null   // same calendar month, one year earlier
  medianDaysToPlace: number | null  // from entering the CRM, not from the application record
}

export interface FunnelStage {
  key: string
  label: string
  count: number
  pctOfPrevious: number | null
}

export interface FunnelMeta {
  people: number   // distinct candidates behind those rows
  jobs: number     // distinct jobs they were put forward for
}

export interface AutomationImpact {
  sourced: number          // candidates the automation created in Salesforce
  applied: number          // ...that have at least one application
  placed: number           // ...that reached a placement
  liveSince: string | null
  medianDaysSourcedToApply: number | null
}

export interface DjcStory {
  jobs: JobEffectiveness | null
  ops: OpsPlacements
  sources: SourceRow[]
  demand: SupplyDemand
  funnelMeta: FunnelMeta
  supplyDemand: SupplyDemandRow[]
  placements: PlacementMonth[]
  funnel: FunnelStage[]
  automation: AutomationImpact
  matchDataCoverage: { withData: number; total: number }
}

/**
 * Supply vs demand, per specialty.
 *
 * `match_count` is how many open jobs matched a candidate on location after we created them. Zero
 * means we sourced somebody Proxi has nothing to place them into.
 *
 * IMPORTANT: match_count is only computed when the automation CREATES a contact. Candidates who
 * were already in Salesforce are skipped before the match runs, so only 388 of 2,103 contacts carry
 * it (384 of them new creates; 4 of 1,719 duplicates). Every row here is therefore a sample of
 * recent creates, not the whole specialty — 17 job-matched Pediatrics candidates sit inside a
 * cohort of 220. `cohort` and `coverage` carry that denominator so the UI cannot imply otherwise.
 */
/** Candidates on the market: active on DJC in 90 days and never placed. */
const READY_CTE = `
  ready as (
    select c.sf_contact_id from djc_candidates c
    where c.sf_contact_id is not null
      and case when c.last_activity ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$'
               then to_date(c.last_activity, 'FMMM/FMDD/FMYY') end >= current_date - 90
      and not exists (select 1 from djc_sf_applications a
                      where a.applicant_sf_id = c.sf_contact_id and a.placed_on is not null)
  )`

/**
 * Supply versus demand: work arriving each month, and how much of it we staffed.
 *
 * This is the question the section exists to answer — are we filling the jobs that come through?
 * Earlier versions charted a frozen snapshot of current coverage, which says nothing about whether
 * the business can absorb the work it wins.
 *
 * The last two months are deliberately marked as incomplete rather than dropped: a job opened three
 * weeks ago that is still unfilled may yet be filled, so its fill rate is a floor, not a verdict.
 */
/**
 * Every candidate source Proxi uses, with what each one actually produced.
 *
 * DJC is one of eighteen. Judging the sourcing automation without the others was the gap in this
 * board: DJC supplies the most candidates by far and converts the worst of any major source, which
 * is invisible unless the platforms sit side by side.
 *
 * Two windows are returned. All-time is the fullest picture but favours old sources whose people
 * have had years to convert; the 12-month cohort is the like-for-like comparison. The UI shows
 * both because either one alone misleads.
 */
/**
 * Business-wide placements: every source, every client, not just the DJC automation.
 *
 * Uses Placement_Start_Date__c. Placement_Date__c looks like the obvious field and is populated on
 * 77 of 1,575 records, all before 2022 — reading it produced a chart that said Proxi stopped
 * placing people in 2021.
 *
 * Year-on-year comparisons are day-of-year aligned, so "YTD" against last year means the same
 * calendar span rather than a full year against a partial one.
 */
export async function getOpsPlacements(): Promise<OpsPlacements> {
  const empty: OpsPlacements = { monthly: [], quarters: [], byState: [], byClient: [], ytd: 0,
    ytdPriorYear: 0, avgPerMonth: 0, avgPerMonthPriorYear: 0, monthsElapsed: 0 }
  const sql = djcSql
  if (!sql) return empty

  const monthly = await sql<{ month: string; placed: number }[]>`
    select to_char(date_trunc('month', start_on), 'YYYY-MM') as month, count(*)::int as placed
    from sf_placements
    where start_on >= date_trunc('month', now()) - interval '35 months'
      and start_on <= now()
    group by 1 order by 1
  `
  const byMonth = new Map(monthly.map(r => [r.month, r.placed]))
  const priorOf = (m: string) => {
    const [y, mm] = m.split('-').map(Number)
    return `${y - 1}-${String(mm).padStart(2, '0')}`
  }

  const quarters = await sql<{ y: number; q: number; placed: number }[]>`
    select extract(year from start_on)::int as y, extract(quarter from start_on)::int as q,
           count(*)::int as placed
    from sf_placements
    where start_on >= date_trunc('year', now()) - interval '2 years' and start_on <= now()
    group by 1, 2 order by 1, 2
  `
  const qMap = new Map(quarters.map(r => [`${r.y}-${r.q}`, r.placed]))

  // Day-of-year alignment: compare Jan-to-today against Jan-to-the-same-day last year.
  const [ytdRow] = await sql<{ this_year: number; last_year: number }[]>`
    select count(*) filter (where extract(year from start_on) = extract(year from now()))::int as this_year,
           count(*) filter (where extract(year from start_on) = extract(year from now()) - 1)::int as last_year
    from sf_placements
    where extract(doy from start_on) <= extract(doy from now())
      and extract(year from start_on) >= extract(year from now()) - 1
  `
  const group = async (col: 'job_state' | 'client') => sql<
    { name: string; placed: number; prior: number }[]
  >`
    select coalesce(${sql(col)}, 'Unknown')                                       as name,
           count(*) filter (where extract(year from start_on) = extract(year from now()))::int as placed,
           count(*) filter (where extract(year from start_on) = extract(year from now()) - 1
                              and extract(doy from start_on) <= extract(doy from now()))::int  as prior
    from sf_placements
    where extract(doy from start_on) <= extract(doy from now())
      and extract(year from start_on) >= extract(year from now()) - 1
    group by 1
    having count(*) filter (where extract(year from start_on) = extract(year from now())) > 0
    order by 2 desc
    limit 12
  `
  const states = await group('job_state')
  const clients = await group('client')
  const monthsElapsed = new Date().getUTCMonth() + 1

  return {
    monthly: monthly.map(r => ({
      month: r.month, placed: r.placed, priorYear: byMonth.get(priorOf(r.month)) ?? null,
    })),
    quarters: quarters.map(r => ({
      label: `Q${r.q} ${String(r.y).slice(2)}`, year: r.y, quarter: r.q, placed: r.placed,
      priorYear: qMap.get(`${r.y - 1}-${r.q}`) ?? null,
    })),
    byState: states.map(r => ({ name: r.name, placed: r.placed, priorYear: r.prior })),
    byClient: clients.map(r => ({ name: r.name, placed: r.placed, priorYear: r.prior })),
    ytd: ytdRow?.this_year ?? 0,
    ytdPriorYear: ytdRow?.last_year ?? 0,
    avgPerMonth: Math.round(((ytdRow?.this_year ?? 0) / monthsElapsed) * 10) / 10,
    avgPerMonthPriorYear: Math.round(((ytdRow?.last_year ?? 0) / monthsElapsed) * 10) / 10,
    monthsElapsed,
  }
}

export async function getSources(): Promise<SourceRow[]> {
  const sql = djcSql
  if (!sql) return []
  const rows = await sql<
    { source: string; candidates: number; applied: number; placed: number;
      recent_candidates: number; recent_placed: number }[]
  >`
    select source,
           sum(candidates)::int                                                   as candidates,
           sum(applied)::int                                                      as applied,
           sum(placed)::int                                                       as placed,
           sum(candidates) filter (where month >= now() - interval '12 months')::int as recent_candidates,
           sum(placed)     filter (where month >= now() - interval '12 months')::int as recent_placed
    from sf_source_performance
    group by source
    having sum(candidates) >= 20
    order by sum(candidates) desc
  `
  return rows.map(r => ({
    source: r.source,
    candidates: r.candidates,
    applied: r.applied,
    placed: r.placed,
    appliedPct: r.candidates ? Math.round((r.applied / r.candidates) * 100) : 0,
    placedPct: r.candidates ? Math.round((r.placed / r.candidates) * 1000) / 10 : 0,
    recentCandidates: r.recent_candidates ?? 0,
    recentPlaced: r.recent_placed ?? 0,
  }))
}

export async function getSupplyDemandFlow(months = 12): Promise<SupplyDemand> {
  const empty: SupplyDemand = { months: [], specialties: [], allTimeJobs: 0, allTimeFilled: 0,
    openNow: 0, openUnfilled: 0, activeCandidates: 0 }
  const sql = djcSql
  if (!sql) return empty

  const m = await sql<{ month: string; opened: number; filled: number; still_open: number }[]>`
    select to_char(date_trunc('month', open_date), 'YYYY-MM')            as month,
           count(*)::int                                                 as opened,
           count(*) filter (where filled)::int                           as filled,
           count(*) filter (where not filled and status = 'Open')::int   as still_open
    from djc_jobs
    where open_date >= date_trunc('month', now()) - ((${months} - 1) || ' months')::interval
    group by 1 order by 1
  `
  // Specialty view uses the last 12 months so it reflects the business as it trades now, not 2022.
  const s = await sql<
    { specialty: string; opened: number; filled: number; candidates: number }[]
  >`
    with ${sql.unsafe(READY_CTE)},
    j as (
      select coalesce(specialty, 'Other') as specialty,
             count(*)::int                            as opened,
             count(*) filter (where filled)::int      as filled
      from djc_jobs
      where open_date >= now() - interval '12 months'
      group by 1
    ),
    c as (
      select coalesce(cd.target, 'Other') as specialty, count(*)::int as candidates
      from djc_candidates cd join ready r on r.sf_contact_id = cd.sf_contact_id
      group by 1
    )
    select j.specialty, j.opened, j.filled, coalesce(c.candidates, 0)::int as candidates
    from j left join c on c.specialty = j.specialty
    order by j.opened desc
  `
  const [tot] = await sql<
    { all_jobs: number; all_filled: number; open_now: number; open_unfilled: number }[]
  >`
    select count(*)::int                                              as all_jobs,
           count(*) filter (where filled)::int                        as all_filled,
           count(*) filter (where status = 'Open')::int               as open_now,
           count(*) filter (where status = 'Open' and not filled)::int as open_unfilled
    from djc_jobs
  `
  const [cand] = await sql<{ active: number }[]>`
    with ${sql.unsafe(READY_CTE)} select count(*)::int as active from ready
  `
  return {
    months: m.map(r => ({ month: r.month, opened: r.opened, filled: r.filled, stillOpen: r.still_open })),
    allTimeJobs: tot?.all_jobs ?? 0,
    allTimeFilled: tot?.all_filled ?? 0,
    openNow: tot?.open_now ?? 0,
    openUnfilled: tot?.open_unfilled ?? 0,
    activeCandidates: cand?.active ?? 0,
    specialties: s.map(r => ({
      specialty: r.specialty, opened: r.opened, filled: r.filled, candidates: r.candidates,
    })),
  }
}

export async function getSupplyDemand(): Promise<SupplyDemandRow[]> {
  const sql = djcSql
  if (!sql) return []
  // A "live match" is Salesforce's own, copied from the Matches To Open Jobs view on a Contact:
  //   Job_Status = Open  AND  Preference_State = "In Preferred State"  AND  no Match_Status set.
  // Verified against contact Saimon Ramos, whose Salesforce page shows exactly 1 match (Sanderson,
  // Florida, 162 mi) — this filter reproduces that row and no other.
  //
  // Note what is NOT in it: distance and specialty. Proxi counts a 162-mile match as real because
  // the job sits in a state the candidate said they want. An earlier version of this chart invented
  // a 50-mile radius and filtered on matching specialty; both were our inventions, not the
  // business's rules, and both produced shortfalls that do not exist.
  const rows = await sql<
    { specialty: string; held: number; on_market: number; ready: number; matches: number;
      avg_matches: number | null; open_jobs: number; closed_jobs: number }[]
  >`
    with c as (
      select c.*,
             case when c.last_activity ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$'
                  then to_date(c.last_activity, 'FMMM/FMDD/FMYY') end as last_act,
             not exists (
               select 1 from djc_sf_applications a
               where a.applicant_sf_id = c.sf_contact_id and a.placed_on is not null
             ) as never_placed
      from djc_candidates c where c.sf_contact_id is not null
    ),
    m as (
      select sf_contact_id, count(*)::int as n
      from djc_job_matches where is_live group by 1
    )
    select coalesce(c.target, 'Unknown')                                        as specialty,
           count(*)::int                                                        as held,
           count(*) filter (where c.last_act >= current_date - 90
                              and c.never_placed)::int                          as on_market,
           count(*) filter (where c.last_act >= current_date - 90
                              and c.never_placed and m.n > 0)::int              as ready,
           coalesce(sum(m.n), 0)::int                                           as matches,
           avg(m.n) filter (where m.n > 0)                                      as avg_matches,
           coalesce(max(d.open_jobs), 0)::int                                   as open_jobs,
           coalesce(max(d.closed_jobs), 0)::int                                 as closed_jobs
    from c
    left join m on m.sf_contact_id = c.sf_contact_id
    left join djc_job_demand d on d.specialty = coalesce(c.target, 'Unknown')
    group by 1
    having count(*) >= 3
    order by count(*) desc
  `
  return rows.map(r => ({
    specialty: r.specialty,
    held: r.held,
    onMarket: r.on_market,
    ready: r.ready,
    matches: r.matches,
    avgMatches: r.avg_matches === null ? 0 : Math.round(Number(r.avg_matches) * 10) / 10,
    openJobs: r.open_jobs,
    closedJobs: r.closed_jobs,
  }))
}

/**
 * Placements per month, with the median time from a candidate ENTERING THE CRM to being placed.
 *
 * Not measured from the application record: 200 of 601 placements share a date with their
 * application, because the record is often created at the point of placement. That made "days to
 * place" read as 1-2 days, which is an artefact of admin, not speed. Measuring from
 * applicant_added_on gives the real answer — how long someone waits before we place them.
 */
export async function getPlacementTrend(months = 12): Promise<PlacementMonth[]> {
  const sql = djcSql
  if (!sql) return []
  // Pull two years so each month can be set against the same month a year earlier — seasonality in
  // dental hiring makes month-on-month movement misleading on its own.
  const rows = await sql<{ month: string; placed: number; median_days: number | null }[]>`
    select to_char(date_trunc('month', placed_on), 'YYYY-MM')                        as month,
           count(*)::int                                                             as placed,
           percentile_cont(0.5) within group (order by (placed_on - applicant_added_on)) as median_days
    from djc_sf_applications
    where placed_on is not null and applicant_added_on is not null
      and placed_on >= date_trunc('month', now()) - ((${months} + 12) || ' months')::interval
    group by 1 order by 1
  `
  const byMonth = new Map(rows.map(r => [r.month, r.placed]))
  const priorYear = (m: string) => {
    const [y, mm] = m.split('-').map(Number)
    return `${y - 1}-${String(mm).padStart(2, '0')}`
  }
  // Return only the requested window; the extra year exists purely to supply the comparison.
  const cutoff = rows.length > months ? rows.slice(-months) : rows
  return cutoff.map(r => ({
    month: r.month,
    placed: r.placed,
    placedPriorYear: byMonth.has(priorYear(r.month)) ? byMonth.get(priorYear(r.month))! : null,
    medianDaysToPlace: r.median_days === null ? null : Math.round(Number(r.median_days)),
  }))
}

/**
 * Where applications die.
 *
 * Only the steps that are reliably recorded. Of 602 placements, 98% carry a submittal date but just
 * 31% carry an interview date and 54% an offer date — those stages are optional in practice, so
 * including them produced a funnel where more people were "placed" than were ever "interviewed".
 * Application -> submitted -> placed is the part of the pipeline the data can actually support.
 */
export async function getFunnel(): Promise<FunnelStage[]> {
  const sql = djcSql
  if (!sql) return []
  const [r] = await sql<
    { apps: number; submitted: number; interviewed: number; placed: number }[]
  >`
    select count(*)::int                                                as apps,
           count(*) filter (where submittal_on is not null)::int        as submitted,
           0::int                                                       as interviewed,
           count(*) filter (where placed_on is not null)::int           as placed
    from djc_sf_applications
  `
  // Each row is a candidate-job PAIRING, not a person: 3,068 rows cover 999 people across 1,472
  // jobs, ~3 each. Calling the first step "Applied" implied 3,068 applicants.
  const steps = [
    { key: 'apps', label: 'Put forward for a job', count: r.apps },
    { key: 'submitted', label: 'Reached submittal', count: r.submitted },
    { key: 'placed', label: 'Placed', count: r.placed },
  ]
  return steps.map((s, i) => ({
    ...s,
    pctOfPrevious: i === 0 ? null : steps[i - 1].count ? Math.round((s.count / steps[i - 1].count) * 100) : 0,
  }))
}

/**
 * What the automation itself has produced, end to end.
 *
 * Deliberately shows the drop from "sourced" to "applied". That is currently the widest gap in the
 * whole system — the automation adds candidates far faster than they enter the pipeline — and hiding
 * it would make the dashboard flattering rather than useful.
 */
export async function getAutomationImpact(): Promise<AutomationImpact> {
  const sql = djcSql
  if (!sql) return { sourced: 0, applied: 0, placed: 0, liveSince: null, medianDaysSourcedToApply: null }
  const [r] = await sql<
    { sourced: number; applied: number; placed: number; live_since: string | null; median_days: number | null }[]
  >`
    with created as (
      select candidate_id, sf_contact_id, first_seen_at
      from djc_candidates
      where sf_contact_id is not null and dedup_status = 'new'
    ),
    apps as (
      select a.candidate_id,
             min(a.created_on) as first_app,
             bool_or(a.placed_on is not null) as ever_placed
      from djc_sf_applications a
      where a.candidate_id is not null
      group by 1
    )
    select (select count(*) from created)::int                                          as sourced,
           (select count(*) from created c join apps p on p.candidate_id = c.candidate_id)::int as applied,
           (select count(*) from created c join apps p on p.candidate_id = c.candidate_id
            where p.ever_placed)::int                                                   as placed,
           (select to_char(min(first_seen_at), 'YYYY-MM-DD') from created)              as live_since,
           (select percentile_cont(0.5) within group (order by (p.first_app - c.first_seen_at::date))
            from created c join apps p on p.candidate_id = c.candidate_id)              as median_days
  `
  return {
    sourced: r.sourced,
    applied: r.applied,
    placed: r.placed,
    liveSince: r.live_since,
    medianDaysSourcedToApply: r.median_days === null ? null : Math.round(Number(r.median_days)),
  }
}

/** How many real people and jobs sit behind the funnel's row counts. */
export async function getFunnelMeta(): Promise<FunnelMeta> {
  const sql = djcSql
  if (!sql) return { people: 0, jobs: 0 }
  const [r] = await sql<{ people: number; jobs: number }[]>`
    select count(distinct applicant_sf_id)::int as people, count(distinct job_name)::int as jobs
    from djc_sf_applications
  `
  return { people: r.people, jobs: r.jobs }
}

export async function getDjcStory(): Promise<DjcStory> {
  const sql = djcSql
  // Sequential on purpose. Promise.all opened five pooler connections simultaneously; the Supabase
  // session pooler allows 15 across the whole estate, so two overlapping renders exhausted it and
  // the page died with EMAXCONNSESSION. Slightly slower, and it actually completes.
  const supplyDemand = await getSupplyDemand()
  const demand = await getSupplyDemandFlow(12)
  const sources = await getSources()
  const ops = await getOpsPlacements()
  const jobs = await getJobEffectiveness()
  const placements = await getPlacementTrend(12)
  const funnel = await getFunnel()
  const funnelMeta = await getFunnelMeta()
  const automation = await getAutomationImpact()
  let coverage2 = { withData: 0, total: 0 }
  if (sql) {
    const [c] = await sql<{ with_data: number; total: number }[]>`
      select count(match_count)::int as with_data, count(*)::int as total
      from djc_candidates where sf_contact_id is not null
    `
    coverage2 = { withData: c.with_data, total: c.total }
  }
  return { supplyDemand, demand, sources, ops, jobs, placements, funnel, funnelMeta, automation,
           matchDataCoverage: coverage2 }
}

export interface PlacementPerson {
  name: string | null
  sfId: string | null
  job: string | null
  specialty: string | null
  placedOn: string | null
  waitDays: number | null
  fromAutomation: boolean
}

export interface PlacementMonthDetail {
  month: string
  placed: number
  people: number
  jobs: number
  medianWait: number | null
  fromAutomation: number
  prevMonth: { month: string; placed: number } | null
  priorYear: { month: string; placed: number } | null
  topSpecialty: { name: string; count: number } | null
  rows: PlacementPerson[]
}

/**
 * Everyone placed in one month, plus the context needed to judge whether that month was good.
 *
 * A bare count invites the wrong reaction in both directions — 17 looks like a collapse next to 30
 * without knowing that May was the record and that the current month is unfinished. So the panel
 * carries the previous month and the same month a year earlier alongside the list.
 *
 * Rows are placements, not people: 30 placements in May 2026 covered 22 individuals, because one
 * person can be placed into more than one job.
 */
export async function getPlacementMonth(month: string): Promise<PlacementMonthDetail | null> {
  const sql = djcSql
  if (!sql) return null
  if (!/^\d{4}-\d{2}$/.test(month)) return null
  const start = `${month}-01`
  const prev = shiftMonth(month, -1)
  const prior = shiftMonth(month, -12)

  const rows = await sql<
    { name: string | null; sf_id: string | null; job: string | null; specialty: string | null;
      placed_on: string | null; wait_days: number | null; from_automation: boolean }[]
  >`
    select a.applicant_name                                as name,
           a.applicant_sf_id                               as sf_id,
           a.job_name                                      as job,
           c.target                                        as specialty,
           to_char(a.placed_on, 'YYYY-MM-DD')              as placed_on,
           (a.placed_on - a.applicant_added_on)            as wait_days,
           (c.sf_contact_id is not null and c.dedup_status = 'new') as from_automation
    from djc_sf_applications a
    left join djc_candidates c on c.sf_contact_id = a.applicant_sf_id
    where a.placed_on >= ${start}::date
      and a.placed_on <  (${start}::date + interval '1 month')
    order by a.placed_on desc, a.applicant_name
  `
  const [agg] = await sql<
    { placed: number; people: number; jobs: number; median_wait: number | null }[]
  >`
    select count(*)::int                          as placed,
           count(distinct applicant_sf_id)::int   as people,
           count(distinct job_name)::int          as jobs,
           percentile_cont(0.5) within group (order by (placed_on - applicant_added_on)) as median_wait
    from djc_sf_applications
    where placed_on >= ${start}::date and placed_on < (${start}::date + interval '1 month')
  `
  const comps = await sql<{ month: string; placed: number }[]>`
    select to_char(date_trunc('month', placed_on), 'YYYY-MM') as month, count(*)::int as placed
    from djc_sf_applications
    where to_char(date_trunc('month', placed_on), 'YYYY-MM') in (${prev}, ${prior})
    group by 1
  `
  const byMonth = new Map(comps.map(c => [c.month, c.placed]))
  const spec = new Map<string, number>()
  for (const r of rows) if (r.specialty) spec.set(r.specialty, (spec.get(r.specialty) ?? 0) + 1)
  const top = [...spec.entries()].sort((a, b) => b[1] - a[1])[0]

  return {
    month,
    placed: agg?.placed ?? 0,
    people: agg?.people ?? 0,
    jobs: agg?.jobs ?? 0,
    medianWait: agg?.median_wait === null || agg?.median_wait === undefined ? null : Math.round(Number(agg.median_wait)),
    fromAutomation: rows.filter(r => r.from_automation).length,
    prevMonth: byMonth.has(prev) ? { month: prev, placed: byMonth.get(prev)! } : null,
    priorYear: byMonth.has(prior) ? { month: prior, placed: byMonth.get(prior)! } : null,
    topSpecialty: top ? { name: top[0], count: top[1] } : null,
    rows: rows.map(r => ({
      name: r.name, sfId: r.sf_id, job: r.job, specialty: r.specialty, placedOn: r.placed_on,
      waitDays: r.wait_days === null ? null : Number(r.wait_days),
      fromAutomation: r.from_automation,
    })),
  }
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export interface DrillRow {
  name: string | null
  sfId: string | null
  job: string | null
  specialty: string | null
  date: string | null
  note: string | null
  fromAutomation: boolean
}

export interface DrillDetail {
  title: string
  subtitle: string
  headline: { value: string; label: string }
  facts: { label: string; value: string; hint?: string }[]
  rows: DrillRow[]
  truncated: boolean
}

const DRILL_LIMIT = 500

/**
 * The candidate-job pairings behind one funnel stage.
 *
 * Capped at 500 rows: "put forward" alone covers 3,069 pairings, and shipping all of them to the
 * browser to support scrolling nobody does would make the panel slow to open. The cap is reported
 * in the response rather than silently applied.
 */
export async function getFunnelStageDetail(stage: 'apps' | 'submitted' | 'placed'): Promise<DrillDetail | null> {
  const sql = djcSql
  if (!sql) return null
  const where =
    stage === 'placed' ? sql`a.placed_on is not null`
    : stage === 'submitted' ? sql`a.submittal_on is not null`
    : sql`true`
  const dateCol =
    stage === 'placed' ? sql`a.placed_on`
    : stage === 'submitted' ? sql`a.submittal_on`
    : sql`a.created_on`

  const rows = await sql<
    { name: string | null; sf_id: string | null; job: string | null; specialty: string | null;
      d: string | null; stage: string | null; from_automation: boolean }[]
  >`
    select a.applicant_name as name, a.applicant_sf_id as sf_id, a.job_name as job,
           c.target as specialty, to_char(${dateCol}, 'YYYY-MM-DD') as d, a.stage as stage,
           (c.sf_contact_id is not null and c.dedup_status = 'new') as from_automation
    from djc_sf_applications a
    left join djc_candidates c on c.sf_contact_id = a.applicant_sf_id
    where ${where}
    order by ${dateCol} desc nulls last
    limit ${DRILL_LIMIT}
  `
  const [agg] = await sql<{ n: number; people: number; jobs: number }[]>`
    select count(*)::int n, count(distinct a.applicant_sf_id)::int people,
           count(distinct a.job_name)::int jobs
    from djc_sf_applications a where ${where}
  `
  const label = stage === 'placed' ? 'Placed' : stage === 'submitted' ? 'Reached submittal' : 'Put forward for a job'
  return {
    title: label,
    subtitle: 'Each row is one candidate put forward for one job.',
    headline: { value: agg.n.toLocaleString(), label: 'pairings' },
    facts: [
      { label: 'distinct people', value: agg.people.toLocaleString() },
      { label: 'distinct jobs', value: agg.jobs.toLocaleString() },
      { label: 'pairings each', value: (agg.n / (agg.people || 1)).toFixed(1), hint: 'per person' },
    ],
    rows: rows.map(r => ({
      name: r.name, sfId: r.sf_id, job: r.job, specialty: r.specialty, date: r.d,
      note: r.stage, fromAutomation: r.from_automation,
    })),
    truncated: rows.length >= DRILL_LIMIT,
  }
}

/**
 * The candidates behind one supply-vs-demand row.
 *
 * `side` splits the bar: 'matched' are the people with at least one open job near them, 'unmatched'
 * are the ones we sourced with nothing to place them into — the second is the actionable list, so
 * it must be openable rather than just a number.
 */
export async function getSpecialtyDetail(
  specialty: string, side: 'matched' | 'unmatched',
): Promise<DrillDetail | null> {
  const sql = djcSql
  if (!sql) return null
  const cond = side === 'matched' ? sql`m.n > 0` : sql`coalesce(m.n, 0) = 0`
  const rows = await sql<
    { name: string | null; sf_id: string | null; specialty: string | null; d: string | null;
      n: number | null; nearest: number | null; city: string | null; state: string | null;
      jobs: string | null; from_automation: boolean }[]
  >`
    with c as (
      select c.*,
             case when c.last_activity ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$'
                  then to_date(c.last_activity, 'FMMM/FMDD/FMYY') end as last_act
      from djc_candidates c where c.sf_contact_id is not null
    ),
    m as (
      select sf_contact_id, count(*)::int as n, min(distance_mi) as nearest,
             -- The three closest live matches, so the panel shows the actual jobs rather than a count.
             string_agg(label, ' · ' order by distance_mi nulls last) filter (where rn <= 3) as jobs
      from (
        select sf_contact_id, distance_mi,
               coalesce(job_city_state, job_name, 'job') ||
                 case when distance_mi is null then '' else ' (' || round(distance_mi) || ' mi)' end as label,
               row_number() over (partition by sf_contact_id order by distance_mi nulls last) as rn
        from djc_job_matches where is_live
      ) x group by 1
    )
    select c.name, c.sf_contact_id as sf_id, c.target as specialty,
           to_char(c.last_act, 'YYYY-MM-DD') as d, m.n, m.nearest,
           c.mailing_city as city, c.mailing_state as state, m.jobs,
           (c.dedup_status = 'new') as from_automation
    from c left join m on m.sf_contact_id = c.sf_contact_id
    where coalesce(c.target, 'Unknown') = ${specialty}
      and c.last_act >= current_date - 90
      and not exists (
        select 1 from djc_sf_applications x
        where x.applicant_sf_id = c.sf_contact_id and x.placed_on is not null
      )
      and ${cond}
    order by m.n desc nulls last, c.last_act desc
    limit ${DRILL_LIMIT}
  `
  const [agg] = await sql<{ n: number; total: number | null; avg_m: number | null; jobs: number | null }[]>`
    with c as (
      select c.*, case when c.last_activity ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$'
                       then to_date(c.last_activity, 'FMMM/FMDD/FMYY') end as last_act
      from djc_candidates c where c.sf_contact_id is not null
    ),
    m as (select sf_contact_id, count(*)::int as n from djc_job_matches where is_live group by 1),
    sel as (
      select c.sf_contact_id, m.n from c left join m on m.sf_contact_id = c.sf_contact_id
      where coalesce(c.target, 'Unknown') = ${specialty}
        and c.last_act >= current_date - 90
        and not exists (select 1 from djc_sf_applications x
                        where x.applicant_sf_id = c.sf_contact_id and x.placed_on is not null)
        and ${cond}
    )
    select count(*)::int as n, coalesce(sum(n), 0)::int as total, avg(n) as avg_m,
           (select count(distinct job_sf_id)::int from djc_job_matches jm
            where jm.is_live and jm.sf_contact_id in (select sf_contact_id from sel)) as jobs
    from sel
  `
  return {
    title: `${specialty} — ${side === 'matched' ? 'have live job matches' : 'no live job match'}`,
    subtitle: side === 'matched'
      ? 'On the market, with at least one Salesforce match to an open job in a state they want.'
      : 'On the market, but Salesforce shows no live match to any open job.',
    headline: { value: agg.n.toLocaleString(), label: 'candidates' },
    facts: side === 'matched'
      ? [
          { label: 'live matches', value: (agg.total ?? 0).toLocaleString(), hint: 'candidate-job pairs' },
          { label: 'matches each', value: agg.avg_m === null ? '—' : Number(agg.avg_m).toFixed(1), hint: 'average' },
          { label: 'distinct jobs', value: (agg.jobs ?? 0).toLocaleString(), hint: 'they could fill' },
        ]
      : [{ label: 'open jobs', value: '0', hint: 'in a state they want' }],
    rows: rows.map(r => ({
      name: r.name, sfId: r.sf_id, job: r.jobs, specialty: r.specialty, date: r.d,
      note: [[r.city, r.state].filter(Boolean).join(', ') || null,
             r.n ? `${r.n} match${r.n === 1 ? '' : 'es'}` : null].filter(Boolean).join(' · ') || null,
      fromAutomation: r.from_automation,
    })),
    truncated: rows.length >= DRILL_LIMIT,
  }
}
