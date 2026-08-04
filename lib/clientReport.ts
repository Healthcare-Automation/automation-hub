import { getOpsPlacements, getSources, getFunnel, getFunnelMeta, getFunnelViews,
  getSupplyDemandFlow, getCohortSeasonality,
  type FunnelSlice, type FunnelGroupRow, type CohortSeasonality } from './djcStory'
import {
  getJobEffectiveness, getViewCycles, getCycleProjection, getCandidateOutcomes,
  getCandidateOutcomesSince,
  getOutreachDetail, getOutreachByMonth, getSourcingByMonth, getActivityBuckets, rollUpActivity,
  getLocationSupply, getOpenAgeBands, getMonthOutcomes, getScopedGroups, getSourcingDetailByMonth,
  getNewAccountsByMonth, getRoleDemand, getMatchCompetition,
  type NewAccountRow, type RoleDemandRow, type MatchCompetition,
  type DurationBandRow, type MonthOutcome, type ScopedGroup, type SourcingDetailRow,
} from './djcOps'
import { getImpactData, getKimWorkByMonth, type KimWorkMonth } from './impact'
import { DJC_TIME_TASKS, DJC_WEEKS_LIVE, DJC_BASELINE_HOURS_PER_WEEK, DJC_HOURS_MONTHLY, KIM_LATENCY } from './impactScience'

/**
 * The client-facing report: the WHOLE Notion spec, condensed — not a teaser for the detail tabs.
 *
 * Structure follows the doc exactly: Operational (placements + the pipeline in every view + supply
 * vs demand), DJC (views budget with cycle/all-time framing, cycles broken out by outcome, new
 * candidates, activity, outreach follow-through, time saved), Kimedics (role-filling monthly and
 * quarterly, job length, what is open right now by state and type, location concentration, and the
 * work-done tally).
 *
 * Everything re-aggregates from the queries the detail tabs use, so this page can never disagree
 * with the page a reader drills into.
 */
