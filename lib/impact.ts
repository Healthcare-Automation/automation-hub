import kimSql from './db'
import djcSql from './djcDb'
import { TIME_MODEL, type ImpactData } from './impactScience'

export type { ImpactData, KimedicsSnapshot } from './impactScience'

function hoursSaved(opened: number, other: number, emails: number): number {
  const m = TIME_MODEL
  return Math.round((opened * m.minPerOpen + other * m.minPerOther + emails * m.minPerEmailSwitch) / 60)
}

import type { KimedicsSnapshot } from './impactScience'

/** Light Kimedics rollup for the Overview tab — one query, safe to fail to null. */
export async function getKimedicsSnapshot(): Promise<KimedicsSnapshot | null> {
  if (!kimSql) return null
  const rows = await kimSql<Record<string, number>[]>`
    select (select count(*) from email_scrapes)::int as emails,
           (select count(*) from email_scrapes where action_or_change = 'new')::int as opened,
           (select count(*) from email_scrapes where action_or_change <> 'new')::int as other,
           (select count(*) from job_current)::int as jobs,
           (select count(sf_job_id) from job_current)::int as in_sf,
           (select count(*) from job_event_log
            where (event_type ilike '%fail%' or event_type ilike '%error%')
              and created_at >= date_trunc('month', current_date))::int as failures`
  const r = rows[0]
  if (!r) return null
  return {
    jobsTracked: Number(r.jobs),
    jobsInSf: Number(r.in_sf),
    hoursSaved: hoursSaved(Number(r.opened), Number(r.other), Number(r.emails)),
    emails: Number(r.emails),
    failuresThisMonth: Number(r.failures),
  }
}

export interface KimWorkMonth {
  month: string        // YYYY-MM
  emails: number
  jobsTracked: number  // jobs first seen that month
  inSf: number         // ...of those, how many reached Salesforce
  updated: number
  closed: number
  patches: number
  worksites: number
  retries: number
  hours: number
}

/**
 * The automation's own work, month by month.
 *
 * Kimedics report on a monthly cycle, so the "work done" block has to answer "what did it do in
 * June" and not only "what has it ever done". Everything here is counted from timestamps in the
 * automation's own logs; `jobsTracked` is jobs FIRST seen in that month (a job opened in May and
 * updated in June counts once, in May) so months can be added together without double-counting.
 */
export async function getKimWorkByMonth(): Promise<KimWorkMonth[]> {
  if (!kimSql) return []
  const rows = await kimSql<
    { month: string; emails: number; opened: number; in_sf: number; updated: number;
      closed: number; other: number }[]
  >`
    select to_char(date_trunc('month', e.created_at), 'YYYY-MM')                       as month,
           count(*)::int                                                                as emails,
           count(*) filter (where e.action_or_change = 'new')::int                      as opened,
           count(*) filter (where e.action_or_change = 'new' and j.sf_job_id is not null)::int as in_sf,
           count(*) filter (where e.action_or_change in ('updated', 'status: Active'))::int as updated,
           count(*) filter (where e.action_or_change = 'status: Closed')::int           as closed,
           count(*) filter (where e.action_or_change <> 'new')::int                     as other
    from email_scrapes e
    left join job_current j on j.job_id = e.job_post_id
    group by 1 order by 1
  `
  const events = await kimSql<
    { month: string; patches: number; worksites: number; retries: number }[]
  >`
    select to_char(date_trunc('month', created_at), 'YYYY-MM')                          as month,
           count(*) filter (where event_type in ('sf_scrape_fields_patched','sf_ids_update'))::int as patches,
           count(*) filter (where event_type = 'worksite_created')::int                  as worksites,
           count(*) filter (where event_type = 'auto_retry_completed')::int              as retries
    from job_event_log
    group by 1 order by 1
  `
  const byMonth = new Map(events.map(e => [e.month, e]))
  return rows.map(r => {
    const e = byMonth.get(r.month)
    return {
      month: r.month,
      emails: Number(r.emails),
      jobsTracked: Number(r.opened),
      inSf: Number(r.in_sf),
      updated: Number(r.updated),
      closed: Number(r.closed),
      patches: Number(e?.patches ?? 0),
      worksites: Number(e?.worksites ?? 0),
      retries: Number(e?.retries ?? 0),
      hours: hoursSaved(Number(r.opened), Number(r.other), Number(r.emails)),
    }
  })
}

