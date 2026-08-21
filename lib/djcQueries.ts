import djcSql from './djcDb'
import type {
  DjcDayStatus,
  DjcDayStatusKind,
  DjcRunDetail,
  DjcRunStatus,
  DjcEvent,
  DjcEventLevel,
  DjcCandidateRow,
  DjcRunDetailBundle,
  DjcSummary,
  DjcProfileViews,
  DjcQuotaBlockedRow,
  DjcViewEfficiencyDay,
  DjcViewEfficiencyWeek,
} from './djcTypes'

const DAYS = 90

function dayKind(d: {
  totalRuns: number
  errorRuns: number
  errors: number
  candidatesSelected: number
}): DjcDayStatusKind {
  if (d.totalRuns === 0) return 'no_data'
  if (d.errorRuns > 0) return 'outage'
  if (d.errors > 0) return 'degraded'
  if (d.candidatesSelected > 0) return 'operational'
  return 'idle'
}

/** 90-day daily aggregate from djc_runs, gaps filled as no_data. */
export async function getDjcDailyStatus(): Promise<DjcDayStatus[]> {
  const sql = djcSql
  const rows = sql
    ? await sql<
        {
          day: string
          unresolved_errors: number
          total_runs: number
          completed_runs: number
          error_runs: number
          candidates_seen: number
          candidates_selected: number
          contactable: number
          duplicates: number
          created: number
          create_skipped_guard: number
          errors: number
          error_run_details: string[] | null
        }[]
      >`
        with unresolved as (
          -- Same recovery rule as the run history: an error a later run undid is not a fault the
          -- day should be coloured for. See getDjcRecentRuns for why.
          select r2.started_at::date as day, count(*)::int as n
          from djc_event_log e2
          join djc_runs r2 on r2.id = e2.run_id
          where e2.level = 'error'
            and r2.started_at >= now() - interval '90 days'
            and not exists (
              select 1 from djc_event_log fix
              where fix.run_id > e2.run_id
                and fix.created_at < e2.created_at + interval '24 hours'
                and (
                  (e2.event_type = 'list_scrape_failed'
                     and fix.event_type = 'target_completed' and fix.message = e2.message)
                  or (e2.candidate_id is not null
                     and fix.candidate_id = e2.candidate_id
                     and fix.event_type in ('profile_scraped', 'contact_created', 'dedup_match',
                                            'candidate_uncontactable'))
                ))
          group by 1
        )
        select to_char(started_at::date, 'YYYY-MM-DD')                       as day,
               coalesce(max(u.n), 0)::int                                    as unresolved_errors,
               count(*)::int                                                 as total_runs,
               count(*) filter (where finished_at is not null)::int          as completed_runs,
               count(*) filter (where status in ('error','session_expired')
                                  or status ~ '^reauth_failed: ')::int as error_runs,
               coalesce(sum(candidates_seen),0)::int                         as candidates_seen,
               coalesce(sum(candidates_selected),0)::int                     as candidates_selected,
               coalesce(sum(contactable),0)::int                             as contactable,
               coalesce(sum(duplicates),0)::int                              as duplicates,
               coalesce(sum(created),0)::int                                 as created,
               coalesce(sum(create_skipped_guard),0)::int                    as create_skipped_guard,
               coalesce(sum(errors),0)::int                                  as errors,
               array_agg(to_char(started_at, 'HH24:MI') || ' — ' || replace(status, '_', ' ')
                         order by started_at)
                 filter (where status in ('error','session_expired')
                           or status ~ '^reauth_failed: ')    as error_run_details
        from djc_runs
        left join unresolved u on u.day = djc_runs.started_at::date
        where started_at >= now() - interval '90 days'
        group by 1
      `
    : []

  const byDay = new Map(rows.map(r => [r.day, r]))
  const out: DjcDayStatus[] = []
  const today = new Date()
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - i)
    const key = d.toISOString().split('T')[0]
    const r = byDay.get(key)
    if (!r) {
      out.push({
        day: key, totalRuns: 0, completedRuns: 0, candidatesSeen: 0, candidatesSelected: 0,
        contactable: 0, duplicates: 0, created: 0, createSkippedGuard: 0, errors: 0,
        errorRuns: 0, errorRunDetails: [],
        status: 'no_data',
      })
    } else {
      out.push({
        day: key,
        totalRuns: r.total_runs,
        completedRuns: r.completed_runs,
        candidatesSeen: r.candidates_seen,
        candidatesSelected: r.candidates_selected,
        contactable: r.contactable,
        duplicates: r.duplicates,
        created: r.created,
        createSkippedGuard: r.create_skipped_guard,
        errors: r.errors,
        errorRuns: r.error_runs,
        errorRunDetails: r.error_run_details ?? [],
        status: dayKind({
          totalRuns: r.total_runs,
          errorRuns: r.error_runs,
          errors: r.unresolved_errors,
          candidatesSelected: r.candidates_selected,
        }),
      })
    }
  }
  return out
}

