'use client'

import { useState } from 'react'

/**
 * Client-facing explanation of how a candidate is handled, and where the money goes.
 *
 * Written for a non-technical reader: no field names, no jargon, no internal terminology. Every
 * claim here is literally what the automation does — the ordering of the checks below is the
 * ordering in the code, and the "free" vs "paid" split is real, not a simplification.
 */

const STEPS: { n: string; title: string; body: string; cost: 'free' | 'paid' | 'included' }[] = [
  {
    n: '1',
    title: 'Read the search results and keep everything on them',
    body:
      'Dentist Job Cafe lists the candidates matching our filters. We record everything that list shows — role, specialty, state, licences, when they registered, when they were last active, whether they have a CV attached, and their profile address. All of it is stored, for every candidate, even ones we do not act on. Browsing the list costs nothing.',
    cost: 'free',
  },
  {
    n: '2',
    title: 'Skip anyone already dealt with',
    body:
      'Everyone we have handled before is remembered and passed straight over. The exception is candidates we were blocked from opening because the monthly allowance had run out — those were never actually checked, so they come back into the queue once views are available again.',
    cost: 'free',
  },
  {
    n: '3',
    title: 'Match their profile address against Salesforce',
    body:
      'Every candidate has a unique profile address on Dentist Job Cafe. If a Salesforce contact already carries that exact address, it is certainly the same person, and we skip them.',
    cost: 'free',
  },
  {
    n: '4',
    title: 'Match their name — confirmed by their registration date',
    body:
      'If the list shows a full name, we look for it in Salesforce. A name on its own is not proof: different people share names, and we hold dozens of such pairs. So where we know when a Salesforce contact first registered on Dentist Job Cafe, we require that date to match too. If the dates disagree, it is a different person and we do not skip them. If two contacts share the name and we cannot tell them apart, we do not guess — we pay to open the profile.',
    cost: 'free',
  },
  {
    n: '5',
    title: 'Put the most promising candidates first',
    body:
      'Whoever is left is queued with CV-holders at the front. A candidate with a CV attached becomes a usable contact around a fifth of the time; one without, almost never. Nobody is dropped for lacking a CV — but if the budget runs out partway through, it runs out on the least promising candidates rather than the best ones.',
    cost: 'free',
  },
  {
    n: '6',
    title: 'Open the profile — the only step that costs',
    body:
      'Now we open the profile, which uses one Profile View from the monthly allowance. Dentist Job Cafe hides phone numbers, email addresses and CVs until a profile is opened, so there is no way to know who someone is, or whether they are worth contacting, without paying for this step. Each run also has a hard ceiling on how many views it may spend, so nothing can drain the allowance in one go.',
    cost: 'paid',
  },
  {
    n: '7',
    title: 'Take their contact details',
    body:
      'Still inside the profile we just opened, we take the phone number and email. If those are missing, we read their CV and pull the details from there. The CV does most of the work — most successful contacts come from it rather than from the profile itself.',
    cost: 'included',
  },
  {
    n: '8',
    title: 'One last duplicate check, then add to Salesforce',
    body:
      'Now that we have a phone number and email — the details that were hidden until we paid — we check Salesforce once more. Some people turn out to be on file under details we could not see earlier. Everyone genuinely new is created as a Salesforce contact with their CV attached.',
    cost: 'included',
  },
]

export default function DjcHowItWorks() {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700/50 dark:bg-zinc-800/20 dark:shadow-none">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <span className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">
          How a candidate is handled — and where the cost comes from
        </span>
        <span className="text-xs text-zinc-500">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-zinc-200 dark:border-zinc-700/50 px-5 py-4">
          <p className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            Dentist Job Cafe charges per profile opened, from a monthly allowance. Five steps run
            before we open anything, so duplicates are removed at no cost and the remaining budget
            goes to the most promising candidates first. Only those who survive all five are paid
            for — and each costs{' '}
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">exactly one view in total</span>, however
            much we do once the profile is open.
          </p>

          <ol className="space-y-3">
            {STEPS.map(s => (
              <li key={s.n} className="flex gap-3">
                <span
                  className={
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ' +
                    (s.cost === 'free'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/25'
                      : s.cost === 'paid'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/25'
                        : 'bg-zinc-600/20 text-zinc-700 dark:text-zinc-400 ring-1 ring-zinc-500/25')
                  }
                >
                  {s.n}
                </span>
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-zinc-800 dark:text-zinc-200">
                    {s.title}
                    <span
                      className={
                        'ml-2 rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ' +
                        (s.cost === 'free'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : s.cost === 'paid'
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                            : 'bg-zinc-600/15 text-zinc-700 dark:text-zinc-400')
                      }
                    >
                      {s.cost === 'free'
                        ? 'NO COST'
                        : s.cost === 'paid'
                          ? 'USES 1 VIEW'
                          : 'SAME VIEW — NO EXTRA COST'}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="border-t border-zinc-200 dark:border-zinc-700/40 pt-3 text-[11px] leading-relaxed text-zinc-500">
            <span className="font-medium text-zinc-700 dark:text-zinc-400">Why some views still find nothing:</span>{' '}
            whether a candidate is already on file, or has no reachable contact details at all, is
            hidden until the profile is opened. That is how the platform is built, not a gap in the
            process — so a share of views will always come back empty. Everything above exists to
            keep that share small, and to make sure the views that are spent go to the candidates
            most likely to be worth it.
          </p>
        </div>
      )}
    </div>
  )
}
