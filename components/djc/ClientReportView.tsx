'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CHART } from '@/lib/chartTokens'
import type { ClientReport } from '@/lib/clientReport'

/**
 * The client-facing one-pager: the whole month across all three fronts, absorbable in one scroll.
 *
 * This is the condensation of every detail tab, so its discipline is the opposite of theirs —
 * exactly one visual per section, every number carries its meaning in words, and each section opens
 * with the sentence a reader would repeat in a meeting. Anyone who wants the mechanism follows the
 * pointer to the deep tab; nothing here exists that the email version cannot also say.
 */
const monthLabel = (m: string) =>
  new Date(m + '-02').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

export default function ClientReportView({ report }: { report: ClientReport }) {
  const r = report
  const opsDelta = r.ops.ytdPlaced - r.ops.priorYtdPlaced
  const opsPct = r.ops.priorYtdPlaced ? Math.round((opsDelta / r.ops.priorYtdPlaced) * 100) : 0
  const over = r.djc.cycleUsed - r.djc.cycleCap
  const maxMonthly = Math.max(...r.ops.monthly.map(m => Math.max(m.placed, m.prior ?? 0)), 1)
  const reachBase = r.djc.reach[0]?.people || 1

  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="text-[20px] font-semibold text-zinc-100">The month in one page</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
            Everything that matters across placements, candidate sourcing and the job pipeline —
            condensed from the detail tabs, never disagreeing with them. Generated {r.generatedAt}.
          </p>
        </div>
        <SendPanel />
      </header>

      {/* ── 01 Operational ─────────────────────────────────────────────────── */}
      <section>
        <SectionHead n="01" title="Operational" q="Are we putting more people into jobs than last year?" />
        <p className="mb-5 max-w-3xl text-[14px] leading-relaxed text-zinc-300">
          <span className={cn('font-semibold', opsDelta >= 0 ? 'text-teal-300' : 'text-orange-300')}>
            {r.ops.ytdPlaced} placements this year — {opsDelta >= 0 ? 'up' : 'down'} {Math.abs(opsPct)}%
          </span>{' '}
          on the same span of last year ({r.ops.priorYtdPlaced}), at {r.ops.avgPerMonth.toFixed(1)} a month.
        </p>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat value={String(r.ops.ytdPlaced)} label="placed year to date" tone="text-cyan-300" />
          <Stat value={`${opsDelta >= 0 ? '+' : ''}${opsPct}%`} label="vs the same span last year"
                tone={opsDelta >= 0 ? 'text-teal-300' : 'text-orange-300'} />
          <Stat value={String(r.ops.jobsOpened)} label="jobs opened this year" tone="text-zinc-200" />
          <Stat value={String(r.ops.jobsOpenNow)} label="jobs open right now" tone="text-zinc-200" />
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_280px]">
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-wide text-zinc-600">
              Placements per month · slim bar = same month last year
            </p>
            <div className="flex items-end gap-3">
              {r.ops.monthly.map((m, i, a) => {
                const partial = i === a.length - 1
                const up = m.prior !== null && m.placed > m.prior
                return (
                  <div key={m.month} className="flex flex-1 flex-col items-center">
                    <span className="mb-1.5 text-[12px] font-semibold tabular-nums text-zinc-100">{m.placed}</span>
                    <div className="flex w-full items-end justify-center gap-1" style={{ height: 96 }}>
                      <div className={cn('w-[58%] rounded-t-[3px]',
                        partial ? 'border border-dashed !bg-transparent border-slate-400/50'
                          : up ? CHART.good : m.prior !== null ? CHART.warn : CHART.neutral)}
                           style={{ height: Math.max((m.placed / maxMonthly) * 96, 2) }} />
                      {m.prior !== null && (
                        <div className={cn('w-[20%] rounded-t-[3px]', CHART.reference)}
                             style={{ height: Math.max((m.prior / maxMonthly) * 96, 2) }} />
                      )}
                    </div>
                    <div className="mt-1 h-px w-full bg-zinc-700/70" />
                    <span className="mt-1.5 text-[10px] text-zinc-500">
                      {monthLabel(m.month)}{partial && <span className="text-zinc-600"> so far</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="space-y-3">
            <MiniList title="Strongest states this year" rows={r.ops.topStates} />
            <MiniList title="Top clients" rows={r.ops.topClients} />
          </div>
        </div>

        <Take>
          Of the {r.ops.jobsOpened} roles taken on this year, {r.ops.jobsForwardPct}% had a candidate
          put forward and <span className="text-teal-300">{r.ops.jobsFilledPct}% were filled</span>.
          Full breakdowns live on the <span className="text-zinc-300">Overview</span> tab.
        </Take>
      </section>

      {/* ── 02 DJC ─────────────────────────────────────────────────────────── */}
      <section>
        <SectionHead n="02" title="Dentist Job Cafe" q="Is the sourcing subscription paying off?" />
        <p className="mb-5 max-w-3xl text-[14px] leading-relaxed text-zinc-300">
          {over > 0 ? (
            <>
              <span className="font-semibold text-orange-300">
                {r.djc.cycleUsed} of {r.djc.cycleCap} views used this cycle — {over} over the cap
              </span>{' '}
              — producing {r.djc.cycleAdded} new Salesforce contacts.
            </>
          ) : (
            <>
              <span className="font-semibold text-cyan-300">
                {r.djc.cycleUsed} of {r.djc.cycleCap} views used this cycle
              </span>{' '}
              producing {r.djc.cycleAdded} new Salesforce contacts.
            </>
          )}{' '}
          The bottleneck is not sourcing — it is what happens after.
        </p>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat value={`${r.djc.cycleUsed}`} label={`views used of ${r.djc.cycleCap} this cycle`}
                tone={over > 0 ? 'text-orange-300' : 'text-cyan-300'} />
          <Stat value={String(r.djc.cycleAdded)} label="new contacts this cycle" tone="text-teal-300" />
          <Stat value={r.djc.uniqueCandidates.toLocaleString()} label="unique candidates seen all time" tone="text-zinc-200" />
          <Stat value={`${r.djc.hoursPerWeek}h`} label="manual work returned per week" tone="text-teal-300" />
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-zinc-600">
            From sourced to placed — where people stop
          </p>
          <div className="space-y-1.5">
            {r.djc.reach.map((s, i) => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="w-44 shrink-0 text-[12px] text-zinc-300">{s.label}</span>
                <span className={cn('relative h-5 grow rounded', CHART.track)}>
                  <span className={cn('absolute inset-y-0 left-0 rounded',
                    i === r.djc.reach.length - 1 ? CHART.good : CHART.primary)}
                        style={{ width: `${Math.max((s.people / reachBase) * 100, 0.8)}%` }} />
                </span>
                <span className="w-14 shrink-0 text-right text-[13px] font-semibold tabular-nums text-zinc-100">
                  {s.people}
                </span>
              </div>
            ))}
          </div>
        </div>

        <Take>
          Per 100 candidates sourced, DJC has produced{' '}
          <span className="text-orange-300">{r.djc.djcPerHundred}</span> placements against{' '}
          <span className="text-teal-300">{r.djc.bestPerHundred} from {r.djc.bestSource}</span>. The
          gap opens at outreach — nobody who was never contacted has been put forward — so the
          cheapest lever is working candidates already on file. Detail on the{' '}
          <span className="text-zinc-300">Acquisition</span> tab.
        </Take>
      </section>

      {/* ── 03 Kimedics ────────────────────────────────────────────────────── */}
      <section>
        <SectionHead n="03" title="Kimedics" q="Is the job intake running itself?" />
        <p className="mb-5 max-w-3xl text-[14px] leading-relaxed text-zinc-300">
          <span className="font-semibold text-teal-300">
            {r.kim.capturePct}% of {r.kim.emails.toLocaleString()} job emails
          </span>{' '}
          became Salesforce records without a person touching them — in a median of{' '}
          {r.kim.syncMinutes} minutes, around the clock.
        </p>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat value={r.kim.emails.toLocaleString()} label="job emails processed" tone="text-cyan-300" />
          <Stat value={r.kim.jobsTracked.toLocaleString()} label="jobs tracked end to end" tone="text-zinc-200" />
          <Stat value={r.kim.fieldPatches.toLocaleString()} label="field corrections written automatically" tone="text-zinc-200" />
          <Stat value={`${r.kim.hoursSaved}h`} label="manual work returned" tone="text-teal-300" />
        </div>

        <Take>
          {r.kim.selfHealed} failures self-healed without anyone being paged. The emphasis here is
          volume: this is work nobody at Proxi does by hand any more. Mechanics on the{' '}
          <span className="text-zinc-300">Impact</span> tab.
        </Take>
      </section>
    </div>
  )
}

/* ── send widget ──────────────────────────────────────────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
type Status = 'idle' | 'sending' | 'done' | 'error'

function SendPanel() {
  const [emails, setEmails] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  const add = (raw: string) => {
    const parts = raw.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
    const valid = parts.filter(p => EMAIL_RE.test(p) && !emails.includes(p))
    if (valid.length) setEmails(e => [...e, ...valid])
    setDraft(parts.every(p => EMAIL_RE.test(p)) ? '' : parts.filter(p => !EMAIL_RE.test(p)).join(' '))
  }

  const send = async () => {
    const list = draft.trim() ? [...emails, ...(EMAIL_RE.test(draft.trim()) ? [draft.trim()] : [])] : emails
    if (!list.length) { setError('Add at least one email.'); setStatus('error'); return }
    setStatus('sending'); setError('')
    try {
      const res = await fetch('/api/reports/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: list }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || `Send failed (${res.status}).`)
      setStatus('done'); setEmails([]); setDraft('')
      setTimeout(() => setStatus('idle'), 4000)
    } catch (e) {
      setStatus('error'); setError(e instanceof Error ? e.message : 'Send failed.')
    }
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-zinc-700/60 bg-zinc-800/30 p-3">
      <p className="mb-2 text-[11px] font-medium text-zinc-400">Email this report</p>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-700/60 bg-zinc-900 px-2 py-1.5 focus-within:border-cyan-700">
        {emails.map(e => (
          <span key={e} className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[11px] text-cyan-100">
            {e}
            <button onClick={() => setEmails(x => x.filter(y => y !== e))}
                    className="text-cyan-300/70 hover:text-cyan-100" aria-label={`remove ${e}`}>×</button>
          </span>
        ))}
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft) } }}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={emails.length ? '' : 'name@company.com, another@…'}
          className="min-w-32 flex-1 bg-transparent text-[12px] text-zinc-200 placeholder-zinc-600 outline-none"
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={cn('text-[11px]',
          status === 'error' ? 'text-orange-300' : status === 'done' ? 'text-teal-300' : 'text-zinc-600')}>
          {status === 'error' ? error : status === 'done' ? 'Sent.' : status === 'sending' ? 'Building and sending…' : 'Comma or Enter to add more'}
        </span>
        <button onClick={send} disabled={status === 'sending'}
                className={cn('rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors',
                  status === 'sending' ? 'bg-zinc-700 text-zinc-400' : 'bg-cyan-500 text-cyan-950 hover:bg-cyan-400')}>
          {status === 'sending' ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}

/* ── bits ─────────────────────────────────────────────────────────────────── */

function SectionHead({ n, title, q }: { n: string; title: string; q: string }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold tracking-widest text-zinc-600">{n}</p>
      <h2 className="mt-0.5 text-[17px] font-semibold text-zinc-100">{title}</h2>
      <p className="mt-0.5 text-[13px] text-zinc-500">{q}</p>
    </div>
  )
}

function Stat({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <p className={cn('text-[24px] leading-none font-semibold tabular-nums', tone)}>{value}</p>
      <p className="mt-1.5 text-[11px] leading-tight text-zinc-400">{label}</p>
    </div>
  )
}

function MiniList({ title, rows }: { title: string; rows: { name: string; placed: number }[] }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <p className="mb-2 text-[10px] uppercase tracking-wide text-zinc-600">{title}</p>
      {rows.map(r => (
        <div key={r.name} className="flex items-baseline justify-between gap-3 py-0.5">
          <span className="truncate text-[12px] text-zinc-300" title={r.name}>{r.name}</span>
          <span className="shrink-0 text-[12px] font-semibold tabular-nums text-zinc-100">{r.placed}</span>
        </div>
      ))}
    </div>
  )
}

function Take({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 max-w-3xl border-t border-zinc-800 pt-3 text-[12px] leading-relaxed text-zinc-400">
      {children}
    </p>
  )
}
