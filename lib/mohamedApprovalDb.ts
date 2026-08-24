import postgres from 'postgres'

declare global {
  // eslint-disable-next-line no-var
  var _mohamedApprovalPgSql: ReturnType<typeof postgres> | null | undefined
}

/**
 * Separate connection from mohamedDb.ts's read-only mohamed_hub_reader:
 * this one uses mohamed_hub_approver, which can only insert/update
 * mohamed_claim_approvals — nothing else. Keeping the DSNs (and therefore
 * the roles) apart means a bug in the approval code path cannot touch
 * mohamed_runs/mohamed_run_events even in principle, not just by policy.
 */
function createApprovalSql(): ReturnType<typeof postgres> | null {
  const url = process.env.MOHAMED_APPROVAL_DATABASE_URL
  if (!url) return null
  // Same guard as mohamedDb.ts: `vercel env pull` writes "[SENSITIVE]" for
  // Sensitive-flagged vars; anything that isn't a postgres URL is unset.
  if (!url.startsWith('postgres')) return null
  return postgres(url, {
    ssl: 'require',
    max: 2,
    idle_timeout: 2,
    // NO max_lifetime: its recycle timer fires on thaw after a Vercel
    // function freeze and terminates an already-destroyed socket, which
    // postgres.js raises as an unhandled rejection that crashes the render
    // (see lib/mohamedDb.ts, 2026-08-24). idle_timeout alone retires sockets.
    connect_timeout: 10,
    prepare: false,
    connection: { application_name: 'automation-hub-mohamed-approval' },
  })
}

const mohamedApprovalSql = globalThis._mohamedApprovalPgSql ?? createApprovalSql()

if (process.env.NODE_ENV !== 'production') {
  globalThis._mohamedApprovalPgSql = mohamedApprovalSql
}

export const isMohamedApprovalConfigured = mohamedApprovalSql !== null
export default mohamedApprovalSql
