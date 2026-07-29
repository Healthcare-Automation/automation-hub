import djcSql from './djcDb'
import type { PipelineRange } from './djcTypes'

/**
 * Overview + Pipeline data, read from the local Salesforce mirror
 * (djc_sf_applications / djc_sf_placements, refreshed after every hourly run)
 * plus light rollups from the automation's own tables. All queries are local
 * Supabase reads — nothing here touches Salesforce or DJC at request time.
 */

export interface DjcOverview {
  placementsThisYear: number
  placementsAllTime: number
  peoplePlaced: number
  activeApplications: number // in-flight: not yet placed/extended
  automation: {
    candidatesCreated: number
    applications: number
    placedOrExtended: number
    observed: number
    resumesMined: number
  }
  netNewThisQuarter: number
  viewsRemaining: number | null
  lastRun: { at: string | null; status: string | null }
  placementsPerYear: { year: string; count: number }[]
  monthlySignups: { month: string; count: number }[]
  conserveActive: boolean
  glance: { linked: number; worked: number; placed: number } // the whole operation in 3 numbers
  quarterly: { quarter: string; count: number }[] // placements per quarter
  execSummary: { id: number; text: string; generatedAt: string } | null // auto-written weekly assessment
}

export interface DjcPipelineData {
  stages: { stage: string; count: number }[]
  reached: { label: string; count: number }[] // true funnel: applications that reached each dated stage
  quarterly: { quarter: string; count: number }[] // placements per quarter since 2022
  staleContacts: { neverApplied: number; total: number }
  automationEra: { applications: number; placedOrExtended: number; placements: number }
  placementsPerYear: { year: string; count: number }[]
  repeatPlacements: { people: number; placements: number }
  recentPlacements: { person: string | null; job: string | null; placedOn: string | null; automationEra: boolean; sfAddedOn: string | null }[]
  inFlight: { person: string | null; job: string | null; stage: string | null; since: string | null; automationEra: boolean; sfAddedOn: string | null; specialty: string | null }[]
}

const STAGE_ORDER = [
  'Application', 'Internal Review', 'Name Clear', 'Submittal',
  'Interview', 'Offer', 'Placed', 'Extension Request', 'Extended',
]