/**
 * Runs from the last `days` days, newest first — a window rather than a row count, so the run
 * history can group by day without a short day silently swallowing the days behind it.
 * `cap` is a runaway guard only; 14 days is ~140 runs.
 */
export async function getDjcRecentRuns(days = 14, cap = 400): Promise<DjcRunDetail[]> {
  const sql = djcSql
  if (!sql) return []
  const rows = await sql<
    {
      id: number
      started_at: string
      finished_at: string | null
      duration_seconds: number | null
      status: DjcRunStatus
      trigger: string | null
      write_mode: string | null
      targets: string | null
      targets_processed: number
      candidates_seen: number
      candidates_selected: number
      contactable: number
      uncontactable: number
      duplicates: number
      created: number
      create_skipped_guard: number
      errors: number
      warn_count: number
      error_count: number
      quota_blocked: number
      views_spent: number
      created_from_views: number
      unresolved_error_count: number
    }[]
  >`
    select r.id,
           r.started_at,
           r.finished_at,
           extract(epoch from (r.finished_at - r.started_at))::int as duration_seconds,
           r.status, r.trigger, r.write_mode, r.targets,
           r.targets_processed, r.candidates_seen, r.candidates_selected, r.contactable,
           r.uncontactable, r.duplicates, r.created, r.create_skipped_guard, r.errors,
           coalesce(ev.warn_count, 0)::int as warn_count,
           coalesce(ev.error_count, 0)::int as error_count,
           coalesce(ev.quota_blocked, 0)::int as quota_blocked,
           coalesce(ev.views_spent, 0)::int as views_spent,
           coalesce(ev.created_from_views, 0)::int as created_from_views,
           coalesce(ev2.unresolved_error_count, 0)::int as unresolved_error_count
    from djc_runs r
    left join lateral (
      select count(*) filter (where e.level = 'warn') as warn_count,
             count(*) filter (where e.level = 'error') as error_count,
             count(*) filter (where e.event_type = 'profile_view_quota_blocked') as quota_blocked,
             -- A view is charged only when a profile is actually OPENED. Candidates the quota wall
             -- stopped were never opened, so they are excluded.
             count(distinct e.candidate_id) filter (
               where e.event_type = 'profile_scraped'
                 and e.candidate_id not in (
                   select candidate_id from djc_event_log b
                   where b.run_id = r.id and b.event_type = 'profile_view_quota_blocked'
                     and b.candidate_id is not null)) as views_spent,
             -- Contacts created FROM those same views. Dividing every contact the run created by
             -- only its unblocked opens mixes two different groups of people: a candidate whose
             -- reveal the quota wall blocked can still yield a contact from their résumé, landing
             -- in the numerator while excluded from the denominator. That is how a run showed
             -- "133% landed" on 2026-08-13.
             count(distinct e.candidate_id) filter (
               where e.event_type = 'contact_created'
                 and e.candidate_id in (
                   select v.candidate_id from djc_event_log v
                   where v.run_id = r.id and v.event_type = 'profile_scraped'
                     and v.candidate_id not in (
                       select b2.candidate_id from djc_event_log b2
                       where b2.run_id = r.id and b2.event_type = 'profile_view_quota_blocked'
                         and b2.candidate_id is not null))) as created_from_views
      from djc_event_log e where e.run_id = r.id
    ) ev on true
    -- Errors a LATER run undid. A specialty whose list page timed out is recovered once a later run
    -- scraped that same specialty; a candidate-scoped failure is recovered once that candidate was
    -- opened, matched or ruled uncontactable. Recovered errors still happened and are still counted
    -- in error_count — but they are not a live fault, and showing them as one makes a system that
    -- healed itself within the hour look broken. Kept in its own lateral so the correlated lookup
    -- only ever runs for the handful of error rows, not for every event in the run.
    left join lateral (
      select count(*)::int as unresolved_error_count
      from djc_event_log e2
      where e2.run_id = r.id
        and e2.level = 'error'
        and not exists (
          select 1 from djc_event_log fix
          where fix.run_id > e2.run_id
            and fix.created_at < e2.created_at + interval '24 hours'
            and (
              (e2.event_type = 'list_scrape_failed'
                 and fix.event_type = 'target_completed' and fix.message = e2.message)
              or (e2.candidate_id is not null
                 and fix.candidate_id = e2.candidate_id
                 and fix.event_type in ('profile_scraped', 'contact_created', 'dedup_match',
                                        'candidate_uncontactable'))
            ))
    ) ev2 on true
    where r.trigger in ('scheduled', 'backfill')
      and r.started_at > now() - (${days} || ' days')::interval
    order by r.id desc
    limit ${cap}
  `
  return rows.map(r => ({
    id: r.id,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    durationSeconds: r.duration_seconds,
    status: r.status,
    trigger: r.trigger,
    writeMode: r.write_mode,
    targets: r.targets,
    targetsProcessed: r.targets_processed,
    candidatesSeen: r.candidates_seen,
    candidatesSelected: r.candidates_selected,
    contactable: r.contactable,
    uncontactable: r.uncontactable,
    duplicates: r.duplicates,
    created: r.created,
    createSkippedGuard: r.create_skipped_guard,
    errors: r.errors,
    warnCount: r.warn_count,
    errorCount: r.error_count,
    unresolvedErrorCount: r.unresolved_error_count,
    quotaBlocked: r.quota_blocked,
    viewsSpent: r.views_spent,
    createdFromViews: r.created_from_views,
  }))
}

