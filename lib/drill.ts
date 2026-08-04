import djcSql from './djcDb'

/**
 * Raw rows behind every card on the client report, in one generic shape the side panel renders.
 *
 * Each drill kind formats its rows for its own context — an open job leads with how long it has
 * been waiting, a placement leads with who and when, a candidate leads with freshness — so the
 * panel never shows the same boilerplate for different questions.
 */
export interface DrillRow {
  sfId: string | null          // Salesforce record id — rows without one render unlinked
  title: string
  badge: string | null
  badgeTone: 'open' | 'good' | 'warn' | 'muted' | 'accent'
  sub: string                  // one line of identity: who/where/what
  metaLead: string | null      // the emphasised context-specific fact
  leadTone: 'good' | 'warn' | 'info' | 'muted'
  meta: string                 // the supporting facts
}

export interface DrillStat {
  label: string
  value: string
  tone: 'good' | 'warn' | 'info' | 'muted'
}

export interface DrillResult {
  rows: DrillRow[]
  stats: DrillStat[]           // summary tiles tailored to what was clicked
}

export interface DrillParams {
  kind: 'jobs' | 'placements' | 'candidates' | 'applications' | 'locations'
  // jobs
  open?: boolean
  filled?: boolean
  unfilled?: boolean   // closed without a fill
  ytd?: boolean
  state?: string
  specialty?: string
  month?: string
  fromMonth?: string
  toMonth?: string
  fromDate?: string
  toDate?: string
  sinceDays?: number
  cityState?: string
  ageBand?: string
  durationBand?: string
  // candidates
  outcome?: 'added' | 'already' | 'noContact'
  /** A step on the outreach ladder — each one is a subset of the step above it. */
  reach?: 'added' | 'contacted' | 'read' | 'spoke' | 'forwarded'
  /** People reached on a specific channel. */
  channel?: 'text' | 'email' | 'call'
  /**
   * Which date a from/to window filters on. 'seen' = when the candidate first surfaced in a list
   * scan (what the monthly sourcing chart counts). 'event' = when the outcome itself was logged
   * (what the view-cycle bars count). They differ for 121 candidates — surfaced one day, created
   * another — so a panel opened from a cycle bar has to use the bar's own basis or the totals
   * disagree.
   */
  basis?: 'seen' | 'event'
  /** Candidates whose DJC account was created in this month (YYYY-MM). */
  registeredMonth?: string
  /** Restrict to specific DJC scrape targets, comma-separated. */
  targets?: string
  from?: string
  to?: string
  activeState?: string
  active?: boolean
  // placements
  client?: string
  /** This year AND last year, both cut at today's day-of-year — what the two-year tables compare. */
  ytdPair?: boolean
  // applications
  stage?: 'all' | 'submitted' | 'placed'
}

const LIMIT = 300

const iso = (d: unknown): string =>
  d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)

const plural = (n: number, w: string) =>
  `${n} ${w}${n === 1 ? '' : /(s|x|z|ch|sh)$/.test(w) ? 'es' : 's'}`

/* ── jobs ─────────────────────────────────────────────────────────────────── */