export async function getDjcOverview(): Promise<DjcOverview | null> {
  const sql = djcSql
  if (!sql) return null

  const [heroRows, autoRows, quarterRows, viewsRows, runRows, yearRows, signupRows, conserveRows, glanceRows, qtrRows, summaryRows] =
    await Promise.all([
      sql<Record<string, number>[]>`
        select (select count(*) from djc_sf_applications
                where stage in ('Placed','Extended','Extension Request')
                  and placed_on >= date_trunc('year', current_date))::int as placements_this_year,
               (select count(*) from djc_sf_placements)::int as placements_all_time,
               (select count(distinct person_sf_id) from djc_sf_placements)::int as people_placed,
               (select count(*) from djc_sf_applications
                where stage not in ('Placed','Extended') )::int as active_applications`,
      sql<Record<string, number>[]>`
        select (select count(*) from djc_candidates
                where dedup_status = 'new' and sf_contact_id is not null)::int as created,
               (select count(*) from djc_sf_applications where automation_era)::int as apps,
               (select count(*) from djc_sf_applications
                where automation_era and stage in ('Placed','Extended'))::int as placed,
               (select count(*) from djc_candidates)::int as observed,
               (select count(*) from djc_candidates
                where grad_year is not null or experience_years is not null)::int as resumes`,
      sql<{ c: number }[]>`
        with reset as (
          select max(day) as d from (
            select (created_at at time zone 'America/New_York')::date as day,
                   max((payload->>'used')::int) as used,
                   lag(max((payload->>'used')::int)) over (order by (created_at at time zone 'America/New_York')::date) as prev
            from djc_event_log where event_type = 'profile_views_snapshot'
            group by 1) t where used < prev)
        select count(*)::int as c from djc_candidates
        where dedup_status = 'new' and first_seen_at >= (select d from reset)`,
      sql<{ remaining: number }[]>`
        select ((payload->>'total')::int - (payload->>'used')::int) as remaining
        from djc_event_log where event_type = 'profile_views_snapshot'
        order by id desc limit 1`,
      sql<{ at: string | null; status: string | null }[]>`
        select to_char(started_at at time zone 'America/New_York', 'Mon DD HH24:MI') as at, status
        from djc_runs where trigger = 'scheduled' order by id desc limit 1`,
      sql<{ year: string; count: number }[]>`
        select to_char(placed_on, 'YYYY') as year, count(*)::int as count
        from djc_sf_applications
        where stage in ('Placed','Extended','Extension Request') and placed_on is not null
        group by 1 order by 1`,
      sql<{ month: string; count: number }[]>`
        select to_char(date_trunc('month', registered_on), 'YYYY-MM') as month, count(*)::int as count
        from djc_candidates
        where registered_on >= date_trunc('month', current_date) - interval '11 months'
        group by 1 order by 1`,
      sql<{ c: number }[]>`
        select count(*)::int as c from djc_candidates
        where dedup_reason = 'name_conserve' and updated_at >= now() - interval '7 days'`,
      sql<Record<string, number>[]>`
        select count(*)::int as linked,
               count(*) filter (where exists (select 1 from djc_sf_applications a
                 where a.applicant_sf_id = c.sf_contact_id))::int as worked,
               count(*) filter (where exists (select 1 from djc_sf_applications a
                 where a.applicant_sf_id = c.sf_contact_id
                 and a.stage in ('Placed','Extended','Extension Request')))::int as placed
        from djc_candidates c where c.sf_contact_id is not null`,
      sql<{ quarter: string; count: number }[]>`
        select to_char(date_trunc('quarter', placed_on), 'YYYY "Q"Q') as quarter, count(*)::int as count
        from djc_sf_applications
        where stage in ('Placed','Extended','Extension Request') and placed_on >= '2022-01-01'
        group by date_trunc('quarter', placed_on)
        order by date_trunc('quarter', placed_on)`,
      sql<{ id: number; text: string; generated_at: string }[]>`
        select id, summary as text,
               to_char(generated_at at time zone 'America/New_York', 'Mon DD, YYYY') as generated_at
        from djc_exec_summary order by id desc limit 1`,
    ])

  const h = heroRows[0]
  const a = autoRows[0]
  return {
    placementsThisYear: Number(h.placements_this_year),
    placementsAllTime: Number(h.placements_all_time),
    peoplePlaced: Number(h.people_placed),
    activeApplications: Number(h.active_applications),
    automation: {
      candidatesCreated: Number(a.created),
      applications: Number(a.apps),
      placedOrExtended: Number(a.placed),
      observed: Number(a.observed),
      resumesMined: Number(a.resumes),
    },
    netNewThisQuarter: Number(quarterRows[0]?.c ?? 0), // since the last views refill (monthly, the 15th) — not a calendar quarter
    viewsRemaining: viewsRows[0]?.remaining === undefined ? null : Number(viewsRows[0].remaining),
    lastRun: { at: runRows[0]?.at ?? null, status: runRows[0]?.status ?? null },
    placementsPerYear: yearRows.map(r => ({ year: r.year, count: Number(r.count) })),
    monthlySignups: signupRows.map(r => ({ month: r.month, count: Number(r.count) })),
    conserveActive: Number(conserveRows[0]?.c ?? 0) > 0,
    glance: {
      linked: Number(glanceRows[0]?.linked ?? 0),
      worked: Number(glanceRows[0]?.worked ?? 0),
      placed: Number(glanceRows[0]?.placed ?? 0),
    },
    quarterly: qtrRows.map(r => ({ quarter: r.quarter, count: Number(r.count) })),
    execSummary: summaryRows[0]
      ? { id: Number(summaryRows[0].id), text: summaryRows[0].text, generatedAt: summaryRows[0].generated_at }
      : null,
  }
}

/**
 * The stage funnel, scoped to a time window.
 *
 * Scoped on `created_on` — the application's own start — so a window contains whole journeys rather
 * than a snapshot of whatever happened to move. The all-time figure is dominated by years of
 * history, which hides whether the pipeline is converting better or worse right now.
 */
export async function getPipelineFunnel(range: PipelineRange) {
  const sql = djcSql
  if (!sql) return null
  const since = range === '7d' ? '7 days' : range === '30d' ? '30 days' : null
  const rows = since
    ? await sql<Record<string, number>[]>`
        select count(*)::int as apps, count(submittal_on)::int as submitted,
               count(interview_on)::int as interviewed, count(offer_on)::int as offered,
               count(placed_on)::int as placed
        from djc_sf_applications
        where created_on >= (now() - ${since}::interval)::date`
    : await sql<Record<string, number>[]>`
        select count(*)::int as apps, count(submittal_on)::int as submitted,
               count(interview_on)::int as interviewed, count(offer_on)::int as offered,
               count(placed_on)::int as placed
        from djc_sf_applications`
  const r = rows[0]
  return [
    { label: 'Application', count: Number(r.apps) },
    { label: 'Submittal', count: Number(r.submitted) },
    { label: 'Interview', count: Number(r.interviewed) },
    { label: 'Offer', count: Number(r.offered) },
    { label: 'Placed', count: Number(r.placed) },
  ]
}


/**
 * The individual applications behind one funnel stage — the raw rows for a drill-down.
 *
 * "Reached this stage" means the stage's date is set, matching how the funnel counts. Scoped by the
 * same window as the funnel so the rows always reconcile with the number that was clicked.
 */