/** Full detail for one run: the complete event trail + the candidate data grabbed. */
export async function getDjcRunDetail(runId: number): Promise<DjcRunDetailBundle> {
  const sql = djcSql
  if (!sql) return { events: [], candidates: [] }

  const [eventRows, candRows] = await Promise.all([
    sql<
      {
        id: number
        run_id: number | null
        candidate_id: string | null
        event_type: string
        stage: string | null
        level: DjcEventLevel
        message: string | null
        payload: Record<string, unknown> | null
        created_at: string
      }[]
    >`
      select id, run_id::int, candidate_id, event_type, stage, level, message, payload, created_at
      from djc_event_log
      where run_id = ${runId}
         or candidate_id in (select candidate_id from djc_candidates
                            where first_seen_run = ${runId} or last_seen_run = ${runId})
      order by id
    `,
    sql<
      {
        candidate_id: string
        profile_url: string | null
        name: string | null
        target: string | null
        phone: string | null
        email: string | null
        contact_source: string | null
        mailing_city: string | null
        mailing_state: string | null
        mailing_postal_code: string | null
        state_licenses: string | null
        preferred_states: string | null
        position_types: string | null
        cv_uploaded: boolean
        cv_filename: string | null
        cv_bytes_len: number | null
        dedup_status: string | null
        dedup_reason: string | null
        sf_contact_id: string | null
        match_count: number | null
        first_seen_at: string | null
        last_reviewed_on: string | null
        quota_blocked: boolean
        blocked_this_run: boolean
        opened_this_run: boolean
        created_this_run: boolean
        matched_this_run: boolean
      }[]
    >`
      select c.candidate_id, c.profile_url, c.name, c.target, c.phone, c.email, c.contact_source,
             c.mailing_city, c.mailing_state, c.mailing_postal_code, c.state_licenses,
             c.preferred_states, c.position_types, c.cv_uploaded, c.cv_filename, c.cv_bytes_len,
             c.dedup_status, c.dedup_reason, c.sf_contact_id, c.match_count, c.first_seen_at,
             c.last_reviewed_on,
             -- Did the Profile Views wall stop us revealing this candidate's contact info? Without
             -- this the UI can't tell "we looked and there was nothing" from "we were never allowed
             -- to look", and both land in contact_source='none'.
             exists (select 1 from djc_event_log e
                     where e.candidate_id = c.candidate_id
                       and e.event_type = 'profile_view_quota_blocked') as quota_blocked,
             -- PER-RUN facts. The two above are lifetime state: a candidate blocked last week but
             -- successfully opened in THIS run still reads as "blocked", which made the run funnel
             -- report 0 views while the run's own header reported 2. Everything shown inside a run
             -- must describe that run.
             exists (select 1 from djc_event_log e
                     where e.candidate_id = c.candidate_id and e.run_id = ${runId}
                       and e.event_type = 'profile_view_quota_blocked') as blocked_this_run,
             exists (select 1 from djc_event_log e
                     where e.candidate_id = c.candidate_id and e.run_id = ${runId}
                       and e.event_type = 'profile_scraped') as opened_this_run,
             exists (select 1 from djc_event_log e
                     where e.candidate_id = c.candidate_id and e.run_id = ${runId}
                       and e.event_type = 'contact_created') as created_this_run,
             exists (select 1 from djc_event_log e
                     where e.candidate_id = c.candidate_id and e.run_id = ${runId}
                       and e.event_type = 'dedup_match') as matched_this_run
      -- Only candidates this run actually PROCESSED. Selecting on last_seen_run pulled in every
      -- candidate the free list scan merely touched (record_seen_cards stamps it on all ~1,100),
      -- so the groups below showed other runs' outcomes and contradicted the run's own counters.
      from djc_candidates c
      where c.candidate_id in (
        select candidate_id from djc_event_log
        where run_id = ${runId} and event_type = 'candidate_selected' and candidate_id is not null
      )
      order by c.updated_at desc
    `,
  ])

  const events: DjcEvent[] = eventRows.map(e => ({
    id: e.id,
    runId: e.run_id,
    candidateId: e.candidate_id,
    eventType: e.event_type,
    stage: e.stage,
    level: e.level,
    // Run-level authentication events are operational signals only. Never expose their diagnostic
    // message or payload through the client-facing API, even if the UI currently ignores them.
    message: e.candidate_id == null ? null : e.message,
    payload: e.candidate_id == null ? null : e.payload,
    createdAt: e.created_at,
  }))
  const candidates: DjcCandidateRow[] = candRows.map(c => ({
    candidateId: c.candidate_id,
    profileUrl: c.profile_url,
    name: c.name,
    target: c.target,
    phone: c.phone,
    email: c.email,
    contactSource: c.contact_source,
    mailingCity: c.mailing_city,
    mailingState: c.mailing_state,
    mailingPostalCode: c.mailing_postal_code,
    stateLicenses: c.state_licenses,
    preferredStates: c.preferred_states,
    positionTypes: c.position_types,
    cvUploaded: c.cv_uploaded,
    cvFilename: c.cv_filename,
    cvBytesLen: c.cv_bytes_len,
    dedupStatus: c.dedup_status,
    dedupReason: c.dedup_reason,
    sfContactId: c.sf_contact_id,
    matchCount: c.match_count,
    addedAt: c.first_seen_at,
    lastReviewedOn: c.last_reviewed_on,
    quotaBlocked: c.quota_blocked,
    blockedThisRun: c.blocked_this_run,
    openedThisRun: c.opened_this_run,
    createdThisRun: c.created_this_run,
    matchedThisRun: c.matched_this_run,
  }))
  return { events, candidates }
}