export interface ClientReport {
  generatedAt: string      // when this report snapshot was computed (ISO)
  syncedAt: string | null  // when the Salesforce mirror last synced (ISO)
  ops: {
    ytdPlaced: number
    priorYtdPlaced: number
    avgPerMonth: number
    monthly: { month: string; placed: number; prior: number | null }[]
    quarters: { label: string; placed: number; prior: number | null }[]
    byState: { name: string; placed: number; prior: number }[]     // full list, scrollable in the UI
    byClient: { name: string; placed: number; prior: number }[]    // full list, scrollable in the UI
    pipeline: {
      pairs: number; people: number; jobs: number; submitted: number; placed: number
      renewals: number
      ytd: FunnelSlice
      priorYtd: FunnelSlice
      monthly: FunnelSlice[]
      quarterly: FunnelSlice[]
      byState: FunnelGroupRow[]
      byClient: FunnelGroupRow[]
      /** Does the month a candidate is put forward change their odds? Null when unprovable. */
      seasonality: CohortSeasonality | null
    }
    supply: {
      jobsAllTime: number
      filledAllTime: number
      openNow: number
      openUnfilled: number
      activeCandidates: number
      months: { month: string; opened: number; filled: number }[]
      settledFillPct: number       // fill rate excluding the two most recent months
      byState: { state: string; openJobs: number; candidates: number; everPlaced: number }[]
    }
  }
  djc: {
    cycleUsed: number
    cycleCap: number
    cycleUnique: number          // people the automation actually saw this cycle
    cycleAdded: number
    cycleAlready: number
    cycleNoContact: number
    cycleOther: number
    allTime: {
      viewsUsed: number; viewsCap: number
      unique: number; added: number; already: number; noContact: number; other: number
    }
    sfFromDjcTotal: number       // every DJC-sourced contact in Salesforce
    sfBeforeAutomation: number   // ...added by hand before the automation went live
    projectedTotal: number | null
    perDay: number | null
    perWeek: number | null
    byWeekday: { day: string; views: number }[]
    cycles: {
      start: string; refill: string; observedFrom: string; used: number; cap: number
      added: number; already: number; noContact: number; other: number
      autoOpens: number; freeSkips: number
      beforeTracking: number; bulkUnlogged: number
      bulkDays: { day: string; views: number }[]
      partial: boolean
    }[]
    uniqueCandidates: number
    newDetail: SourcingDetailRow[]
    /** Accounts newly created on DJC, by registration month × role. */
    newAccounts: NewAccountRow[]
    /** What we sourced per role against what Proxi actually has open. */
    roleDemand: RoleDemandRow[]
    /** How many candidates are already queued on each open job. */
    competition: MatchCompetition | null
    hoursMonthly: { month: string; hours: number }[]
    timeTasks: { label: string; count: number; minutes: number }[]
    reach: { label: string; people: number; note: string }[]
    /** Which outreach channel actually works — people contacted, engaged, put forward. */
    channels: { key: string; label: string; contacted: number; engaged: number
      engagedWord: string; forwarded: number }[]
    newByMonth: { month: string; total: number; general: number; specialist: number; hygienist: number; assistant: number }[]
    activity: { label: string; count: number; pct: number }[]
    /** The same last-active split, per role, so the block's role toggle can re-scope it. */
    activityByRole: { role: string; label: string; ord: number; count: number }[]
    outreachMonthly: { month: string; sourced: number; contacted: number; putForward: number; submitted: number; placed: number }[]
    djcPerHundred: number
    bestSource: string
    bestPerHundred: number
    hoursPerWeek: number
    baselineHours: number
  }
  kim: {
    jobsOpened: number
    priorJobsOpened: number
    jobsForwardPct: number
    jobsFilledPct: number
    scoreboard: {
      month: { opened: number; submitted: number; filled: number; prior: number | null }
      quarter: { opened: number; submitted: number; filled: number; prior: number | null }
      ytd: { opened: number; submitted: number; filled: number; prior: number | null }
    }
    jobsOpenNow: number
    openStale: number
    months: { month: string; opened: number; submitted: number; filled: number; prior: number | null }[]
    quarters: { label: string; opened: number; submitted: number; filled: number; prior: number | null }[]
    /** Open jobs only, by how long they have been waiting. */
    durations: { label: string; jobs: number; pct: number }[]
    byState: { name: string; opened: number; filled: number }[]
    byType: { name: string; opened: number; filled: number }[]
    openByState: { name: string; jobs: number; stale: number }[]
    openByType: { name: string; jobs: number; stale: number }[]
    weeks: { weekStart: string; opened: number; submitted: number; filled: number }[]
    years: { year: number; opened: number; submitted: number; filled: number }[]
    /** Age profile of the jobs open right now — see getOpenAgeBands for why it is open-only. */
    openAgeBands: { byState: DurationBandRow[]; byType: DurationBandRow[] }
    openAgeMedian: number | null
    /** What became of each period's intake — the one trend the jobs mirror supports honestly. */
    outcomes: { months: MonthOutcome[]; quarters: MonthOutcome[] }
    scoped: { byState: ScopedGroup[]; byType: ScopedGroup[] }
    updated: number
    closed: number
    worksites: number
    statesActive: number
    cities: { name: string; opened: number; everPlaced: number }[]
    practicesTotal: number
    topPracticeShare: number
    openAges: { label: string; jobs: number }[]
    activeCandidates: number
    emails: number
    capturePct: number
    syncMinutes: number
    jobsTracked: number
    fieldPatches: number
    selfHealed: number
    hoursSaved: number
    hoursMonthly: { month: string; hours: number }[]
    /** The same work counted per month — Kimedics report on a monthly cycle. */
    workMonthly: KimWorkMonth[]
  }
}

