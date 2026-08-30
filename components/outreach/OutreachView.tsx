'use client'

import { useMemo, useState } from 'react'
import type { OutreachCompanyRow } from '@/lib/outreachQueries'
import CompanyPanel from './CompanyPanel'

type Summary = {
  total: number; contactable: number; needs_review: number
  contacted: number; replied: number; do_not_contact: number
  last_synced_at: string | null
} | null

const STAGE_LABEL: Record<string, string> = {
  discovered: 'Discovered', researching: 'Researching', qualified: 'Qualified',
  needs_contact_data: 'Needs contact data', ready_for_review: 'Ready for review',
  approved: 'Approved', scheduled: 'Scheduled', contacted: 'Contacted',
  following_up: 'Following up', replied: 'Replied',
  qualified_conversation: 'Qualified conversation', meeting: 'Meeting',
  opportunity: 'Opportunity', nurture: 'Nurture', closed_won: 'Closed won',
  closed_lost: 'Closed lost', not_fit: 'Not a fit', suppressed: 'Suppressed',
  blocked_deliverability: 'Blocked (deliverability)',
}

const STAGE_TONE: Record<string, string> = {
  ready_for_review: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30',
  contacted: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 ring-cyan-500/30',
  following_up: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 ring-cyan-500/30',
  replied: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30',
  qualified_conversation: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30',
  meeting: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30',
  opportunity: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30',
  closed_won: 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 ring-emerald-500/40',
  closed_lost: 'bg-zinc-200/70 ring-zinc-300 text-zinc-500 dark:bg-zinc-700/40 dark:ring-zinc-700/50',
  suppressed: 'bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/25',
  not_fit: 'bg-zinc-200/70 ring-zinc-300 text-zinc-500 dark:bg-zinc-700/40 dark:ring-zinc-700/50',
  blocked_deliverability: 'bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/25',
}
const stageTone = (stage: string) => STAGE_TONE[stage] ?? 'bg-zinc-200/70 ring-zinc-300 text-zinc-600 dark:bg-zinc-700/30 dark:text-zinc-400 dark:ring-zinc-700/40'

function Tile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-white ring-zinc-200 shadow-sm dark:bg-zinc-900/40 dark:ring-zinc-800/60 dark:shadow-none p-3.5 ring-1">
      <p className={`text-[22px] font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-zinc-500">{label}</p>
    </div>
  )
}

function scoreColor(score: number | null) {
  if (score === null) return 'text-zinc-500'
  if (score >= 85) return 'text-emerald-700 dark:text-emerald-300'
  if (score >= 70) return 'text-cyan-700 dark:text-cyan-300'
  if (score >= 55) return 'text-amber-700 dark:text-amber-300'
  return 'text-zinc-500'
}

export default function OutreachView({
  companies, summary, isAdmin,
}: { companies: OutreachCompanyRow[]; summary: Summary; isAdmin: boolean }) {
  const [query, setQuery] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [openId, setOpenId] = useState<number | null>(null)

  const stages = useMemo(() => {
    const set = new Set(companies.map(c => c.pipeline_stage))
    return ['all', ...Array.from(set).sort()]
  }, [companies])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return companies.filter(c => {
      if (stageFilter !== 'all' && c.pipeline_stage !== stageFilter) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        (c.industry ?? '').toLowerCase().includes(q) ||
        (c.contact_name ?? '').toLowerCase().includes(q)
      )
    })
  }, [companies, query, stageFilter])

  return (
    <div className="space-y-5">
      {summary && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="total prospects" value={summary.total} tone="text-zinc-800 dark:text-zinc-200" />
          <Tile label="safe to contact" value={summary.contactable} tone="text-cyan-700 dark:text-cyan-300" />
          <Tile label="ready for review" value={summary.needs_review} tone="text-amber-700 dark:text-amber-300" />
          <Tile label="contacted" value={summary.contacted} tone="text-cyan-700 dark:text-cyan-300" />
          <Tile label="replied" value={summary.replied} tone="text-emerald-700 dark:text-emerald-300" />
          <Tile label="do-not-contact" value={summary.do_not_contact} tone="text-red-600 dark:text-red-400" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search company, industry, contact…"
          className="min-w-[220px] flex-1 rounded-lg border border-zinc-200 bg-white placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-700/60 dark:bg-zinc-900/60 dark:placeholder:text-zinc-600 dark:focus:border-zinc-600 px-3 py-1.5 text-[13px] text-zinc-800 dark:text-zinc-200 focus:outline-none"
        />
        <select
          value={stageFilter}
          onChange={e => setStageFilter(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white focus:border-zinc-400 dark:border-zinc-700/60 dark:bg-zinc-900/60 dark:focus:border-zinc-600 px-2.5 py-1.5 text-[12px] text-zinc-700 dark:text-zinc-300 focus:outline-none"
        >
          {stages.map(s => (
            <option key={s} value={s}>{s === 'all' ? 'All stages' : STAGE_LABEL[s] ?? s}</option>
          ))}
        </select>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-600">{filtered.length} of {companies.length}</span>
      </div>

      <div className="overflow-hidden rounded-xl ring-1 ring-zinc-200 dark:ring-zinc-800/60">
        <table className="w-full text-[12.5px]">
          <thead className="bg-zinc-50 dark:bg-zinc-900/60">
            <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-2.5 font-medium">Company</th>
              <th className="px-3 py-2.5 font-medium">Score</th>
              <th className="px-3 py-2.5 font-medium">Stage</th>
              <th className="px-3 py-2.5 font-medium">Contact</th>
              <th className="px-3 py-2.5 font-medium">Email</th>
              <th className="px-3 py-2.5 font-medium">LinkedIn</th>
              <th className="px-3 py-2.5 font-medium">Reply</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr
                key={c.id}
                onClick={() => setOpenId(c.id)}
                className="cursor-pointer border-t border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800/70 dark:hover:bg-zinc-800/30"
              >
                <td className="px-4 py-2.5">
                  <p className="font-medium text-zinc-800 dark:text-zinc-200">{c.name}</p>
                  <p className="text-[10.5px] text-zinc-500">
                    {[c.industry, c.service_type].filter(Boolean).join(' · ') || '—'}
                  </p>
                </td>
                <td className={`px-3 py-2.5 font-semibold tabular-nums ${scoreColor(c.lead_score)}`}>
                  {c.lead_score ?? '—'}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 ${stageTone(c.pipeline_stage)}`}>
                    {STAGE_LABEL[c.pipeline_stage] ?? c.pipeline_stage}
                  </span>
                  {c.do_not_contact && (
                    <span className="ml-1.5 inline-flex rounded-full bg-red-500/10 px-2 py-0.5 text-[10.5px] font-medium text-red-600 dark:text-red-400 ring-1 ring-red-500/25">
                      DNC
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400">{c.contact_name ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-500">{c.email_status_current ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-500">{c.linkedin_status ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-500">{c.reply_classification ?? '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-600">Nothing matches.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openId !== null && (
        <CompanyPanel id={openId} isAdmin={isAdmin} onClose={() => setOpenId(null)} />
      )}
    </div>
  )
}
