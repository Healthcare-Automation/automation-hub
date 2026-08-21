// Ad-hoc: confirm the hub can read the Mohamed run ledger with MOHAMED_DATABASE_URL.
// Usage: MOHAMED_DATABASE_URL=... npx tsx scripts/mohamed-ledger-check.ts
import { getMohamedLedger, getMohamedRunHistory } from '../lib/mohamedQueries'
import { describeFailure, ledgerLooksPhiFree, summariseClaims } from '../lib/mohamedLedger'

async function main() {
  const history = await getMohamedRunHistory()
  const ledger = await getMohamedLedger()
  console.log('history rows:', history.length, history.map(h => `${h.runId.slice(0, 8)} ${h.status} ${h.eventCount}ev ${h.source}`))
  if (!ledger) {
    console.log('NO LEDGER')
    process.exit(1)
  }
  console.log('latest run:', ledger.run_id.slice(0, 8), ledger.status, ledger.events.length, 'events | stopped at:', describeFailure(ledger))
  console.log('stages:', ledger.stages.map(s => `${s.stage}=${s.status}`).join(' '))
  console.log('claims:', summariseClaims(ledger).map(c => `${c.claimRef}:${c.reachedReview ? 'review' : 'FAIL'}:${c.portalActions}`).join(' '))
  console.log('phi-free:', ledgerLooksPhiFree(ledger))
  process.exit(0)
}
main().catch(error => { console.error(error?.name ?? 'error'); process.exit(1) })