export async function getClientReport(): Promise<ClientReport> {
  // Sequential on purpose — the Supabase session pooler caps at 15 clients across the estate.
  const ops = await getOpsPlacements()
  const funnel = await getFunnel()
  const funnelMeta = await getFunnelMeta()
  const funnelViews = await getFunnelViews()
  const seasonality = await getCohortSeasonality()
  const demand = await getSupplyDemandFlow(12)
  const locations = await getLocationSupply()
  const openAges = await getOpenAgeBands()
  const jobOutcomes = await getMonthOutcomes()
  const scoped = await getScopedGroups()
  const newDetail = await getSourcingDetailByMonth()
  const newAccounts = await getNewAccountsByMonth()
  const roleDemand = await getRoleDemand()
  const competition = await getMatchCompetition()
  const jobs = await getJobEffectiveness()
  const cycles = await getViewCycles()
  const liveCycle = cycles.find(c => c.isCurrent)
  const outcomesCycle = liveCycle
    ? await getCandidateOutcomesSince(liveCycle.cycleStart)
    : { unique: 0, addedToSf: 0, alreadyInSf: 0, noContact: 0, other: 0 }
  const projection = await getCycleProjection()
  const outcomes = await getCandidateOutcomes(null)
  const outreach = await getOutreachDetail()
  const outreachMonthly = await getOutreachByMonth()
  const sourcing = await getSourcingByMonth()
  const activity = await getActivityBuckets()
  const sources = await getSources()
  const impact = await getImpactData()
  const workMonthly = await getKimWorkByMonth()
  const { default: djcSql } = await import('./djcDb')
  const [syncRow] = djcSql ? await djcSql<{ synced: string | null }[]>`
    select to_char(max(synced_at) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as synced
    from djc_jobs` : [{ synced: null }]
  if (!impact) throw new Error('Kimedics data unavailable — cannot build the client report.')

  const live = cycles.find(c => c.isCurrent)
  const djcSource = sources.find(s => s.source === 'Dentist_Job_Cafe')
  const best = sources
    .filter(s => s.source !== 'Dentist_Job_Cafe' && s.source !== 'Not recorded'
      && s.source !== 'Legacy Contact' && s.candidates >= 100)
    .sort((a, b) => b.placedPct - a.placedPct)[0]
  const djcHours = DJC_TIME_TASKS.reduce((a, t) => a + (t.count * t.minutes) / 60, 0)
  const k = impact.kim
  const activeCandidates = activity
    .filter(b => /this week|8-30|1-3 months/.test(b.label))
    .reduce((s, b) => s + b.count, 0)
  const sfFromDjcTotal = djcSource?.candidates ?? 0
  // Charts run January → now once the year is at least 4 months old; before that, a trailing
  // 4-month window so the chart never opens nearly empty.
  const yearPrefix = String(new Date().getUTCFullYear())
  const yearWindow = <T extends { month: string }>(rows: T[]): T[] => {
    const inYear = rows.filter(m => m.month.startsWith(yearPrefix))
    return inYear.length >= 4 ? inYear : rows.slice(-4)
  }

  return {
    generatedAt: new Date().toISOString(),
    syncedAt: syncRow?.synced ?? null,
    ops: {
      ytdPlaced: ops.ytd,
      priorYtdPlaced: ops.ytdPriorYear,
      avgPerMonth: ops.avgPerMonth,
      monthly: yearWindow(ops.monthly).map(m => ({ month: m.month, placed: m.placed, prior: m.priorYear })),
      quarters: ops.quarters
        .filter(q => q.label.endsWith(yearPrefix.slice(2)))
        .map(q => ({ label: q.label, placed: q.placed, prior: q.priorYear })),
      byState: ops.byState.map(s => ({ name: s.name, placed: s.placed, prior: s.priorYear })),
      byClient: ops.byClient.map(c => ({ name: c.name, placed: c.placed, prior: c.priorYear })),
      pipeline: {
        pairs: funnel[0]?.count ?? 0,
        people: funnelMeta.people,
        jobs: funnelMeta.jobs,
        submitted: funnel[1]?.count ?? 0,
        placed: funnel[2]?.count ?? 0,
        renewals: funnel[2]?.renewals ?? 0,
        ytd: funnelViews.ytd,
        priorYtd: funnelViews.priorYtd,
        monthly: funnelViews.monthly,
        quarterly: funnelViews.quarterly,
        byState: funnelViews.byState,
        byClient: funnelViews.byClient,
        seasonality,
      },
      supply: {
        jobsAllTime: demand.allTimeJobs,
        filledAllTime: demand.allTimeFilled,
        openNow: demand.openNow,
        openUnfilled: demand.openUnfilled,
        activeCandidates: demand.activeCandidates,
        months: demand.months.map(m => ({ month: m.month, opened: m.opened, filled: m.filled })),
        settledFillPct: (() => {
          const settled = demand.months.slice(0, -2)
          const o = settled.reduce((s2, m) => s2 + m.opened, 0)
          const f = settled.reduce((s2, m) => s2 + m.filled, 0)
          return o ? Math.round((f / o) * 100) : 0
        })(),
        byState: locations
          .filter(l => l.state !== 'Unknown')
          .map(l => ({ state: l.state, openJobs: l.openJobs, candidates: l.candidates, everPlaced: l.everPlaced })),
      },
    },
    djc: {
      cycleUsed: live?.views ?? 0,
      cycleCap: live?.cap ?? 750,
      // People the automation saw this cycle, not views — duplicates are skipped from the list
      // before a view is spent, so a view-attributed "already in SF" would always read ~0 while
      // the drill lists hundreds of matched people.
      cycleUnique: outcomesCycle.unique,
      cycleAdded: outcomesCycle.addedToSf,
      cycleAlready: outcomesCycle.alreadyInSf,
      cycleNoContact: outcomesCycle.noContact,
      cycleOther: live?.other ?? 0,
      allTime: {
        viewsUsed: cycles.reduce((s, c) => s + c.views, 0),
        viewsCap: cycles.reduce((s, c) => s + c.cap, 0),
        unique: outcomes.unique,
        added: outcomes.addedToSf,
        already: outcomes.alreadyInSf,
        noContact: outcomes.noContact,
        other: outcomes.other,
      },
      sfFromDjcTotal,
      sfBeforeAutomation: Math.max(sfFromDjcTotal - outcomes.addedToSf, 0),
      projectedTotal: projection?.projectedTotal ?? null,
      perDay: projection?.perDay ?? null,
      perWeek: projection?.perWeek ?? null,
      byWeekday: projection?.byWeekday ?? [],
      cycles: cycles.map(c => ({
        start: c.cycleStart, refill: c.refillDate, observedFrom: c.observedFrom,
        used: c.views, cap: c.cap,
        added: c.addedToSf, already: c.alreadyInSf, noContact: c.noContact, other: c.other,
        autoOpens: c.autoOpens, freeSkips: c.freeSkips,
        beforeTracking: c.beforeTracking, bulkUnlogged: c.bulkUnlogged, bulkDays: c.bulkDays,
        partial: c.partialStart,
      })),
      uniqueCandidates: outcomes.unique,
      newDetail,
      newAccounts,
      roleDemand,
      competition,
      hoursMonthly: DJC_HOURS_MONTHLY.map(m => ({ month: m.month, hours: m.hours })),
      timeTasks: DJC_TIME_TASKS.map(t => ({ label: t.label, count: t.count, minutes: t.minutes })),
      reach: (outreach.reach ?? []).map(r => ({ label: r.label, people: r.people, note: r.note })),
      channels: outreach.channels ?? [],
      newByMonth: sourcing.map(m => ({
        month: m.month,
        total: m.generalDentist + m.specialist + m.hygienist + m.assistant,
        general: m.generalDentist, specialist: m.specialist,
        hygienist: m.hygienist, assistant: m.assistant,
      })),
      activity: rollUpActivity(activity),
      activityByRole: activity,
      outreachMonthly: outreachMonthly.map(m => ({
        month: m.month, sourced: m.sourced, contacted: m.contacted,
        putForward: m.putForward, submitted: m.submitted, placed: m.placed,
      })),
      djcPerHundred: djcSource?.placedPct ?? 0,
      bestSource: best?.source ?? 'Indeed',
      bestPerHundred: best?.placedPct ?? 0,
      hoursPerWeek: Math.round((djcHours / DJC_WEEKS_LIVE) * 10) / 10,
      baselineHours: DJC_BASELINE_HOURS_PER_WEEK,
    },
    kim: {
      jobsOpened: jobs?.ytdOpened ?? 0,
      priorJobsOpened: jobs?.priorYtdOpened ?? 0,
      jobsForwardPct: jobs?.ytdOpened ? Math.round((jobs.ytdSubmitted / jobs.ytdOpened) * 100) : 0,
      jobsFilledPct: jobs?.ytdOpened ? Math.round((jobs.ytdFilled / jobs.ytdOpened) * 100) : 0,
      scoreboard: (() => {
        const lastMonth = (jobs?.months ?? [])[Math.max((jobs?.months?.length ?? 0) - 1, 0)]
        const lastQuarter = (jobs?.quarters ?? [])[Math.max((jobs?.quarters?.length ?? 0) - 1, 0)]
        return {
          month: { opened: lastMonth?.opened ?? 0, submitted: lastMonth?.submitted ?? 0,
            filled: lastMonth?.filled ?? 0, prior: lastMonth?.priorYear ?? null },
          quarter: { opened: lastQuarter?.opened ?? 0, submitted: lastQuarter?.submitted ?? 0,
            filled: lastQuarter?.filled ?? 0, prior: lastQuarter?.priorYear ?? null },
          ytd: { opened: jobs?.ytdOpened ?? 0, submitted: jobs?.ytdSubmitted ?? 0,
            filled: jobs?.ytdFilled ?? 0, prior: jobs?.priorYtdOpened ?? null },
        }
      })(),
      jobsOpenNow: jobs?.openNow ?? 0,
      openStale: (jobs?.openAges ?? []).filter(a => a.label === 'Over 3 months')
        .reduce((s, a) => s + a.jobs, 0),
      months: yearWindow(jobs?.months ?? []).map(m => ({
        month: m.month, opened: m.opened, submitted: m.submitted, filled: m.filled, prior: m.priorYear,
      })),
      quarters: (jobs?.quarters ?? []).slice(-4).map(q => ({
        label: q.label, opened: q.opened, submitted: q.submitted, filled: q.filled, prior: q.priorYear,
      })),
      weeks: (jobs?.weeks ?? []).slice(-12),
      years: jobs?.years ?? [],
      durations: openAges.overall,
      byState: (jobs?.byState ?? []).slice(0, 5).map(g => ({ name: g.name, opened: g.opened, filled: g.filled })),
      byType: (jobs?.byType ?? []).slice(0, 5).map(g => ({ name: g.name, opened: g.opened, filled: g.filled })),
      openByState: (jobs?.openByState ?? []).map(g => ({ name: g.name, jobs: g.jobs, stale: g.stale })),
      openByType: (jobs?.openByType ?? []).map(g => ({ name: g.name, jobs: g.jobs, stale: g.stale })),
      openAgeBands: { byState: openAges.byState, byType: openAges.byType },
      openAgeMedian: openAges.median,
      outcomes: jobOutcomes,
      scoped,
      updated: k.updated,
      closed: k.closed,
      worksites: k.worksitesCreated,
      statesActive: scoped.byState.filter(g => g.name !== 'Unknown').length,
      cities: (jobs?.byCity ?? []).slice(0, 5).map(c => ({ name: c.name, opened: c.opened, everPlaced: c.everPlaced })),
      practicesTotal: jobs?.practicesTotal ?? 0,
      topPracticeShare: jobs?.ytdOpened
        ? Math.round(((jobs.topPracticeShare ?? 0) / Math.max(jobs.ytdOpened, 1)) * 100) : 0,
      openAges: (jobs?.openAges ?? []).map(a => ({ label: a.label, jobs: a.jobs })),
      activeCandidates,
      emails: k.emails,
      capturePct: k.jobsTracked ? Math.round((k.jobsInSf / k.jobsTracked) * 1000) / 10 : 0,
      syncMinutes: KIM_LATENCY.medianMin,
      jobsTracked: k.jobsTracked,
      fieldPatches: k.sfPatches,
      selfHealed: k.autoRetries,
      hoursSaved: k.hoursSaved,
      hoursMonthly: (k.monthly ?? []).map(m => ({ month: m.month, hours: m.hours })),
      workMonthly,
    },
  }
}
