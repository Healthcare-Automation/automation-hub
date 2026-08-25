import {
  LEDGER_STAGES,
  STAGE_LABELS,
  describeFailure,
  summariseClaims,
  type RunLedgerSnapshot,
  type StageSummary,
} from '@/lib/mohamedLedger'
import { RunReviewLink } from './RunReviewLink'

const stageStyles: Record<StageSummary['status'], string> = {
  passed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  blocked: 'bg-amber-50 text-amber-800 border-amber-200',
  failed: 'bg-red-50 text-red-800 border-red-200',
  not_run: 'bg-stone-50 text-stone-500 border-stone-200',
}

const eventStyles: Record<string, string> = {
  ok: 'text-emerald-700',
  started: 'text-stone-500',
  skipped: 'text-stone-500',
  blocked: 'text-amber-700',
  failed: 'text-red-700 font-semibold',
}

function clock(iso: string) {
  return iso.slice(11, 23)
}

function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

export function RunTrace({ ledger }: { ledger: RunLedgerSnapshot }) {
  const failure = describeFailure(ledger)
  const claims = summariseClaims(ledger)
  const stageByName = new Map(ledger.stages.map(stage => [stage.stage, stage]))

  return (
    <section className="mt-7">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Run trace</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            {ledger.run_id.slice(0, 12)} · {ledger.mode} · {ledger.source.replaceAll('_', ' ')} · {ledger.events.length} events
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            ledger.status === 'failed'
              ? 'bg-red-50 text-red-800'
              : ledger.status === 'blocked'
                ? 'bg-amber-50 text-amber-800'
                : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          {ledger.status === 'review_ready' ? 'Reached review' : ledger.status === 'blocked' ? 'Rows blocked' : 'Failed'}
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-6">
        {LEDGER_STAGES.map(name => {
          const stage = stageByName.get(name) ?? { stage: name, status: 'not_run' as const, events: 0 }
          return (
            <div key={name} className={`rounded-xl border p-3 ${stageStyles[stage.status]}`}>
              <p className="text-xs font-semibold">{STAGE_LABELS[name]}</p>
              <p className="mt-1 text-[11px] opacity-80">
                {stage.status.replace('_', ' ')} · {stage.events} event{stage.events === 1 ? '' : 's'}
              </p>
            </div>
          )
        })}
      </div>

      {failure ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="text-xs font-semibold uppercase tracking-wider">Stopped at</p>
          <p className="mt-1 font-mono text-xs">{failure}</p>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Every assembled claim reached HCPF Review. Nothing was submitted.
        </div>
      )}

      {claims.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="border-b border-stone-200 px-5 py-3">
            <h3 className="text-sm font-semibold">Claims in this run</h3>
            <p className="mt-0.5 text-xs text-stone-500">
              Claim refs are keyed hashes — no member ID, name, or date is stored or shown. Procedure, modifiers,
              units, and charge are real billing specifics (not member-identifying) so a live run can be verified.
            </p>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 text-stone-500">
              <tr>
                {['Claim ref', 'Procedure', 'Modifiers', 'Units', 'Charge', 'Portal actions', 'Result', 'Stopped at', 'Review'].map(label => (
                  <th key={label} className="px-4 py-2 font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {claims.map(claim => (
                <tr key={claim.claimRef}>
                  <td className="px-4 py-2 font-mono">{claim.claimRef}</td>
                  <td className="px-4 py-2 font-mono uppercase">{claim.procedureCode ?? '—'}</td>
                  <td className="px-4 py-2 font-mono uppercase">{claim.modifiers && claim.modifiers !== 'none' ? claim.modifiers.replaceAll('_', ', ') : '—'}</td>
                  <td className="px-4 py-2">{claim.unitsX100 != null ? (claim.unitsX100 / 100).toFixed(2) : '—'}</td>
                  <td className="px-4 py-2">{claim.chargeCents != null ? money(claim.chargeCents) : '—'}</td>
                  <td className="px-4 py-2">{claim.portalActions}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${claim.reachedReview ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                      {claim.reachedReview ? 'Reached review' : 'Did not reach review'}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-stone-600">
                    {claim.failureCode ? [claim.failureField, claim.failureCode].filter(Boolean).join(' · ') : '—'}
                  </td>
                  <td className="px-4 py-2">
                    {claim.reachedReview ? (
                      <RunReviewLink runId={ledger.run_id} claimRef={claim.claimRef} label="View" />
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="mt-4 rounded-2xl border border-stone-200 bg-white">
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">All events ({ledger.events.length})</summary>
        <div className="overflow-x-auto border-t border-stone-200">
          <table className="w-full min-w-[900px] text-left text-[11px]">
            <thead className="bg-stone-50 text-stone-500">
              <tr>
                {['#', 'Time (UTC)', 'Stage', 'Step', 'Status', 'Claim', 'Action', 'Field', 'Code', 'Detail', 'ms'].map(label => (
                  <th key={label} className="px-3 py-2 font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-mono">
              {ledger.events.map(event => (
                <tr key={event.seq} className={event.status === 'failed' ? 'bg-red-50' : ''}>
                  <td className="px-3 py-1.5 text-stone-400">{event.seq}</td>
                  <td className="px-3 py-1.5 text-stone-500">{clock(event.at)}</td>
                  <td className="px-3 py-1.5">{event.stage}</td>
                  <td className="px-3 py-1.5">{event.step}</td>
                  <td className={`px-3 py-1.5 ${eventStyles[event.status] ?? ''}`}>{event.status}</td>
                  <td className="px-3 py-1.5 text-stone-500">{event.claim_ref ?? ''}</td>
                  <td className="px-3 py-1.5">{event.action ?? ''}</td>
                  <td className="px-3 py-1.5">{event.field ?? ''}</td>
                  <td className="px-3 py-1.5">{event.code ?? ''}</td>
                  <td className="px-3 py-1.5 text-stone-500">
                    {Object.entries(event.detail).map(([key, value]) => `${key}=${value}`).join(' ')}
                  </td>
                  <td className="px-3 py-1.5 text-stone-400">{event.duration_ms ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