/** Search the latest candidate state across all runs — for "find the right person" by name,
 *  DJC link/id, or specialty. */
export async function searchDjcCandidates(opts: { q?: string; specialty?: string; limit?: number }): Promise<DjcCandidateRow[]> {
  const sql = djcSql
  if (!sql) return []
  const q = (opts.q ?? '').trim()
  const specialty = (opts.specialty ?? '').trim()
  const like = q ? `%${q}%` : ''
  const rows = await sql<DjcCandidateColumns[]>`
    select candidate_id, profile_url, name, target, phone, email, contact_source,
           mailing_city, mailing_state, mailing_postal_code, state_licenses, preferred_states,
           position_types, cv_uploaded, cv_filename, cv_bytes_len, dedup_status, dedup_reason,
           sf_contact_id, match_count, first_seen_at, last_reviewed_on
    from djc_candidates
    where ${q ? sql`(name ilike ${like} or candidate_id ilike ${like} or profile_url ilike ${like})` : sql`true`}
      and ${specialty ? sql`target = ${specialty}` : sql`true`}
    order by updated_at desc
    limit ${opts.limit ?? 60}
  `
  return rows.map(toCandidateRow)
}

interface DjcCandidateColumns {
  candidate_id: string
  profile_url: string | null
  name: string | null
  target: string | null
  phone: string | null
  email: string | null
  contact_source: string | null
  mailing_city: string | null
  mailing_state: string | null
  mailing_postal_code: string | null
  state_licenses: string | null
  preferred_states: string | null
  position_types: string | null
  cv_uploaded: boolean
  cv_filename: string | null
  cv_bytes_len: number | null
  dedup_status: string | null
  dedup_reason: string | null
  sf_contact_id: string | null
  match_count: number | null
  first_seen_at: string | null
  last_reviewed_on: string | null
}