async function jobRows(f: DrillParams): Promise<DrillResult> {
  const sql = djcSql
  if (!sql) return { rows: [], stats: [] }
  const ageOrd: Record<string, number> = {
    'Under a week': 0, '1-4 weeks': 1, '1-3 months': 2, 'Over 3 months': 3,
  }
  const durOrd: Record<string, number> = {
    'Under a day': 0, '1-7 days': 1, '8-30 days': 2, '1-3 months': 3, 'Over 3 months': 4,
  }
  const age = f.ageBand !== undefined ? ageOrd[f.ageBand] : undefined
  const dur = f.ageBand === undefined && f.durationBand !== undefined ? durOrd[f.durationBand] : undefined

  const rows = await sql<
    { job_sf_id: string; job_name: string | null; practice: string | null; city_state: string | null;
      specialty: string | null; open_date: string | null; days_open: number | null; status: string | null;
      filled: boolean; applications: number | null; submittals: number | null }[]
  >`
    select job_sf_id, job_name, practice, city_state, specialty, open_date, days_open, status,
           filled, applications, submittals
    from djc_jobs
    where true
      ${f.open ? sql`and status = 'Open'` : sql``}
      ${f.filled ? sql`and filled` : sql``}
      ${f.unfilled ? sql`and status <> 'Open' and not filled` : sql``}
      ${f.ytd ? sql`and extract(year from open_date) = extract(year from now())` : sql``}
      ${f.state ? sql`and coalesce(nullif(state, ''), 'Unknown') = ${f.state}` : sql``}
      ${f.specialty ? sql`and coalesce(specialty, 'Unknown') = ${f.specialty}` : sql``}
      ${f.month ? sql`and to_char(date_trunc('month', open_date), 'YYYY-MM') = ${f.month}` : sql``}
      ${f.fromMonth ? sql`and to_char(date_trunc('month', open_date), 'YYYY-MM') >= ${f.fromMonth}` : sql``}
      ${f.toMonth ? sql`and to_char(date_trunc('month', open_date), 'YYYY-MM') <= ${f.toMonth}` : sql``}
      ${f.fromDate ? sql`and open_date >= ${f.fromDate}::date` : sql``}
      ${f.toDate ? sql`and open_date < (${f.toDate}::date + 1)` : sql``}
      ${f.sinceDays ? sql`and open_date >= current_date - ${f.sinceDays}::int` : sql``}
      ${f.cityState ? sql`and city_state = ${f.cityState}` : sql``}
      ${age !== undefined ? sql`and days_open is not null and
        (case when days_open <= 7 then 0 when days_open <= 30 then 1
              when days_open <= 90 then 2 else 3 end) = ${age}` : sql``}
      ${dur !== undefined ? sql`and days_open is not null and
        (case when days_open < 1 then 0 when days_open <= 7 then 1
              when days_open <= 30 then 2 when days_open <= 90 then 3 else 4 end) = ${dur}` : sql``}
    order by ${f.open ? sql`days_open desc nulls last` : sql`open_date desc nulls last`}
    limit ${LIMIT}
  `
  const out = rows.map(r => {
    const days = r.days_open === null ? null : Math.round(Number(r.days_open))
    const opened = r.open_date === null ? null : iso(r.open_date)
    const apps = r.applications ?? 0
    const subs = r.submittals ?? 0
    const activity = [apps > 0 && plural(apps, 'application'), subs > 0 && plural(subs, 'submittal')]
      .filter(Boolean).join(' · ') || 'no applications yet'

    // Context decides what leads: an open job leads with its age, a closed one with how it ended.
    let metaLead: string | null
    let leadTone: DrillRow['leadTone']
    let meta: string
    if (f.open || f.ageBand) {
      metaLead = days !== null ? `waiting ${days} days` : null
      leadTone = days !== null && days > 90 ? 'warn' : 'info'
      meta = [opened && `opened ${opened}`, activity].filter(Boolean).join(' · ')
    } else if (f.durationBand) {
      metaLead = days !== null
        ? r.status === 'Open' ? `still open after ${days} days`
          : r.filled ? `filled after ${days} days` : `closed unfilled after ${days} days`
        : null
      leadTone = r.filled ? 'good' : r.status === 'Open' ? 'warn' : 'muted'
      meta = [opened && `opened ${opened}`, activity].filter(Boolean).join(' · ')
    } else {
      metaLead = r.filled ? 'filled' : r.status === 'Open' ? `still open — ${days ?? '?'} days` : 'closed unfilled'
      leadTone = r.filled ? 'good' : r.status === 'Open' ? 'warn' : 'muted'
      meta = [opened && `opened ${opened}`, activity].filter(Boolean).join(' · ')
    }
    return {
      sfId: r.job_sf_id,
      title: r.job_name ?? 'Untitled job',
      badge: f.open ? 'Open' : r.filled ? 'Filled' : r.status ?? null,
      badgeTone: (f.open ? 'open' : r.filled ? 'good' : r.status === 'Open' ? 'open' : 'muted') as DrillRow['badgeTone'],
      sub: [r.practice, r.city_state, r.specialty].filter(Boolean).join(' · ') || '—',
      metaLead,
      leadTone,
      meta,
    }
  })

  // Summary tiles from the full slice (not the 300-row page).
  const n = rows.length
  const filled = rows.filter(r => r.filled).length
  const stale = rows.filter(r => Number(r.days_open ?? 0) > 90).length
  const daysList = rows.map(r => Number(r.days_open)).filter(d => !Number.isNaN(d)).sort((a, b) => a - b)
  const median = daysList.length ? Math.round(daysList[Math.floor(daysList.length / 2)]) : null
  const stats: DrillStat[] = f.open || f.ageBand
    ? [
        { label: 'open jobs', value: String(n), tone: 'info' },
        { label: 'waiting over 3 months', value: String(stale), tone: stale > 0 ? 'warn' : 'muted' },
        ...(median !== null ? [{ label: 'median days waiting', value: String(median), tone: 'muted' as const }] : []),
        { label: 'with a submittal', value: String(rows.filter(r => (r.submittals ?? 0) > 0).length), tone: 'good' },
      ]
    : [
        { label: 'jobs', value: String(n), tone: 'info' },
        { label: `filled — ${n ? Math.round((filled / n) * 100) : 0}% of them`, value: String(filled), tone: filled > 0 ? 'good' : 'muted' },
        { label: 'still open', value: String(rows.filter(r => r.status === 'Open').length), tone: 'warn' },
        ...(median !== null ? [{ label: 'median days open', value: String(median), tone: 'muted' as const }] : []),
      ]
  return { rows: out, stats }
}

