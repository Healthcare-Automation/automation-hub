'use client'

import { useEffect, useState } from 'react'
import type { CompanyDetail } from '@/lib/outreachQueries'

type Tab = 'score' | 'emails' | 'linkedin' | 'replies' | 'research'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      {children}
    </div>
  )
}

function ScoreBar({ label, value, max }: { label: string; value: number | null; max: number }) {
  const v = value ?? 0
  const pct = max > 0 ? Math.min(100, Math.round((v / max) * 100)) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-zinc-400">{label}</span>
        <span className="tabular-nums text-zinc-300">{value ?? '—'} / {max}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-zinc-800">
        <div className="h-1.5 rounded-full bg-cyan-500/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const CONFIDENCE_TONE: Record<string, string> = {
  High: 'text-emerald-300', Medium: 'text-amber-300', Low: 'text-red-400',
}

function LinkedinCard({
  action, isAdmin, onDecision,
}: {
  action: CompanyDetail['linkedinActions'][number]
  isAdmin: boolean
  onDecision: (id: number, decision: 'approved' | 'rejected', note: string | null) => Promise<void>
}) {
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const decided = action.status === 'approved' || action.status === 'rejected'

  return (
    <div className="rounded-lg bg-zinc-800/30 p-3 ring-1 ring-zinc-800/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[12.5px] font-medium text-zinc-200">{action.contact_name ?? 'Unnamed contact'}</p>
          {action.linkedin_url && (
            <a href={action.linkedin_url} target="_blank" rel="noreferrer"
               className="text-[11px] text-cyan-400 hover:underline">{action.linkedin_url}</a>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10.5px]">
          <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-zinc-400">{action.recommended_action}</span>
          <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-zinc-400">urgency: {action.urgency}</span>
          <span className={`rounded-full bg-zinc-700/40 px-2 py-0.5 ${CONFIDENCE_TONE[action.profile_confidence ?? ''] ?? 'text-zinc-400'}`}>
            match confidence: {action.profile_confidence ?? 'unknown'}
          </span>
        </div>
      </div>

      <div className="mt-2.5 space-y-2 text-[11.5px]">
        <div>
          <p className="text-zinc-500">Connection note</p>
          <p className="mt-0.5 whitespace-pre-wrap text-zinc-300">{action.connection_note}</p>
        </div>
        {action.dm_draft && (
          <div>
            <p className="text-zinc-500">DM draft</p>
            <p className="mt-0.5 whitespace-pre-wrap text-zinc-300">{action.dm_draft}</p>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`text-[11px] font-medium ${
          action.status === 'approved' ? 'text-emerald-300'
          : action.status === 'rejected' ? 'text-red-400' : 'text-amber-300'
        }`}>
          {action.status === 'queued' ? 'Awaiting your review' : action.status}
          {action.verification_note && ` — ${action.verification_note}`}
        </span>

        {isAdmin && !decided && !rejecting && (
          <div className="flex gap-1.5">
            <button
              disabled={busy}
              onClick={async () => { setBusy(true); await onDecision(action.id, 'approved', null); setBusy(false) }}
              className="rounded-md bg-emerald-600/80 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              Approve profile match
            </button>
            <button
              disabled={busy}
              onClick={() => setRejecting(true)}
              className="rounded-md bg-zinc-700/60 px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:bg-zinc-700"
            >
              Reject
            </button>
          </div>
        )}
        {isAdmin && rejecting && (
          <div className="flex flex-1 items-center gap-1.5">
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Why is this the wrong person?"
              className="flex-1 rounded-md border border-zinc-700/60 bg-zinc-900/60 px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600"
            />
            <button
              disabled={busy || note.trim().length === 0}
              onClick={async () => { setBusy(true); await onDecision(action.id, 'rejected', note.trim()); setBusy(false); setRejecting(false) }}
              className="rounded-md bg-red-600/80 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-600 disabled:opacity-50"
            >
              Confirm reject
            </button>
            <button onClick={() => setRejecting(false)}
              className="rounded-md px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-300">Cancel</button>
          </div>
        )}
      </div>
      {!isAdmin && !decided && (
        <p className="mt-2 text-[10.5px] text-zinc-600">Log in as admin on the hub to approve/reject this match.</p>
      )}
    </div>
  )
}

export default function CompanyPanel({
  id, isAdmin, onClose,
}: { id: number; isAdmin: boolean; onClose: () => void }) {
  const [data, setData] = useState<CompanyDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState<Tab>('score')

  useEffect(() => {
    let live = true
    setData(null)
    setFailed(false)
    setTab('score')
    fetch(`/api/outreach/company/${id}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => live && setData(d))
      .catch(() => live && setFailed(true))
    return () => { live = false }
  }, [id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleDecision(actionId: number, decision: 'approved' | 'rejected', note: string | null) {
    const res = await fetch('/api/outreach/linkedin-decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: actionId, decision, note }),
    })
    if (res.ok && data) {
      setData({
        ...data,
        linkedinActions: data.linkedinActions.map(a =>
          a.id === actionId ? { ...a, status: decision, verification_note: note } : a),
      })
    }
  }

  const TABS: { key: Tab; label: string; count?: number }[] = data ? [
    { key: 'score', label: 'Score & fit' },
    { key: 'emails', label: 'Drafts', count: data.emails.length },
    { key: 'linkedin', label: 'LinkedIn', count: data.linkedinActions.length },
    { key: 'replies', label: 'Replies', count: data.replies.length },
    { key: 'research', label: 'Research', count: data.findings.length },
  ] : []

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-2xl flex-col border-l border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-zinc-100">
              {data?.company.name ?? 'Loading…'}
            </h3>
            {data && (
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                {[data.company.industry, data.company.service_type, data.company.size_bucket]
                  .filter(Boolean).join(' · ')}
                {data.company.website && (
                  <> · <a href={data.company.website} target="_blank" rel="noreferrer"
                    className="text-cyan-400 hover:underline">{data.company.website}</a></>
                )}
              </p>
            )}
          </div>
          <button onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-[12px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
            Close
          </button>
        </div>

        {failed ? (
          <p className="px-5 py-10 text-center text-[12px] text-amber-300/80">
            The database was busy. Close and try again in a few seconds.
          </p>
        ) : !data ? (
          <p className="px-5 py-10 text-center text-[12px] text-zinc-600">Loading…</p>
        ) : (
          <>
            <div className="flex shrink-0 gap-1 border-b border-zinc-800 px-5 pt-3">
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`rounded-t-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    tab === t.key ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {tab === 'score' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 rounded-lg bg-zinc-800/30 p-3.5 ring-1 ring-zinc-800/60">
                    <p className="text-[30px] font-semibold tabular-nums text-cyan-300">
                      {data.company.lead_score ?? '—'}
                    </p>
                    <div className="text-[11px] text-zinc-500">
                      <p>pipeline stage: <span className="text-zinc-300">{data.company.pipeline_stage}</span></p>
                      <p>research tier: <span className="text-zinc-300">{data.company.research_tier ?? '—'}</span></p>
                      {data.company.do_not_contact && <p className="text-red-400">DO NOT CONTACT{data.company.do_not_contact_reason ? `: ${data.company.do_not_contact_reason}` : ''}</p>}
                    </div>
                  </div>

                  {data.scoreBreakdown && (
                    <Section title="Score breakdown">
                      <div className="space-y-2.5">
                        <ScoreBar label="Business model fit" value={data.scoreBreakdown.business_model_fit} max={20} />
                        <ScoreBar label="Operational opportunity" value={data.scoreBreakdown.operational_opportunity} max={25} />
                        <ScoreBar label="Economic importance" value={data.scoreBreakdown.economic_importance} max={15} />
                        <ScoreBar label="UZU credibility" value={data.scoreBreakdown.uzu_credibility} max={15} />
                        <ScoreBar label="Decision-maker access" value={data.scoreBreakdown.decision_maker_access} max={10} />
                        <ScoreBar label="Timing / trigger" value={data.scoreBreakdown.timing_trigger} max={5} />
                        <ScoreBar label="Personalization evidence" value={data.scoreBreakdown.personalization_evidence} max={10} />
                      </div>
                      {data.scoreBreakdown.rationale && (
                        <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-400">{data.scoreBreakdown.rationale}</p>
                      )}
                    </Section>
                  )}

                  {data.hypothesis && (
                    <Section title="Opportunity hypothesis">
                      <div className="space-y-2 text-[11.5px] leading-relaxed text-zinc-300">
                        {data.hypothesis.problem_hypothesis && <p><span className="text-zinc-500">Problem: </span>{data.hypothesis.problem_hypothesis}</p>}
                        {data.hypothesis.opportunity_hypothesis && <p><span className="text-zinc-500">Opportunity: </span>{data.hypothesis.opportunity_hypothesis}</p>}
                        {data.hypothesis.why_uzu && <p><span className="text-zinc-500">Why UZU: </span>{data.hypothesis.why_uzu}</p>}
                        {data.hypothesis.why_now && <p><span className="text-zinc-500">Why now: </span>{data.hypothesis.why_now}</p>}
                        {data.hypothesis.confidence && <p className="text-zinc-500">Confidence: {data.hypothesis.confidence}</p>}
                      </div>
                    </Section>
                  )}

                  {data.company.contact_name && (
                    <Section title="Decision maker">
                      <p className="text-[11.5px] text-zinc-300">
                        {data.company.contact_name}{data.company.contact_title ? ` — ${data.company.contact_title}` : ''}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {data.company.contact_email ?? 'no email'} · status: {data.company.contact_email_status ?? 'unknown'}
                      </p>
                    </Section>
                  )}
                </div>
              )}

              {tab === 'emails' && (
                <div className="space-y-3">
                  {data.emails.length === 0 && <p className="text-[12px] text-zinc-600">No drafts yet.</p>}
                  {data.emails.map(e => (
                    <div key={e.id} className="rounded-lg bg-zinc-800/30 p-3.5 ring-1 ring-zinc-800/60">
                      <div className="flex items-center justify-between">
                        <p className="text-[12.5px] font-medium text-zinc-200">{e.subject}</p>
                        <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-[10.5px] text-zinc-400">{e.status}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-[11.5px] leading-relaxed text-zinc-300">{e.body}</p>
                      <p className="mt-2 text-[10.5px] text-zinc-600">
                        {e.sent_at ? `sent ${e.sent_at}` : `drafted ${e.created_at ?? ''}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'linkedin' && (
                <div className="space-y-3">
                  {data.linkedinActions.length === 0 && <p className="text-[12px] text-zinc-600">No LinkedIn actions queued.</p>}
                  {data.linkedinActions.map(a => (
                    <LinkedinCard key={a.id} action={a} isAdmin={isAdmin} onDecision={handleDecision} />
                  ))}
                </div>
              )}

              {tab === 'replies' && (
                <div className="space-y-3">
                  {data.replies.length === 0 && <p className="text-[12px] text-zinc-600">No replies yet.</p>}
                  {data.replies.map(r => (
                    <div key={r.id} className="rounded-lg bg-zinc-800/30 p-3.5 ring-1 ring-zinc-800/60">
                      <div className="flex items-center justify-between">
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-medium text-emerald-300">
                          {r.classification ?? 'unclassified'}
                        </span>
                        <span className="text-[10.5px] text-zinc-600">{r.channel} · {r.received_at}</span>
                      </div>
                      {r.body && <p className="mt-2 whitespace-pre-wrap text-[11.5px] text-zinc-300">{r.body}</p>}
                      {r.next_action && <p className="mt-2 text-[11px] text-cyan-300">Next: {r.next_action}</p>}
                    </div>
                  ))}
                </div>
              )}

              {tab === 'research' && (
                <div className="space-y-2">
                  {data.findings.length === 0 && <p className="text-[12px] text-zinc-600">No findings recorded.</p>}
                  {data.findings.map((f, i) => (
                    <div key={i} className="rounded-lg bg-zinc-800/30 p-3 ring-1 ring-zinc-800/60">
                      <div className="flex items-center justify-between">
                        <span className="text-[10.5px] uppercase tracking-wide text-zinc-500">{f.category ?? 'general'}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          f.evidence_label === 'FACT' ? 'bg-emerald-500/15 text-emerald-300'
                          : f.evidence_label === 'INFERENCE' ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-zinc-700/40 text-zinc-400'
                        }`}>{f.evidence_label}</span>
                      </div>
                      <p className="mt-1.5 text-[11.5px] leading-relaxed text-zinc-300">{f.finding}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