function toCandidateRow(c: DjcCandidateColumns): DjcCandidateRow {
  return {
    candidateId: c.candidate_id,
    profileUrl: c.profile_url,
    name: c.name,
    target: c.target,
    phone: c.phone,
    email: c.email,
    contactSource: c.contact_source,
    mailingCity: c.mailing_city,
    mailingState: c.mailing_state,
    mailingPostalCode: c.mailing_postal_code,
    stateLicenses: c.state_licenses,
    preferredStates: c.preferred_states,
    positionTypes: c.position_types,
    cvUploaded: c.cv_uploaded,
    cvFilename: c.cv_filename,
    cvBytesLen: c.cv_bytes_len,
    dedupStatus: c.dedup_status,
    dedupReason: c.dedup_reason,
    sfContactId: c.sf_contact_id,
    matchCount: c.match_count,
    addedAt: c.first_seen_at,
    lastReviewedOn: c.last_reviewed_on,
  }
}


/** Latest DJC Profile Views budget snapshot (view-free read logged by the automation each run). */
export async function getDjcProfileViews(): Promise<DjcProfileViews | null> {
  const sql = djcSql
  if (!sql) return null
  const rows = await sql<{ payload: { used: number; total: number; remaining: number; addon_active?: boolean }; created_at: string }[]>`
    select payload, created_at
    from djc_event_log
    where event_type = 'profile_views_snapshot'
    order by id desc
    limit 1
  `
  if (!rows.length || !rows[0].payload) return null
  const p = rows[0].payload
  // An add-on pack pushes `used` past the base allowance (DJC shows 760/750 rather than raising
  // the total), so "0 left" is wrong whenever a pack is carrying the account.
  return {
    used: p.used, total: p.total, remaining: p.remaining,
    addonActive: p.addon_active ?? p.used > p.total,
    checkedAt: rows[0].created_at,
  }
}

export interface DjcViewYieldMonth {
  month: string       // YYYY-MM
  views: number       // profile views the automation spent
  created: number     // Salesforce contacts it created from them
  pct: number         // created per 100 views
}

/**
 * What each month's Profile Views bought, in Salesforce contacts per 100 views.
 *
 * Views are the automation's own spend (profiles opened, less the ones the quota wall blocked
 * before anything was learned), not DJC's counter — the counter also moves for anyone browsing on
 * the shared login, which would make the yield look worse than the automation's actual work.
 */