/* ── placements ───────────────────────────────────────────────────────────── */

async function placementRows(f: DrillParams): Promise<DrillResult> {
  const sql = djcSql
  if (!sql) return { rows: [], stats: [] }
  const rows = await sql<
    { sf_id: string; placed_on: string | null; start_on: string | null; person_sf_id: string | null;
      person_name: string | null; job_name: string | null; job_state: string | null;
      job_specialty: string | null; client: string | null; candidate_source: string | null }[]
  >`
    select sf_id, placed_on, start_on, person_sf_id, person_name, job_name, job_state, job_specialty,
           client, candidate_source
    from sf_placements
    where not is_extension
      ${f.ytd ? sql`and extract(year from placed_on) = extract(year from now())
        and extract(doy from placed_on) <= extract(doy from now())` : sql``}
      ${f.ytdPair ? sql`and extract(year from placed_on)
          in (extract(year from now()), extract(year from now()) - 1)
        and extract(doy from placed_on) <= extract(doy from now())` : sql``}
      ${f.month ? sql`and to_char(date_trunc('month', placed_on), 'YYYY-MM') = ${f.month}
        and placed_on <= current_date` : sql``}
      ${f.fromMonth ? sql`and to_char(date_trunc('month', placed_on), 'YYYY-MM') >= ${f.fromMonth}` : sql``}
      ${f.toMonth ? sql`and to_char(date_trunc('month', placed_on), 'YYYY-MM') <= ${f.toMonth}
        and placed_on <= current_date` : sql``}
      ${f.state ? sql`and coalesce(job_state, 'Unknown') = ${f.state}` : sql``}
      ${f.client ? sql`and coalesce(client, 'Unknown') = ${f.client}` : sql``}
    order by placed_on desc nulls last
    limit ${LIMIT}
  `
  const today = new Date().toISOString().slice(0, 10)
  const out = rows.map(r => {
    const placed = r.placed_on === null ? null : iso(r.placed_on)
    const start = r.start_on === null ? null : iso(r.start_on)
    const src = r.candidate_source && r.candidate_source !== 'Not recorded'
      ? `sourced via ${r.candidate_source.replaceAll('_', ' ')}` : null
    return {
      sfId: r.person_sf_id,
      title: r.person_name ?? 'Unnamed candidate',
      badge: r.job_specialty,
      badgeTone: 'muted' as const,
      sub: [r.client, r.job_state].filter(Boolean).join(' · ') || '—',
      metaLead: placed ? `placed ${placed}` : null,
      leadTone: 'good' as DrillRow['leadTone'],
      meta: [r.job_name, start && start > today ? `starts ${start}` : null, src]
        .filter(Boolean).join(' · '),
    }
  })

  const top = (vals: (string | null)[]) => {
    const counts = new Map<string, number>()
    for (const v of vals) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  }
  const stats: DrillStat[] = [{ label: 'placements', value: String(rows.length), tone: 'good' }]
  // For a state/client slice, show the year split so the card's this-year number ties visibly.
  if ((f.state || f.client) && !f.ytd) {
    // "so far": placements recorded up to today, matching how the table's this-year column counts.
    const y = new Date().getUTCFullYear()
    const inYear = (yy: number) => rows.filter(r => r.placed_on
      && iso(r.placed_on).startsWith(String(yy)) && iso(r.placed_on) <= today).length
    stats.push({ label: `placed ${y} so far`, value: String(inYear(y)), tone: 'good' })
    stats.push({ label: `placed ${y - 1}`, value: String(inYear(y - 1)), tone: 'muted' })
  }
  const upcoming = rows.filter(r => r.start_on && iso(r.start_on) > today).length
  if (upcoming > 0) stats.push({ label: 'yet to start', value: String(upcoming), tone: 'info' })
  const topClient = !f.client && top(rows.map(r => r.client))
  if (topClient) stats.push({ label: `top client — ${topClient[0].split(' ').slice(0, 2).join(' ')}`,
    value: String(topClient[1]), tone: 'muted' })
  const topState = !f.state && f.client && top(rows.map(r => r.job_state))
  if (topState) stats.push({ label: `top state — ${topState[0]}`, value: String(topState[1]), tone: 'muted' })
  const djc = rows.filter(r => r.candidate_source === 'Dentist_Job_Cafe' || r.candidate_source === 'Dentist Job Cafe').length
  if (djc > 0) stats.push({ label: 'sourced via DJC', value: String(djc), tone: 'info' })
  return { rows: out, stats: stats.slice(0, 4) }
}

