'use client'

import { cn } from '@/lib/utils'
import { CHART } from '@/lib/chartTokens'
import type { OutreachDetail, OutreachMonth } from '@/lib/djcOps'

/**
 * Reaching a candidate, as distinct from trying to.
 *
 * An earlier version read the call log as an effort measure and concluded "persistence is the whole
 * game" — more calls, more placements. That is almost certainly backwards. A recruiter calls a
 * promising candidate repeatedly BECAUSE they are promising; the calls are a screening step, not a
 * cause. Salesforce even names the disposition "Connected - Screened".
 *
 * So this measures what can be measured honestly: whether an attempt ever became contact. Most
 * logged "calls" are texts, and a text nobody opens is not contact. What the data cannot say — why
 * a recruiter stopped, what was said, whether the candidate declined — is stated outright at the
 * bottom rather than inferred past.
 */
export default function Outreach({
  detail, months,
}: {
  detail: OutreachDetail
  months: OutreachMonth[]
}) {
  const reach = detail.reach ?? []
  const base = reach[0]?.people || 1
  const attempted = reach[1]?.people ?? 0
  const spoke = reach[3]?.people ?? 0
  const forwarded = reach[4]?.people ?? 0
  const smsReadRate = detail.smsSent ? Math.round((detail.smsRead / detail.smsSent) * 100) : 0

  return (
    <div className="space-y-9">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={String(attempted)} label="someone tried to reach"
              detail={`of ${base} sourced`} tone="text-cyan-700 dark:text-cyan-300" />
        <Stat value={String(spoke)} label="ever actually spoke to us"
              detail="a two-way conversation was logged" tone="text-teal-700 dark:text-teal-300" />
        <Stat value={String(detail.onlyFailed)} label="tried but never reached"
              detail="texted or called, no response at all" tone="text-orange-700 dark:text-orange-300" />
        <Stat value={`${detail.convThenForward} of ${forwarded}`} label="put forward had spoken first"
              detail="a conversation nearly always precedes it" tone="text-zinc-800 dark:text-zinc-200" />
      </div>

      <section>
        <h3 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">Trying is not the same as reaching</h3>
        <p className="mt-0.5 max-w-3xl text-[12px] leading-relaxed text-zinc-500">
          Most logged &ldquo;calls&rdquo; are texts — {detail.smsSent.toLocaleString()} of them against a
          few hundred phone calls. A text nobody opens is an attempt, not a contact.
        </p>

        <div className="mt-4 space-y-1.5">
          {reach.map((s, i) => {
            const prev = i === 0 ? null : reach[i - 1]
            const lost = prev ? prev.people - s.people : 0
            return (
              <div key={s.label}>
                {prev && lost > 0 && (
                  <div className="flex items-center gap-3 py-1">
                    <span className="w-36 shrink-0" />
                    <span className="flex grow items-center gap-2">
                      <span className="text-[10px] tabular-nums text-orange-700 dark:text-orange-300/60">−{lost}</span>
                      <span className="h-px grow bg-zinc-200 dark:bg-zinc-800" />
                    </span>
                    <span className="w-16 shrink-0" />
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <span className="w-36 shrink-0 text-[12px] leading-tight text-zinc-700 dark:text-zinc-300">
                    {s.label}
                    <span className="block text-[10px] text-zinc-500 dark:text-zinc-600">{s.note}</span>
                  </span>
                  <span className={cn('relative h-5 grow rounded', CHART.track)}>
                    <span className={cn('absolute inset-y-0 left-0 rounded',
                      i === reach.length - 1 ? CHART.good : CHART.primary)}
                          style={{ width: `${Math.max((s.people / base) * 100, 0.8)}%` }} />
                  </span>
                  <span className="w-16 shrink-0 text-right text-[13px] font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {s.people}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <p className="mt-4 max-w-3xl text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          The drop is not recruiters failing to try — it is{' '}
          <span className="text-orange-700 dark:text-orange-300">
            {detail.onlyFailed} candidates who were texted or called and never responded at all
          </span>
          . Of {base} sourced, {attempted} had an attempt made and only {spoke} got into a
          conversation. Reachability, not effort, is where this fails.
        </p>
      </section>

      <section>
        <h3 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">Which channel actually lands</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <Channel label="Text" value={detail.smsSent.toLocaleString()} tone="text-cyan-700 dark:text-cyan-300"
                   detail={`${smsReadRate}% opened. The workhorse, and the only channel with a read receipt.`} />
          <Channel label="Phone" value={detail.conversations.toLocaleString()} tone="text-teal-700 dark:text-teal-300"
                   detail="conversations logged. This is the screening step — a placement almost never happens without one." />
          <Channel label="Email" value={detail.email.sent.toLocaleString()} tone="text-zinc-800 dark:text-zinc-200"
                   detail={`to ${detail.email.contacts} candidates · ${detail.email.openRate}% opened · ${detail.email.replyRate}% replied · ${detail.email.bounced} bounced.`} />
        </div>
      </section>

      {months.length > 0 && (
        <section>
          <h3 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">Is anyone getting to the new ones?</h3>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            Of the candidates added each month, how many have had any attempt made.
          </p>
          <div className="mt-4 space-y-2">
            {months.map(m => {
              const pct = m.sourced ? Math.round((m.contacted / m.sourced) * 100) : 0
              return (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-[12px] text-zinc-600 dark:text-zinc-400">
                    {new Date(m.month + '-02').toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })}
                  </span>
                  <span className={cn('relative h-5 grow rounded', CHART.track)}>
                    <span className={cn('absolute inset-y-0 left-0 rounded', CHART.primary)}
                          style={{ width: `${Math.max(pct, 1)}%` }} />
                  </span>
                  <span className="w-14 shrink-0 text-right text-[13px] font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                    {pct}%
                  </span>
                  <span className="w-32 shrink-0 text-right text-[11px] tabular-nums text-zinc-500 dark:text-zinc-600">
                    {m.contacted} of {m.sourced}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Stated plainly — inferring past these gaps is exactly how the previous version went wrong. */}
      <section className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none/40 p-4">
        <h3 className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-200">What this data cannot tell us</h3>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-zinc-500">
          <li>
            <span className="text-zinc-600 dark:text-zinc-400">Why a recruiter stopped.</span> One attempt then silence
            could be a bad number, a candidate who declined, or a queue nobody got back to. The log
            records the attempt, never the reason.
          </li>
          <li>
            <span className="text-zinc-600 dark:text-zinc-400">What was said.</span> A logged conversation might have
            ended in &ldquo;not interested&rdquo; or &ldquo;call me next month&rdquo;. Both look identical here.
          </li>
          <li>
            <span className="text-zinc-600 dark:text-zinc-400">Whether more calls cause more placements.</span> Candidates
            called repeatedly do convert better, but recruiters almost certainly call promising people
            more — cause and effect are tangled and this data cannot separate them. Read it as a
            description, not a lever.
          </li>
          <li>
            <span className="text-zinc-600 dark:text-zinc-400">Anything outside Salesforce.</span> A call from a personal
            mobile, a LinkedIn message or a chat at an event leaves no trace here.
          </li>
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
          Closing these gaps needs a walkthrough of how recruiters actually work a candidate, not more
          querying.
        </p>
      </section>
    </div>
  )
}

function Channel({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none/50 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
        <span className={cn('text-[20px] font-semibold tabular-nums', tone)}>{value}</span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{detail}</p>
    </div>
  )
}

function Stat({ value, label, detail, tone }: { value: string; label: string; detail: string; tone: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none/50 px-4 py-3">
      <p className={cn('text-[24px] leading-none font-semibold tabular-nums', tone)}>{value}</p>
      <p className="mt-1.5 text-[12px] leading-tight text-zinc-700 dark:text-zinc-300">{label}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-zinc-500 dark:text-zinc-600">{detail}</p>
    </div>
  )
}