export async function getDjcViewYield(months = 6): Promise<DjcViewYieldMonth[]> {
  const sql = djcSql
  if (!sql) return []
  const rows = await sql<{ month: string; views: number; created: number }[]>`
    with viewed as (
      -- One row per profile we actually paid to open, tagged with the month we opened it.
      select distinct e.candidate_id,
             to_char(date_trunc('month', e.created_at at time zone 'America/New_York'), 'YYYY-MM') as month
      from djc_event_log e
      where e.event_type = 'profile_scraped'
        and e.created_at >= date_trunc('month', now()) - make_interval(months => ${months - 1})
        and not exists (
          select 1 from djc_event_log b
          where b.run_id = e.run_id and b.candidate_id = e.candidate_id
            and b.event_type = 'profile_view_quota_blocked')
    )
    select v.month,
           count(*)::int as views,
           count(*) filter (where exists (
             select 1 from djc_event_log c
             where c.candidate_id = v.candidate_id and c.event_type = 'contact_created'))::int as created
    from viewed v
    group by 1`
  return rows
    .filter(r => r.views > 0)
    .map(r => ({ month: r.month, views: r.views, created: r.created,
      pct: Math.round((r.created / r.views) * 1000) / 10 }))
}

/**
 * Every candidate the Profile Views quota ever blocked, one row each — NOT a sum of per-run event
 * counts. The old banner summed `quota_blocked` across recent runs, so a candidate blocked in six
 * runs counted six times and the window silently truncated older ones; that is why it read "46"
 * against 90 real candidates.
 *
 * `displayName` picks whichever of `name` / `card_name` is actually a REAL name (two-plus tokens),
 * preferring the profile name. Both can be DJC's masked "A.b." placeholder: DJC hides the name until
 * a view is spent on that candidate IN THE CURRENT quota cycle, and the monthly refill re-masks
 * everyone — so the search card is masked for ~90% of candidates we have never opened. Coalescing
 * card_name first was wrong: it overwrote a genuine résumé-derived name with the card's initials.
 * `nameMasked` marks rows where neither source has a real name, so the UI says "can't tell" rather
 * than implying a decision we cannot make without paying.
 *
 * `resolution` is deliberately conservative and DB-only — the hub is read-only over Supabase and
 * cannot query Salesforce:
 *   already_in_sf — matched to a Salesforce contact for free (profile link); no view needed
 *   needs_view    — still listed, not matched. A view IS required: these candidates were never
 *                   checked at all. Their profile scraped, but the Profile Views wall blocked the
 *                   contact reveal, so contact_source='none' is a quota artifact, not a finding.
 *   gone          — no longer on the list; a view can't be spent even if we wanted to
 *
 * There is deliberately no "undetermined" bucket any more. It split needs_view by whether we could
 * read the candidate's name, which conflated two different questions: "is this person already in
 * Salesforce?" (mostly unanswerable for free — DJC paywalls every identifying field) and "would a
 * view produce contact info?" (the actual decision). A masked name doesn't make a view less needed,
 * so counting those separately understated real demand.
 */
