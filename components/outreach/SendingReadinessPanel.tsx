import type { SendingReadiness } from '@/lib/outreachQueries'

/**
 * Global send-readiness banner. Per uzu-deliverability-guardian this is a hard
 * gate, not a suggestion: andy@uzu.studio never sends scaled cold outreach, a
 * separate sending domain/mailbox must exist and pass SPF/DKIM/DMARC, and it
 * must warm up before any cold send. Everything below reads real DB state —
 * an empty sendingAccounts table correctly means "not ready," not a bug.
 */
export default function SendingReadinessPanel({ readiness }: { readiness: SendingReadiness }) {
  const { sendingAccounts, domainHealth, suppressionCount, pendingVerification } = readiness
  const hasSendingInfra = sendingAccounts.length > 0
  const activeAccount = sendingAccounts.find(a => a.status === 'active')
  const allDomainsHealthy = domainHealth.length > 0 &&
    domainHealth.every(d => d.spf_ok && d.dkim_ok && d.dmarc_ok && d.mx_ok)
  const ready = hasSendingInfra && !!activeAccount && allDomainsHealthy

  return (
    <div className={`mb-6 rounded-xl p-4 ring-1 ${
      ready
        ? 'bg-emerald-500/[0.06] ring-emerald-500/20'
        : 'bg-amber-500/[0.06] ring-amber-500/20'
    }`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`h-2 w-2 rounded-full ${ready ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
            {ready ? 'Sending infrastructure ready' : 'Draft-only mode — sending infrastructure not provisioned'}
          </p>
        </div>
        <span className="text-[10.5px] text-zinc-500 dark:text-zinc-600">
          Everything below stops at drafts until this clears.
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
        <ReadinessTile
          label="Sending mailbox"
          ok={hasSendingInfra}
          detail={hasSendingInfra
            ? `${sendingAccounts.length} account(s), ${activeAccount ? 'active' : 'not yet active'}`
            : 'None provisioned — needs a secondary UZU-attributable domain + mailbox'}
        />
        <ReadinessTile
          label="Domain auth (SPF/DKIM/DMARC/MX)"
          ok={allDomainsHealthy}
          detail={domainHealth.length === 0
            ? 'No domain registered yet'
            : domainHealth.map(d => `${d.domain}: ${[
                d.spf_ok ? 'SPF✓' : 'SPF✗', d.dkim_ok ? 'DKIM✓' : 'DKIM✗',
                d.dmarc_ok ? 'DMARC✓' : 'DMARC✗', d.mx_ok ? 'MX✓' : 'MX✗',
              ].join(' ')}`).join('; ')}
        />
        <ReadinessTile
          label="Email verification"
          ok={pendingVerification === 0}
          detail={pendingVerification === 0
            ? 'No unverified contacts blocking send'
            : `${pendingVerification} contact(s) with unknown/risky email status — never send to these`}
        />
        <ReadinessTile
          label="Suppression list"
          ok={true}
          detail={`${suppressionCount} suppressed contact(s), permanently excluded`}
        />
      </div>

      {!ready && (
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          Once a secondary domain + mailbox exist: register the domain in <code className="text-[10.5px]">sending_accounts</code>,
          run the DNS health check to populate <code className="text-[10.5px]">domain_health</code>, complete the 30-day
          age minimum + 4-week warmup ramp (5→10→15→20/day), then flip the account to <code className="text-[10.5px]">active</code>.
          Andy's primary mailbox stays untouched throughout — see uzu-deliverability-guardian.
        </p>
      )}
    </div>
  )
}

function ReadinessTile({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="rounded-lg bg-white/60 ring-zinc-200 dark:bg-zinc-900/40 dark:ring-zinc-800/50 p-2.5 ring-1">
      <div className="flex items-center gap-1.5">
        <span className={`text-[11px] ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
          {ok ? '✓' : '○'}
        </span>
        <span className="text-[10.5px] font-medium uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{label}</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-zinc-700 dark:text-zinc-300">{detail}</p>
    </div>
  )
}
