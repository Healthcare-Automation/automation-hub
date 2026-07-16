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
        select to_char(started_at::date, 'YYYY-MM-DD')                       as day,
               count(*)::int                                                 as total_runs,
               count(*) filter (where finished_at is not null)::int          as completed_runs,
               count(*) filter (where status in ('error','session_expired'))::int as error_runs,
               coalesce(sum(candidates_seen),0)::int                         as candidates_seen,
               coalesce(sum(candidates_selected),0)::int                     as candidates_selected,
               coalesce(sum(contactable),0)::int                             as contactable,
               coalesce(sum(duplicates),0)::int                              as duplicates,
               coalesce(sum(created),0)::int                                 as created,
               coalesce(sum(create_skipped_guard),0)::int                    as create_skipped_guard,
               coalesce(sum(errors),0)::int                                  as errors,
               array_agg(to_char(started_at, 'HH24:MI') || ' — ' || replace(status, '_', ' ')
                         order by started_at)
                 filter (where status in ('error','session_expired'))        as error_run_details
        from djc_runs
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
          errors: r.errors,
          candidatesSelected: r.candidates_selected,
        }),
      })
    }
  }
  return out
}

export async function getDjcRecentRuns(limit = 20): Promise<DjcRunDetail[]> {
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
    }[]
  >`
    select r.id,
           r.started_at,
           r.finished_at,
           extract(epoch from (r.finished_at - r.started_at))::int as duration_seconds,
           r.status, r.trigger, r.write_mode, r.targets,
           r.targets_processed, r.candidates_seen, r.candidates_selected, r.contactable,
           r.uncontactable, r.duplicates, r.created, r.create_skipped_guard, r.errors,
           (select count(*) from djc_event_log e where e.run_id = r.id and e.level = 'warn')::int  as warn_count,
           (select count(*) from djc_event_log e where e.run_id = r.id and e.level = 'error')::int as error_count,
           (select count(*) from djc_event_log e where e.run_id = r.id
              and e.event_type = 'profile_view_quota_blocked')::int as quota_blocked
    from djc_runs r
    where r.trigger in ('scheduled', 'backfill')
    order by r.id desc
    limit ${limit}
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
    quotaBlocked: r.quota_blocked,
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
        candidate_id: string | null
        event_type: string
        stage: string | null
        level: DjcEventLevel
        message: string | null
        payload: Record<string, unknown> | null
        created_at: string
      }[]
    >`
      select id, candidate_id, event_type, stage, level, message, payload, created_at
      from djc_event_log
      where candidate_id in (select candidate_id from djc_candidates
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
      }[]
    >`
      select candidate_id, profile_url, name, target, phone, email, contact_source,
             mailing_city, mailing_state, mailing_postal_code, state_licenses, preferred_states,
             position_types, cv_uploaded, cv_filename, cv_bytes_len, dedup_status, dedup_reason,
             sf_contact_id, match_count, first_seen_at, last_reviewed_on
      from djc_candidates where first_seen_run = ${runId} or last_seen_run = ${runId}
      order by updated_at desc
    `,
  ])

  const events: DjcEvent[] = eventRows.map(e => ({
    id: e.id,
    candidateId: e.candidate_id,
    eventType: e.event_type,
    stage: e.stage,
    level: e.level,
    message: e.message,
    payload: e.payload,
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
  const rows = await sql<{ payload: { used: number; total: number; remaining: number }; created_at: string }[]>`
    select payload, created_at
    from djc_event_log
    where event_type = 'profile_views_snapshot'
    order by id desc
    limit 1
  `
  if (!rows.length || !rows[0].payload) return null
  const p = rows[0].payload
  return { used: p.used, total: p.total, remaining: p.remaining, checkedAt: rows[0].created_at }
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