export async function getFunnelStageRows(stage: string, range: PipelineRange, limit = 300) {
  const sql = djcSql
  if (!sql) return []
  const col =
    stage === 'Submittal' ? 'submittal_on'
    : stage === 'Interview' ? 'interview_on'
    : stage === 'Offer' ? 'offer_on'
    : stage === 'Placed' ? 'placed_on'
    : null   // 'Application' = every row in the window
  const since = range === '7d' ? '7 days' : range === '30d' ? '30 days' : null

  const rows = await sql<{
    person: string | null; job: string | null; stage: string | null; specialty: string | null
    created: string | null; reached: string | null; auto: boolean
  }[]>`
    select a.applicant_name as person, a.job_name as job, a.stage,
           max(c.target) as specialty,
           to_char(a.created_on, 'YYYY-MM-DD') as created,
           to_char(${col ? sql.unsafe(`a.${col}`) : sql.unsafe('a.created_on')}, 'YYYY-MM-DD') as reached,
           bool_or(coalesce(a.automation_era, false)) as auto
    from djc_sf_applications a
    left join djc_candidates c on c.sf_contact_id = a.applicant_sf_id
    where ${col ? sql.unsafe(`a.${col} is not null`) : sql.unsafe('true')}
      ${since ? sql`and a.created_on >= (now() - ${since}::interval)::date` : sql``}
    group by a.sf_id, a.applicant_name, a.job_name, a.stage, a.created_on,
             ${col ? sql.unsafe(`a.${col}`) : sql.unsafe('a.created_on')}
    order by ${col ? sql.unsafe(`a.${col}`) : sql.unsafe('a.created_on')} desc nulls last
    limit ${limit}
  `
  return rows
}


export async function getDjcPipeline(): Promise<DjcPipelineData | null> {
  const sql = djcSql
  if (!sql) return null

  const [stageRows, staleRows, autoRows, yearRows, repeatRows, recentRows, flightRows, reachedRows, quarterRows] =
    await Promise.all([
      sql<{ stage: string; count: number }[]>`
        select stage, count(*)::int as count from djc_sf_applications
        where stage is not null group by 1`,
      sql<{ never_applied: number; total: number }[]>`
        select (select count(*) from djc_candidates c
                where c.sf_contact_id is not null
                  and not exists (select 1 from djc_sf_applications a
                                  where a.applicant_sf_id = c.sf_contact_id))::int as never_applied,
               (select count(*) from djc_candidates where sf_contact_id is not null)::int as total`,
      sql<Record<string, number>[]>`
        select (select count(*) from djc_sf_applications where automation_era)::int as apps,
               (select count(*) from djc_sf_applications
                where automation_era and stage in ('Placed','Extended'))::int as placed,
               (select count(*) from djc_sf_placements where automation_era)::int as placements`,
      sql<{ year: string; count: number }[]>`
        select to_char(placed_on, 'YYYY') as year, count(*)::int as count
        from djc_sf_applications
        where stage in ('Placed','Extended','Extension Request') and placed_on is not null
        group by 1 order by 1`,
      sql<{ people: number; placements: number }[]>`
        select count(*)::int as people, coalesce(sum(n), 0)::int as placements from (
          select person_sf_id, count(*) as n from djc_sf_placements
          group by 1 having count(*) > 1) t`,
      sql<{ person: string | null; job: string | null; placed: string | null; auto: boolean; added: string | null }[]>`
        select person_name as person, job_name as job,
               to_char(coalesce(placed_on, start_on), 'YYYY-MM-DD') as placed,
               automation_era as auto,
               to_char(person_added_on, 'YYYY-MM-DD') as added
        from djc_sf_placements order by coalesce(placed_on, start_on) desc nulls last limit 15`,
      sql<{ person: string | null; job: string | null; stage: string | null; since: string | null; auto: boolean; added: string | null; specialty: string | null }[]>`
        select a.applicant_name as person, a.job_name as job, a.stage,
               to_char(greatest(coalesce(a.interview_on, a.created_on), coalesce(a.offer_on, a.created_on)), 'YYYY-MM-DD') as since,
               a.automation_era as auto,
               to_char(a.applicant_added_on, 'YYYY-MM-DD') as added,
               max(c.target) as specialty
        from djc_sf_applications a
        left join djc_candidates c on c.sf_contact_id = a.applicant_sf_id
        where a.stage in ('Interview', 'Offer', 'Submittal', 'Name Clear', 'Internal Review')
        group by a.sf_id, a.applicant_name, a.job_name, a.stage, a.interview_on, a.created_on,
                 a.offer_on, a.automation_era, a.applicant_added_on, a.synced_at
        order by a.synced_at desc, a.created_on desc nulls last limit 25`,
      sql<Record<string, number>[]>`
        select count(*)::int as apps,
               count(submittal_on)::int as submitted,
               count(interview_on)::int as interviewed,
               count(offer_on)::int as offered,
               count(placed_on)::int as placed
        from djc_sf_applications`,
      sql<{ quarter: string; count: number }[]>`
        select to_char(date_trunc('quarter', placed_on), 'YYYY "Q"Q') as quarter, count(*)::int as count
        from djc_sf_applications
        where stage in ('Placed','Extended','Extension Request') and placed_on >= '2022-01-01'
        group by date_trunc('quarter', placed_on)
        order by date_trunc('quarter', placed_on)`,
    ])

  const byStage = new Map(stageRows.map(r => [r.stage, Number(r.count)]))
  const rr = reachedRows[0]
  return {
    stages: STAGE_ORDER.map(s => ({ stage: s, count: byStage.get(s) ?? 0 })),
    reached: [
      { label: 'Application', count: Number(rr.apps) },
      { label: 'Submittal', count: Number(rr.submitted) },
      { label: 'Interview', count: Number(rr.interviewed) },
      { label: 'Offer', count: Number(rr.offered) },
      { label: 'Placed', count: Number(rr.placed) },
    ],
    quarterly: quarterRows.map(r => ({ quarter: r.quarter, count: Number(r.count) })),
    staleContacts: {
      neverApplied: Number(staleRows[0]?.never_applied ?? 0),
      total: Number(staleRows[0]?.total ?? 0),
    },
    automationEra: {
      applications: Number(autoRows[0]?.apps ?? 0),
      placedOrExtended: Number(autoRows[0]?.placed ?? 0),
      placements: Number(autoRows[0]?.placements ?? 0),
    },
    placementsPerYear: yearRows.map(r => ({ year: r.year, count: Number(r.count) })),
    repeatPlacements: {
      people: Number(repeatRows[0]?.people ?? 0),
      placements: Number(repeatRows[0]?.placements ?? 0),
    },
    recentPlacements: recentRows.map(r => ({
      person: r.person, job: r.job, placedOn: r.placed, automationEra: r.auto, sfAddedOn: r.added,
    })),
    inFlight: flightRows.map(r => ({
      person: r.person, job: r.job, stage: r.stage, since: r.since, automationEra: r.auto,
      sfAddedOn: r.added, specialty: r.specialty,
    })),
  }
}

