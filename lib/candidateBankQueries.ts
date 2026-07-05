import cbSql from './candidateBankDb'
import type {
  CandidateBankKpis,
  CandidateBankTargetRow,
  CandidateBankRun,
  CandidateBankBundle,
} from './candidateBankTypes'

/** Roll-up KPIs across the whole candidate bank (+ a 7-day new-arrivals slice). */
export async function getCandidateBankKpis(): Promise<CandidateBankKpis> {
  const sql = cbSql
  if (!sql) throw new Error('candidate bank not configured')
  const [r] = await sql<
    {
      total_candidates: number
      with_resume: number
      with_email: number
      with_phone: number
      with_license: number
      targets: number
      resume_bytes: string
      last_scraped: string | null
      new_candidates_7d: number
      new_resumes_7d: number
      new_email_7d: number
      new_phone_7d: number
    }[]
  >`
    select
      count(*)::int                                                         as total_candidates,
      count(resume_file_path)::int                                          as with_resume,
      count(primary_email)::int                                             as with_email,
      count(primary_phone)::int                                             as with_phone,
      count(*) filter (where cardinality(state_licenses) > 0)::int          as with_license,
      count(distinct scrape_target)::int                                    as targets,
      coalesce(sum(resume_file_size),0)::bigint                             as resume_bytes,
      max(last_scraped_at)                                                  as last_scraped,
      count(*) filter (where first_seen_at >= now() - interval '7 days')::int              as new_candidates_7d,
      count(resume_file_path) filter (where first_seen_at >= now() - interval '7 days')::int as new_resumes_7d,
      count(primary_email) filter (where first_seen_at >= now() - interval '7 days')::int   as new_email_7d,
      count(primary_phone) filter (where first_seen_at >= now() - interval '7 days')::int    as new_phone_7d
    from sourced_candidates
  `
  return {
    totalCandidates: r.total_candidates,
    withResume: r.with_resume,
    withEmail: r.with_email,
    withPhone: r.with_phone,
    withLicense: r.with_license,
    targets: r.targets,
    resumeBytes: Number(r.resume_bytes),
    lastScraped: r.last_scraped,
    newCandidates7d: r.new_candidates_7d,
    newResumes7d: r.new_resumes_7d,
    newEmail7d: r.new_email_7d,
    newPhone7d: r.new_phone_7d,
  }
}

/** Candidate counts per scrape target (specialty/role). */
export async function getCandidateBankByTarget(): Promise<CandidateBankTargetRow[]> {
  const sql = cbSql
  if (!sql) return []
  const rows = await sql<{ target: string | null; n: number; with_resume: number }[]>`
    select coalesce(scrape_target, '(unknown)') as target,
           count(*)::int                        as n,
           count(resume_file_path)::int         as with_resume
    from sourced_candidates
    group by scrape_target
    order by n desc
  `
  return rows.map(r => ({ target: r.target ?? '(unknown)', count: r.n, withResume: r.with_resume }))
}

/** Most recent scrape runs (lifecycle + rollup counts). */
export async function getCandidateBankRuns(limit = 15): Promise<CandidateBankRun[]> {
  const sql = cbSql
  if (!sql) return []
  const rows = await sql<
    {
      id: number
      mode: string
      status: CandidateBankRun['status']
      candidates_seen: number
      stored: number
      updated: number
      resumes_stored: number
      errors: number
      started_at: string
      finished_at: string | null
    }[]
  >`
    select id, mode, status, candidates_seen, stored, updated, resumes_stored, errors,
           started_at, finished_at
    from sourced_scrape_runs
    order by id desc
    limit ${limit}
  `
  return rows.map(r => ({
    id: r.id,
    mode: r.mode,
    status: r.status,
    candidatesSeen: r.candidates_seen,
    stored: r.stored,
    updated: r.updated,
    resumesStored: r.resumes_stored,
    errors: r.errors,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  }))
}

export async function getCandidateBankBundle(): Promise<CandidateBankBundle> {
  const [kpis, byTarget, runs] = await Promise.all([
    getCandidateBankKpis(),
    getCandidateBankByTarget(),
    getCandidateBankRuns(15),
  ])
  return { kpis, byTarget, runs }
}
