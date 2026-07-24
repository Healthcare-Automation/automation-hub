import djcSql from './djcDb'

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
  automation: { candidatesCreated: number; applications: number; placedOrExtended: number }
  netNewThisQuarter: number
  viewsRemaining: number | null
  lastRun: { at: string | null; status: string | null }
  placementsPerYear: { year: string; count: number }[]
  monthlySignups: { month: string; count: number }[]
  conserveActive: boolean
}

export interface DjcPipelineData {
  stages: { stage: string; count: number }[]
  staleContacts: { neverApplied: number; total: number }
  automationEra: { applications: number; placedOrExtended: number; placements: number }
  placementsPerYear: { year: string; count: number }[]
  repeatPlacements: { people: number; placements: number }
  recentPlacements: { person: string | null; job: string | null; placedOn: string | null; automationEra: boolean }[]
  inFlight: { person: string | null; job: string | null; stage: string | null; since: string | null; automationEra: boolean }[]
}

const STAGE_ORDER = [
  'Application', 'Internal Review', 'Name Clear', 'Submittal',
  'Interview', 'Offer', 'Placed', 'Extension Request', 'Extended',
]

export async function getDjcOverview(): Promise<DjcOverview | null> {
  const sql = djcSql
  if (!sql) return null

  const [heroRows, autoRows, quarterRows, viewsRows, runRows, yearRows, signupRows, conserveRows] =
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
                where automation_era and stage in ('Placed','Extended'))::int as placed`,
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
    },
    netNewThisQuarter: Number(quarterRows[0]?.c ?? 0),
    viewsRemaining: viewsRows[0]?.remaining === undefined ? null : Number(viewsRows[0].remaining),
    lastRun: { at: runRows[0]?.at ?? null, status: runRows[0]?.status ?? null },
    placementsPerYear: yearRows.map(r => ({ year: r.year, count: Number(r.count) })),
    monthlySignups: signupRows.map(r => ({ month: r.month, count: Number(r.count) })),
    conserveActive: Number(conserveRows[0]?.c ?? 0) > 0,
  }
}

export async function getDjcPipeline(): Promise<DjcPipelineData | null> {
  const sql = djcSql
  if (!sql) return null

  const [stageRows, staleRows, autoRows, yearRows, repeatRows, recentRows, flightRows] =
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
      sql<{ person: string | null; job: string | null; placed: string | null; auto: boolean }[]>`
        select person_name as person, job_name as job,
               to_char(coalesce(placed_on, start_on), 'YYYY-MM-DD') as placed,
               automation_era as auto
        from djc_sf_placements order by coalesce(placed_on, start_on) desc nulls last limit 15`,
      sql<{ person: string | null; job: string | null; stage: string | null; since: string | null; auto: boolean }[]>`
        select applicant_name as person, job_name as job, stage,
               to_char(greatest(coalesce(interview_on, created_on), coalesce(offer_on, created_on)), 'YYYY-MM-DD') as since,
               automation_era as auto
        from djc_sf_applications
        where stage in ('Interview', 'Offer', 'Submittal', 'Name Clear', 'Internal Review')
        order by synced_at desc, created_on desc nulls last limit 25`,
    ])

  const byStage = new Map(stageRows.map(r => [r.stage, Number(r.count)]))
  return {
    stages: STAGE_ORDER.map(s => ({ stage: s, count: byStage.get(s) ?? 0 })),
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
      person: r.person, job: r.job, placedOn: r.placed, automationEra: r.auto,
    })),
    inFlight: flightRows.map(r => ({
      person: r.person, job: r.job, stage: r.stage, since: r.since, automationEra: r.auto,
    })),
  }
}