/* ── candidates ───────────────────────────────────────────────────────────── */

const ACTIVE_DATE = `case when c.last_activity ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$'
  then to_date(c.last_activity, 'FMMM/FMDD/FMYY') end`

/** The event that marks each outcome, so a cycle window can filter on the same thing it counts. */
const eventFor = (outcome: DrillParams['outcome']): string =>
  outcome === 'already' ? 'dedup_match'
    : outcome === 'noContact' ? 'candidate_uncontactable'
    : 'contact_created'

async function candidateRows(f: DrillParams): Promise<DrillResult> {
  const sql = djcSql
  if (!sql) return { rows: [], stats: [] }

  // With an event basis the event IS the definition: a contact created inside the window belongs
  // in that window's panel even if a later recheck reclassified the row (3 did last cycle, caught
  // by Salesforce's own duplicate rule after the fact). Filtering on current status as well made
  // the panel disagree with the bar it was opened from.
  const outcomeWhere = f.basis === 'event' ? sql``
    : f.outcome === 'added' ? sql`and c.dedup_status = 'new' and c.sf_contact_id is not null`
    : f.outcome === 'already' ? sql`and c.dedup_status = 'duplicate'`
    : f.outcome === 'noContact' ? sql`and c.dedup_status is distinct from 'new'
        and c.dedup_status is distinct from 'duplicate' and c.contact_source = 'none'`
    : sql``

  // The outreach ladder. Every step sits inside "added to Salesforce", so each carries that base
  // filter plus its own condition — the same definitions the funnel counts with.
  const reachBase = sql`and c.dedup_status = 'new' and c.sf_contact_id is not null`
  const reachWhere = !f.reach ? sql``
    : f.reach === 'added' ? reachBase
    : f.reach === 'contacted' ? sql`${reachBase} and coalesce(c.outreach_total, 0) > 0`
    : f.reach === 'read' ? sql`${reachBase} and (coalesce(c.sms_read, 0) > 0 or coalesce(c.emails_opened, 0) > 0)`
    : f.reach === 'spoke' ? sql`${reachBase} and coalesce(c.conversations, 0) > 0`
    : sql`${reachBase} and exists (select 1 from djc_sf_applications a
                                   where a.applicant_sf_id = c.sf_contact_id)`

  // A real phone call is a Call-subtype task that is not an SMS disposition; Salesforce files
  // most texts as "calls", so the subtraction is what separates the two.
  const channelWhere = !f.channel ? sql``
    : f.channel === 'text' ? sql`${reachBase} and coalesce(c.sms_sent, 0) > 0`
    : f.channel === 'email' ? sql`${reachBase} and coalesce(c.emails_sent, 0) > 0`
    : sql`${reachBase} and coalesce(c.outreach_calls, 0) - coalesce(c.sms_sent, 0) > 0`

  // The supply-table definition: active on DJC in 90 days, never placed, live match (in a state).
  const activeWhere = (f.activeState || f.active)
    ? sql`and ${sql.unsafe(ACTIVE_DATE)} >= current_date - 90
        and not exists (select 1 from djc_sf_applications a
                        where a.applicant_sf_id = c.sf_contact_id and a.placed_on is not null)
        and exists (select 1 from djc_job_matches m
                    where m.sf_contact_id = c.sf_contact_id and m.is_live
                    ${f.activeState ? sql`and split_part(m.job_city_state, ', ', 2) = ${f.activeState}` : sql``})`
    : sql``

  const where = sql`
    where true
      ${outcomeWhere}
      ${reachWhere}
      ${channelWhere}
      ${activeWhere}
      ${f.month ? sql`and to_char(date_trunc('month', c.first_seen_at), 'YYYY-MM') = ${f.month}` : sql``}
      ${f.registeredMonth ? sql`and to_char(date_trunc('month', c.registered_on), 'YYYY-MM') = ${f.registeredMonth}` : sql``}
      ${f.targets ? sql`and coalesce(c.target, 'Unknown') = any(${f.targets.split(',')})` : sql``}
      ${f.basis === 'event' && (f.from || f.to)
        ? sql`and exists (select 1 from djc_event_log e
                          where e.candidate_id = c.candidate_id
                            and e.event_type = ${eventFor(f.outcome)}
                            ${f.from ? sql`and (e.created_at at time zone 'America/New_York')::date >= ${f.from}::date` : sql``}
                            ${f.to ? sql`and (e.created_at at time zone 'America/New_York')::date < ${f.to}::date` : sql``})`
        : sql`
          ${f.from ? sql`and c.first_seen_at >= ${f.from}::date` : sql``}
          ${f.to ? sql`and c.first_seen_at < ${f.to}::date` : sql``}`}`

  // Stats come from the WHOLE population, never from the capped row list — a panel that says
  // "11 put forward" under a chart that says 15 is worse than no panel at all.
  const [agg] = await sql<Record<string, number>[]>`
    select count(*)::int                                                          as total,
           count(*) filter (where coalesce(c.outreach_total, 0) > 0)::int         as touched,
           count(*) filter (where coalesce(c.conversations, 0) > 0)::int          as spoke,
           count(*) filter (where exists (select 1 from djc_sf_applications a
                                          where a.applicant_sf_id = c.sf_contact_id))::int as forwarded,
           coalesce(sum(c.outreach_total), 0)::int                                as touches,
           count(*) filter (where c.contact_source like 'cv%')::int               as from_cv,
           count(*) filter (where coalesce(c.open_match_count, 0) > 0)::int       as with_match,
           coalesce(sum(c.open_match_count), 0)::int                              as matches
    from djc_candidates c ${where}`
  const [topTarget] = await sql<{ target: string; n: number }[]>`
    select coalesce(c.target, 'Unknown') as target, count(*)::int as n
    from djc_candidates c ${where} group by 1 order by 2 desc limit 1`

  const rows = await sql<
    { name: string | null; card_name: string | null; target: string | null; mailing_state: string | null;
      sf_contact_id: string | null; first_seen_at: string | null; last_activity: string | null;
      contact_source: string | null; open_match_count: number | null; dedup_status: string | null;
      outreach_total: number | null; sms_read: number | null; emails_opened: number | null;
      conversations: number | null; first_outreach_at: string | null; forwarded: boolean
      registered_on: string | null }[]
  >`
    select c.name, c.card_name, c.target, c.mailing_state, c.sf_contact_id, c.first_seen_at,
           c.last_activity, c.contact_source, c.open_match_count, c.dedup_status,
           c.outreach_total, c.sms_read, c.emails_opened, c.conversations, c.first_outreach_at,
           c.registered_on,
           exists (select 1 from djc_sf_applications a
                   where a.applicant_sf_id = c.sf_contact_id) as forwarded
    from djc_candidates c ${where}
    order by ${f.registeredMonth ? sql`c.registered_on desc nulls last` : sql`c.first_seen_at desc nulls last`}
    limit ${LIMIT}
  `
  const out = rows.map(r => {
    const seen = r.first_seen_at === null ? null : iso(r.first_seen_at)
    const contact = r.contact_source === 'none' ? 'no contact info found'
      : r.contact_source && r.contact_source.startsWith('cv') ? 'contact recovered from résumé'
      : r.contact_source === 'profile' ? 'contact on profile' : null

    let metaLead: string | null
    let leadTone: DrillRow['leadTone'] = 'info'
    let meta: string
    if (f.reach || f.channel) {
      // On the ladder, what matters is the outreach itself — lead with it.
      const touches = r.outreach_total ?? 0
      const reads = (r.sms_read ?? 0) + (r.emails_opened ?? 0)
      const convs = r.conversations ?? 0
      metaLead = touches === 0 ? 'never contacted'
        : `${plural(touches, 'touch')}${convs > 0 ? ` · ${plural(convs, 'conversation')}`
          : reads > 0 ? ` · ${plural(reads, 'message')} read` : ' · no reply'}`
        + (r.forwarded ? ' · put forward' : '')
      leadTone = r.forwarded ? 'good' : convs > 0 ? 'good' : touches === 0 ? 'warn' : 'info'
      meta = [seen && `added ${seen}`,
        r.first_outreach_at && `first contacted ${iso(r.first_outreach_at)}`,
        r.last_activity && `last active on DJC ${r.last_activity}`].filter(Boolean).join(' · ')
    } else if (f.activeState || f.active) {
      metaLead = r.last_activity ? `last active ${r.last_activity}` : null
      leadTone = 'good'
      meta = [r.open_match_count ? `${r.open_match_count} live job match${r.open_match_count === 1 ? '' : 'es'}` : 'no live match count',
        seen && `sourced ${seen}`].filter(Boolean).join(' · ')
    } else if (f.outcome === 'noContact') {
      metaLead = 'no reachable phone or email'
      leadTone = 'warn'
      meta = [seen && `seen ${seen}`, r.last_activity && `last active ${r.last_activity}`]
        .filter(Boolean).join(' · ')
    } else if (f.outcome === 'already') {
      metaLead = seen ? `matched to an existing contact ${seen}` : null
      leadTone = 'muted'
      meta = r.last_activity ? `last active ${r.last_activity}` : ''
    } else if (f.registeredMonth) {
      metaLead = r.registered_on ? `joined DJC ${iso(r.registered_on)}` : null
      leadTone = 'info'
      meta = [r.last_activity && `last active ${r.last_activity}`,
        r.sf_contact_id ? 'in Salesforce' : 'not sourced by us'].filter(Boolean).join(' · ')
    } else {
      metaLead = seen ? `added ${seen}` : null
      leadTone = 'good'
      meta = [r.last_activity && `last active ${r.last_activity}`, contact].filter(Boolean).join(' · ')
    }
    return {
      sfId: r.sf_contact_id,
      title: r.name ?? r.card_name ?? 'Unnamed candidate',
      badge: r.target,
      badgeTone: 'muted' as const,
      sub: [r.mailing_state].filter(Boolean).join(' · ') || '—',
      metaLead,
      leadTone,
      meta,
    }
  })

  const roleCounts = new Map<string, number>()
  for (const r of rows) if (r.target) roleCounts.set(r.target, (roleCounts.get(r.target) ?? 0) + 1)
  const topRole = [...roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  const cv = rows.filter(r => r.contact_source?.startsWith('cv')).length
  const stats: DrillStat[] = [{ label: 'candidates', value: String(rows.length), tone: 'info' }]
  if (f.reach || f.channel) {
    const touched = rows.filter(r => (r.outreach_total ?? 0) > 0).length
    const spoke = rows.filter(r => (r.conversations ?? 0) > 0).length
    const fwd = rows.filter(r => r.forwarded).length
    const totalTouches = rows.reduce((a, r) => a + (r.outreach_total ?? 0), 0)
    stats.push({ label: 'reached at least once', value: String(touched),
      tone: touched === rows.length ? 'good' : 'muted' })
    stats.push({ label: 'spoke with a recruiter', value: String(spoke), tone: spoke > 0 ? 'good' : 'muted' })
    stats.push({ label: `put forward — ${rows.length ? Math.round((fwd / rows.length) * 100) : 0}% of them`,
      value: String(fwd), tone: fwd > 0 ? 'good' : 'warn' })
    stats.push({ label: 'touches, all in', value: String(totalTouches), tone: 'muted' })
  }
  if (f.activeState || f.active) {
    const matches = rows.reduce((s2, r) => s2 + (r.open_match_count ?? 0), 0)
    stats.push({ label: 'live job matches', value: String(matches), tone: 'good' })
  } else if (f.outcome === 'added') {
    stats.push({ label: 'contact from the résumé', value: String(cv), tone: 'good' })
  } else if (f.outcome === 'noContact') {
    stats.push({ label: 'views spent anyway', value: String(rows.length), tone: 'warn' })
  }
  if (topRole) stats.push({ label: `largest group — ${topRole[0]}`, value: String(topRole[1]), tone: 'muted' })
  return { rows: out, stats }
}

/* ── applications (the pipeline) ──────────────────────────────────────────── */

async function applicationRows(f: DrillParams): Promise<DrillResult> {
  const sql = djcSql
  if (!sql) return { rows: [], stats: [] }
  const rows = await sql<
    { applicant_sf_id: string | null; applicant_name: string | null; job_name: string | null;
      stage: string | null; created_on: string | null; submittal_on: string | null;
      placed_on: string | null; state: string | null }[]
  >`
    select a.applicant_sf_id, a.applicant_name, a.job_name, a.stage,
           a.created_on, a.submittal_on, a.placed_on, j.state
    from djc_sf_applications a
    left join (select job_name, max(state) as state, max(practice) as practice
               from djc_jobs group by 1) j
      on j.job_name = a.job_name
    where true
      ${f.client ? sql`and coalesce(nullif(j.practice, ''), 'Unknown') = ${f.client}` : sql``}
      ${f.stage === 'submitted' ? sql`and a.submittal_on is not null` : sql``}
      ${f.stage === 'placed' ? sql`and a.placed_on is not null` : sql``}
      ${f.month ? sql`and to_char(date_trunc('month', a.created_on), 'YYYY-MM') = ${f.month}` : sql``}
      ${f.fromMonth ? sql`and to_char(date_trunc('month', a.created_on), 'YYYY-MM') >= ${f.fromMonth}` : sql``}
      ${f.toMonth ? sql`and to_char(date_trunc('month', a.created_on), 'YYYY-MM') <= ${f.toMonth}` : sql``}
      ${f.state ? sql`and coalesce(nullif(j.state, ''), 'Unknown') = ${f.state}` : sql``}
    order by a.created_on desc nulls last
    limit ${LIMIT}
  `
  const out = rows.map(r => {
    const renewal = r.placed_on !== null && (r.stage ?? '').toLowerCase().startsWith('exten')
    const chain = [
      r.created_on && `put forward ${iso(r.created_on)}`,
      r.submittal_on && `submitted ${iso(r.submittal_on)}`,
      r.placed_on && `${renewal ? 'contract renewed' : 'placed'} ${iso(r.placed_on)}`,
    ].filter(Boolean).join(' → ')
    return {
      sfId: r.applicant_sf_id,
      title: r.applicant_name ?? 'Unnamed candidate',
      badge: renewal ? 'Renewal' : r.placed_on ? 'Placed' : r.submittal_on ? 'Submitted' : r.stage,
      badgeTone: (renewal ? 'accent' : r.placed_on ? 'good' : r.submittal_on ? 'open' : 'muted') as DrillRow['badgeTone'],
      sub: [r.job_name, r.state && r.state !== 'Unknown' ? r.state : null].filter(Boolean).join(' · ') || '—',
      metaLead: null,
      leadTone: 'muted' as const,
      meta: chain || 'no dates recorded',
    }
  })

  const n = rows.length
  const submitted = rows.filter(r => r.submittal_on !== null).length
  const placed = rows.filter(r => r.placed_on !== null).length
  const renewals = rows.filter(r =>
    r.placed_on !== null && (r.stage ?? '').toLowerCase().startsWith('exten')).length
  const stats: DrillStat[] = [
    { label: 'put forward', value: String(n), tone: 'info' },
    { label: `reached submittal — ${n ? Math.round((submitted / n) * 100) : 0}%`, value: String(submitted), tone: 'info' },
    { label: `placed — ${n ? Math.round((placed / n) * 100) : 0}%`, value: String(placed), tone: placed > 0 ? 'good' : 'muted' },
    ...(renewals > 0 ? [{ label: 'of those, contract renewals', value: String(renewals), tone: 'muted' as const }] : []),
  ]
  return { rows: out, stats }
}

/* ── locations ────────────────────────────────────────────────────────────── */

/**
 * Where a state's or a role's demand actually sits — one row per town, busiest first.
 *
 * A state is too big a unit to act on: "New York, 34 jobs" doesn't say where to recruit. This
 * ranks the towns inside it and flags the ones we have never placed in, which is where the next
 * push belongs. `everPlaced` deliberately ignores the time window — whether we have ever landed
 * anyone there is a fact about the place, not about the last 12 months.
 */
async function locationRows(f: DrillParams): Promise<DrillResult> {
  const sql = djcSql
  if (!sql) return { rows: [], stats: [] }
  const inWindow = f.sinceDays
    ? sql`open_date >= current_date - ${f.sinceDays}::int`
    : sql`true`

  const rows = await sql<
    { name: string; jobs: number; filled: number; open_now: number; ever_placed: number }[]
  >`
    select coalesce(nullif(city_state, ''), 'Unknown')                        as name,
           count(*) filter (where ${inWindow})::int                            as jobs,
           count(*) filter (where ${inWindow} and filled)::int                 as filled,
           count(*) filter (where ${inWindow} and status = 'Open')::int        as open_now,
           count(*) filter (where filled)::int                                 as ever_placed
    from djc_jobs
    where true
      ${f.state ? sql`and coalesce(nullif(state, ''), 'Unknown') = ${f.state}` : sql``}
      ${f.specialty ? sql`and coalesce(specialty, 'Unknown') = ${f.specialty}` : sql``}
      ${f.cityState ? sql`and city_state = ${f.cityState}` : sql``}
    group by 1
    having count(*) filter (where ${inWindow}) > 0
    order by 2 desc, 1
    limit ${LIMIT}
  `

  const out: DrillRow[] = rows.map(r => ({
    sfId: null,
    title: r.name,
    badge: r.ever_placed === 0 ? 'never placed' : null,
    badgeTone: (r.ever_placed === 0 ? 'warn' : 'muted') as DrillRow['badgeTone'],
    sub: [plural(r.filled, 'fill'), `${r.open_now} open now`].join(' · '),
    metaLead: plural(r.jobs, 'job') + ' opened',
    leadTone: 'info' as const,
    meta: r.ever_placed > 0 ? `${plural(r.ever_placed, 'placement')} here all time` : 'no placement here yet',
  }))

  const totalJobs = rows.reduce((a, r) => a + r.jobs, 0)
  const totalFilled = rows.reduce((a, r) => a + r.filled, 0)
  const untouched = rows.filter(r => r.ever_placed === 0)
  const stats: DrillStat[] = [
    { label: 'locations', value: String(rows.length), tone: 'info' },
    { label: 'jobs opened', value: String(totalJobs), tone: 'info' },
    { label: `filled — ${totalJobs ? Math.round((totalFilled / totalJobs) * 100) : 0}% of them`,
      value: String(totalFilled), tone: totalFilled > 0 ? 'good' : 'muted' },
    { label: 'towns never placed in', value: String(untouched.length),
      tone: untouched.length > 0 ? 'warn' : 'muted' },
  ]
  return { rows: out, stats }
}

export async function runDrill(f: DrillParams): Promise<DrillResult> {
  if (f.kind === 'locations') return locationRows(f)
  if (f.kind === 'placements') return placementRows(f)
  if (f.kind === 'candidates') return candidateRows(f)
  if (f.kind === 'applications') return applicationRows(f)
  return jobRows(f)
}