export interface SpecialtyOutcome {
  specialty: string
  n: number
  worked: number
  placed: number
}
export type SpecialtyOutcomesByRange = Record<PipelineRange, SpecialtyOutcome[]>

/**
 * Specialty outcomes for all three windows in one round-trip.
 *
 * The windows filter on RECRUITER ACTIVITY (an application or placement dated inside the window),
 * not on when we sourced the candidate. Sourcing-date windows are degenerate here: 202 candidates
 * arrived in the last 7 days and the median wait to placement is months, so every short window
 * would show a column of zeros and read as "the automation produces nothing".
 *
 * The denominator stays the full sourced cohort per specialty in every window, so the bars answer
 * "of the people we hold in this specialty, how many did recruiters touch in this period".
 */
export async function getSpecialtyOutcomes(): Promise<SpecialtyOutcomesByRange | null> {
  const sql = djcSql
  if (!sql) return null
  const rows = await sql<
    { specialty: string; n: number; w7: number; p7: number; w30: number; p30: number; wall: number; pall: number }[]
  >`
    with cand as (
      select distinct sf_contact_id, coalesce(target, 'Unknown') as specialty
      from djc_candidates where sf_contact_id is not null
    ),
    act as (
      select applicant_sf_id,
             bool_or(created_on >= now() - interval '7 days')  as w7,
             bool_or(placed_on  >= now() - interval '7 days')  as p7,
             bool_or(created_on >= now() - interval '30 days') as w30,
             bool_or(placed_on  >= now() - interval '30 days') as p30,
             true                                              as wall,
             bool_or(placed_on is not null)                    as pall
      from djc_sf_applications group by 1
    )
    select c.specialty,
           count(*)::int                              as n,
           count(*) filter (where a.w7)::int          as w7,
           count(*) filter (where a.p7)::int          as p7,
           count(*) filter (where a.w30)::int         as w30,
           count(*) filter (where a.p30)::int         as p30,
           count(*) filter (where a.wall)::int        as wall,
           count(*) filter (where a.pall)::int        as pall
    from cand c left join act a on a.applicant_sf_id = c.sf_contact_id
    group by 1 having count(*) >= 20
    order by count(*) desc
  `
  const pick = (k: 'w7' | 'w30' | 'wall', j: 'p7' | 'p30' | 'pall') =>
    rows.map(r => ({ specialty: r.specialty, n: r.n, worked: r[k], placed: r[j] }))
  return { '7d': pick('w7', 'p7'), '30d': pick('w30', 'p30'), all: pick('wall', 'pall') }
}