export async function getImpactData(): Promise<ImpactData | null> {
  if (!kimSql || !djcSql) return null

  const [kimTotals, kimMonthly, kimPatches, djcRoll, djcWeekly] = await Promise.all([
    kimSql<Record<string, number>[]>`
      select (select count(*) from email_scrapes)::int as emails,
             (select count(*) from email_scrapes where action_or_change = 'new')::int as opened,
             (select count(*) from email_scrapes where action_or_change in ('updated', 'status: Active'))::int as updated,
             (select count(*) from email_scrapes where action_or_change = 'status: Closed')::int as closed,
             (select count(*) from job_current)::int as jobs,
             (select count(sf_job_id) from job_current)::int as in_sf,
             (select count(*) from job_event_log where event_type = 'worksite_created')::int as worksites,
             (select count(*) from job_event_log
              where event_type in ('sf_scrape_fields_patched','sf_ids_update'))::int as patches,
             (select count(*) from job_event_log where event_type = 'auto_retry_completed')::int as retries`,
    kimSql<{ month: string; emails: number; opened: number; other: number }[]>`
      select to_char(date_trunc('month', created_at), 'Mon') as month,
             count(*)::int as emails,
             count(*) filter (where action_or_change = 'new')::int as opened,
             count(*) filter (where action_or_change <> 'new')::int as other
      from email_scrapes
      group by date_trunc('month', created_at)
      order by date_trunc('month', created_at)`,
    kimSql<{ month: string; count: number }[]>`
      select to_char(date_trunc('month', created_at), 'Mon') as month, count(*)::int as count
      from job_event_log where event_type in ('sf_scrape_fields_patched','sf_ids_update')
      group by date_trunc('month', created_at)
      order by date_trunc('month', created_at)`,
    djcSql<Record<string, number>[]>`
      select (select count(*) from djc_candidates)::int as observed,
             (select count(*) from djc_candidates where dedup_status = 'duplicate')::int as dupes,
             (select count(*) from djc_candidates
              where dedup_status = 'new' and sf_contact_id is not null)::int as created,
             (select count(*) from djc_candidates
              where phone is not null and contact_source in ('cv','cv_vision'))::int as phones,
             (select count(*) from djc_candidates
              where grad_year is not null or experience_years is not null)::int as resumes,
             (select count(*) from djc_runs
              where trigger = 'scheduled' and started_at >= now() - interval '30 days'
                and status = 'ok')::int as runs_ok,
             (select count(*) from djc_runs
              where trigger = 'scheduled' and started_at >= now() - interval '30 days')::int as runs,
             (select count(*) from djc_sf_applications where automation_era)::int as auto_apps,
             (select count(*) from djc_sf_applications
              where automation_era and stage in ('Placed','Extended'))::int as auto_placed`,
    djcSql<{ week: string; count: number }[]>`
      select to_char(date_trunc('week', placed_on), 'MM/DD') as week, count(*)::int as count
      from djc_sf_applications
      where stage in ('Placed','Extended','Extension Request')
        and placed_on >= current_date - interval '112 days'
      group by date_trunc('week', placed_on)
      order by date_trunc('week', placed_on)`,
  ])

  const k = kimTotals[0]
  const d = djcRoll[0]
  return {
    kim: {
      emails: Number(k.emails),
      opened: Number(k.opened),
      updated: Number(k.updated),
      closed: Number(k.closed),
      jobsTracked: Number(k.jobs),
      jobsInSf: Number(k.in_sf),
      worksitesCreated: Number(k.worksites),
      sfPatches: Number(k.patches),
      autoRetries: Number(k.retries),
      hoursSaved: hoursSaved(Number(k.opened), Number(k.updated) + Number(k.closed), Number(k.emails)),
      monthly: kimMonthly.map(m => ({
        month: m.month,
        emails: Number(m.emails),
        hours: hoursSaved(Number(m.opened), Number(m.other), Number(m.emails)),
      })),
      patchesMonthly: kimPatches.map(m => ({ month: m.month, count: Number(m.count) })),
    },
    djc: {
      observed: Number(d.observed),
      dupesPrevented: Number(d.dupes),
      created: Number(d.created),
      phonesRecovered: Number(d.phones),
      resumesMined: Number(d.resumes),
      runsOk30d: Number(d.runs_ok),
      runs30d: Number(d.runs),
      autoApps: Number(d.auto_apps),
      autoPlaced: Number(d.auto_placed),
      weeklyPlacements: djcWeekly.map(w => ({ week: w.week, count: Number(w.count) })),
    },
  }
}