export async function getDjcQuotaBlocked(): Promise<DjcQuotaBlockedRow[]> {
  const sql = djcSql
  if (!sql) return []
  const rows = await sql<
    {
      candidate_id: string
      display_name: string | null
      name_masked: boolean
      target: string | null
      profile_url: string | null
      sf_contact_id: string | null
      first_blocked: string
      last_blocked: string
      block_count: number
      still_listed: boolean
      card_location: string | null
      registered_on: string | null
      degrees: string | null
      last_activity: string | null
      contact_source: string | null
      view_blocked: boolean
    }[]
  >`
    with blocked as (
      select candidate_id,
             min(created_at) as first_blocked,
             max(created_at) as last_blocked,
             count(*)::int   as block_count
      from djc_event_log
      where event_type = 'profile_view_quota_blocked' and candidate_id is not null
      group by candidate_id
    ),
    latest_scan as (
      select distinct candidate_id
      from djc_candidate_sightings
      where seen_on = (select max(seen_on) from djc_candidate_sightings)
    )
    select b.candidate_id,
           coalesce(
             case when array_length(regexp_split_to_array(trim(coalesce(c.name, '')), '\\s+'), 1) >= 2
                  then c.name end,
             case when array_length(regexp_split_to_array(trim(coalesce(c.card_name, '')), '\\s+'), 1) >= 2
                  then c.card_name end,
             c.card_name, c.name)                                          as display_name,
           (coalesce(array_length(regexp_split_to_array(trim(coalesce(c.name, '')), '\\s+'), 1), 0) < 2
            and coalesce(array_length(regexp_split_to_array(trim(coalesce(c.card_name, '')), '\\s+'), 1), 0) < 2)
                                                                           as name_masked,
           c.target, c.profile_url, c.sf_contact_id,
           c.card_location, c.registered_on, c.degrees, c.last_activity,
           c.contact_source, coalesce(c.view_blocked, false) as view_blocked,
           b.first_blocked, b.last_blocked, b.block_count,
           (b.candidate_id in (select candidate_id from latest_scan))      as still_listed
    from blocked b
    left join djc_candidates c using (candidate_id)
    order by (c.sf_contact_id is not null), b.last_blocked desc
  `
  return rows.map(r => ({
    candidateId: r.candidate_id,
    displayName: r.display_name,
    nameMasked: r.name_masked,
    target: r.target,
    profileUrl: r.profile_url,
    sfContactId: r.sf_contact_id,
    firstBlocked: r.first_blocked,
    lastBlocked: r.last_blocked,
    blockCount: r.block_count,
    stillListed: r.still_listed,
    cardLocation: r.card_location,
    registeredOn: r.registered_on,
    degrees: r.degrees,
    lastActivity: r.last_activity,
    // A candidate who was LATER opened successfully has been checked — an empty result is a
    // finding, not pending work. Only those never actually checked still need a view. Treating
    // "no contact_source" as "needs a view" is the same conflation that has misreported this
    // number all day, just one layer up.
    resolution: r.sf_contact_id
      ? 'already_in_sf'
      : !r.still_listed
        ? 'gone'
        : (r.contact_source && !r.view_blocked)
          ? 'checked_empty'
          : 'needs_view',
  }))
}

/**
 * Daily Profile Views spent vs Salesforce contacts created — the efficiency trend.
 *
 * A "view spent" is a profile we actually opened. Candidates matched by profile link or the name
 * pre-check are decided from free list data, and quota-blocked ones were walled off before the
 * reveal — none of those cost a view, so counting them would understate how well each view is
 * being used. This is derived from the event log rather than contact_source, which cannot tell
 * "checked and empty" from "never allowed to check".
 */
export async function getDjcViewEfficiency(days = 30): Promise<DjcViewEfficiencyDay[]> {
  const sql = djcSql
  if (!sql) return []
  const rows = await sql<{ day: string; views: number; created: number; free: number }[]>`
    with ev as (
      -- Scheduled runs only, matching the weekly chart: backfills and manual pulls are catch-up
      -- work, not the automation's own behaviour.
      select (e.created_at at time zone 'America/New_York')::date as day, e.event_type, e.candidate_id
      from djc_event_log e
      join djc_runs r on r.id = e.run_id and r.trigger = 'scheduled'
      where e.created_at >= now() - (${days} || ' days')::interval
        and e.event_type in ('profile_scraped', 'contact_created', 'dedup_match',
                             'profile_view_quota_blocked')
    )
    select to_char(day, 'YYYY-MM-DD') as day,
           -- Count EVENTS, not people. A blocked attempt logs profile_scraped AND
           -- profile_view_quota_blocked; a successful open logs only profile_scraped. So
           -- scraped - blocked is exactly the number of views charged. Excluding any candidate who
           -- was ever blocked that day (the previous approach) dropped people who were blocked in
           -- the morning and opened successfully after a top-up — they were counted as candidates
           -- added but not as views spent, which is how a 107% day appeared.
           (count(*) filter (where event_type = 'profile_scraped')
            - count(*) filter (where event_type = 'profile_view_quota_blocked'))::int as views,
           count(*) filter (where event_type = 'contact_created')::int as created,
           count(distinct candidate_id) filter (where event_type = 'dedup_match')::int as free
    from ev group by day order by day
  `
  return rows.map(r => ({ day: r.day, views: r.views, created: r.created, freeSkips: r.free }))
}

/**
 * Weekly Profile View conversion: of the views we PAID for, how many became a Salesforce contact.
 *
 * This is the headline efficiency number — the daily series is too noisy to read a trend from
 * (some days have three views). Weekly buckets make improvement legible.
 *
 * A view counts only when a profile was actually opened. Candidates resolved by the free checks
 * never cost anything, so including them would flatter the rate; candidates blocked by the quota
 * wall never got opened at all, so counting them would depress it.
 */
