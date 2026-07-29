import { getOpsPlacements } from './djcStory'
import {
  getJobEffectiveness, getViewCycles, getCandidateOutcomes, getOutreachDetail,
} from './djcOps'
import { getSources } from './djcStory'
import { getImpactData } from './impact'
import { DJC_TIME_TASKS, DJC_WEEKS_LIVE, KIM_LATENCY } from './impactScience'

/**
 * The condensed client-facing report: everything Proxi's leadership needs, one screen, three
 * sections — Operational, DJC, Kimedics.
 *
 * This deliberately re-aggregates from the same queries the detail tabs use rather than keeping its
 * own numbers, so the one-pager can never disagree with the page a reader drills into. Every field
 * here appears in the report; nothing is fetched "in case".
 */
export interface ClientReport {
  generatedAt: string
  ops: {
    ytdPlaced: number
    priorYtdPlaced: number
    avgPerMonth: number
    monthly: { month: string; placed: number; prior: number | null }[]
    quarters: { label: string; placed: number; prior: number | null }[]
    topStates: { name: string; placed: number }[]
    topClients: { name: string; placed: number }[]
    jobsOpened: number
    jobsForwardPct: number
    jobsFilledPct: number
    jobsOpenNow: number
  }
  djc: {
    cycleUsed: number
    cycleCap: number
    cycleAdded: number
    uniqueCandidates: number
    addedToSf: number
    alreadyInSf: number
    noContact: number
    reach: { label: string; people: number }[]
    djcPerHundred: number
    bestSource: string
    bestPerHundred: number
    hoursPerWeek: number
  }
  kim: {
    emails: number
    capturePct: number
    syncMinutes: number
    jobsTracked: number
    fieldPatches: number
    selfHealed: number
    hoursSaved: number
  }
}

export async function getClientReport(): Promise<ClientReport> {
  // Sequential on purpose — the Supabase session pooler caps at 15 clients across the estate.
  const ops = await getOpsPlacements()
  const jobs = await getJobEffectiveness()
  const cycles = await getViewCycles()
  const outcomes = await getCandidateOutcomes(null)
  const outreach = await getOutreachDetail()
  const sources = await getSources()
  const impact = await getImpactData()
  if (!impact) throw new Error('Kimedics data unavailable — cannot build the client report.')

  const live = cycles.find(c => c.isCurrent)
  const djcSource = sources.find(s => s.source === 'Dentist_Job_Cafe')
  // Best comparable platform: enough volume that the rate means something, and not the legacy
  // bucket, which is not a platform anyone can buy more of.
  const best = sources
    .filter(s => s.source !== 'Dentist_Job_Cafe' && s.source !== 'Not recorded'
      && s.source !== 'Legacy Contact' && s.candidates >= 100)
    .sort((a, b) => b.placedPct - a.placedPct)[0]

  const djcHours = DJC_TIME_TASKS.reduce((a, t) => a + (t.count * t.minutes) / 60, 0)
  const k = impact.kim

  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    ops: {
      ytdPlaced: ops.ytd,
      priorYtdPlaced: ops.ytdPriorYear,
      avgPerMonth: ops.avgPerMonth,
      monthly: ops.monthly.slice(-6).map(m => ({ month: m.month, placed: m.placed, prior: m.priorYear })),
      quarters: ops.quarters.slice(-4).map(q => ({ label: q.label, placed: q.placed, prior: q.priorYear })),
      topStates: ops.byState.slice(0, 3).map(s => ({ name: s.name, placed: s.placed })),
      topClients: ops.byClient.slice(0, 3).map(c => ({ name: c.name, placed: c.placed })),
      jobsOpened: jobs?.ytdOpened ?? 0,
      jobsForwardPct: jobs?.ytdOpened ? Math.round(((jobs.ytdSubmitted) / jobs.ytdOpened) * 100) : 0,
      jobsFilledPct: jobs?.ytdOpened ? Math.round(((jobs.ytdFilled) / jobs.ytdOpened) * 100) : 0,
      jobsOpenNow: jobs?.openNow ?? 0,
    },
    djc: {
      cycleUsed: live?.views ?? 0,
      cycleCap: live?.cap ?? 750,
      cycleAdded: live?.addedToSf ?? 0,
      uniqueCandidates: outcomes.unique,
      addedToSf: outcomes.addedToSf,
      alreadyInSf: outcomes.alreadyInSf,
      noContact: outcomes.noContact,
      reach: (outreach.reach ?? []).map(r => ({ label: r.label, people: r.people })),
      djcPerHundred: djcSource?.placedPct ?? 0,
      bestSource: best?.source ?? 'Indeed',
      bestPerHundred: best?.placedPct ?? 0,
      hoursPerWeek: Math.round((djcHours / DJC_WEEKS_LIVE) * 10) / 10,
    },
    kim: {
      emails: k.emails,
      capturePct: k.jobsTracked ? Math.round((k.jobsInSf / k.jobsTracked) * 1000) / 10 : 0,
      syncMinutes: KIM_LATENCY.medianMin,
      jobsTracked: k.jobsTracked,
      fieldPatches: k.sfPatches,
      selfHealed: k.autoRetries,
      hoursSaved: k.hoursSaved,
    },
  }
}