export async function getDjcViewEfficiencyWeekly(weeks = 12): Promise<DjcViewEfficiencyWeek[]> {
  const sql = djcSql
  if (!sql) return []
  const rows = await sql<{ week: string; views: number; created: number; free: number }[]>`
    with ev as (
      -- Scheduled runs only. Backfills, manual pulls and tests were one-off catch-up work with a
      -- completely different hit rate, and mixing them in made the automation's own trend
      -- unreadable — the Jun 22 spike was a backfill, not the automation.
      select date_trunc('week', e.created_at at time zone 'America/New_York')::date as week,
             e.event_type, e.candidate_id
      from djc_event_log e
      join djc_runs r on r.id = e.run_id and r.trigger = 'scheduled'
      where e.created_at >= now() - (${weeks} || ' weeks')::interval
        and e.event_type in ('profile_scraped', 'contact_created', 'profile_view_quota_blocked',
                             'dedup_match')
    )
    select to_char(week, 'YYYY-MM-DD') as week,
           -- See the daily query: events, not people, so a blocked-then-opened candidate is counted
           -- once as a view rather than dropped from the denominator.
           (count(*) filter (where event_type = 'profile_scraped')
            - count(*) filter (where event_type = 'profile_view_quota_blocked'))::int as views,
           count(*) filter (where event_type = 'contact_created')::int as created,
           count(distinct candidate_id) filter (where event_type = 'dedup_match')::int as free
    from ev group by week order by week
  `
  return rows.map(r => ({
    week: r.week,
    views: r.views,
    created: r.created,
    freeSkips: r.free,
    rate: r.views > 0 ? Math.round((r.created / r.views) * 100) : 0,
  }))
}

export async function getDjcSummary(): Promise<DjcSummary> {
  const sql = djcSql
  const zero = { totalRuns: 0, candidatesSeen: 0, contactable: 0, duplicates: 0, wouldCreate: 0, created: 0, errors: 0 }
  if (!sql) {
    return { ...zero, last7: { ...zero }, lastRunAt: null }
  }
  const f = `filter (where started_at >= now() - interval '7 days')`
  const [r] = await sql<Record<string, number | string | null>[]>`
    select count(*)::int                                       as total_runs,
           count(*) ${sql.unsafe(f)}::int                      as total_runs_7,
           coalesce(sum(candidates_seen),0)::int               as candidates_seen,
           coalesce(sum(candidates_seen) ${sql.unsafe(f)},0)::int as candidates_seen_7,
           coalesce(sum(contactable),0)::int                   as contactable,
           coalesce(sum(contactable) ${sql.unsafe(f)},0)::int  as contactable_7,
           coalesce(sum(duplicates),0)::int                    as duplicates,
           coalesce(sum(duplicates) ${sql.unsafe(f)},0)::int   as duplicates_7,
           coalesce(sum(create_skipped_guard),0)::int          as would_create,
           coalesce(sum(create_skipped_guard) ${sql.unsafe(f)},0)::int as would_create_7,
           coalesce(sum(created),0)::int                       as created,
           coalesce(sum(created) ${sql.unsafe(f)},0)::int      as created_7,
           coalesce(sum(errors),0)::int                        as errors,
           coalesce(sum(errors) ${sql.unsafe(f)},0)::int       as errors_7,
           max(started_at)                                     as last_run_at
    from djc_runs
  `
  const num = (k: string) => Number(r[k] ?? 0)
  return {
    totalRuns: num('total_runs'),
    candidatesSeen: num('candidates_seen'),
    contactable: num('contactable'),
    duplicates: num('duplicates'),
    wouldCreate: num('would_create'),
    created: num('created'),
    errors: num('errors'),
    last7: {
      totalRuns: num('total_runs_7'),
      candidatesSeen: num('candidates_seen_7'),
      contactable: num('contactable_7'),
      duplicates: num('duplicates_7'),
      wouldCreate: num('would_create_7'),
      created: num('created_7'),
      errors: num('errors_7'),
    },
    lastRunAt: (r.last_run_at as string | null) ?? null,
  }
}
