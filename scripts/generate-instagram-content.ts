import { config } from 'dotenv'
config({ path: '.env.local' })

import { getDemoOrgAndUser } from '../lib/marketingDemoActor'
import { runInstagramGeneration } from '../lib/marketingInstagramPipeline'

/** Instagram content queue generation entrypoint (INSTAGRAM_QUEUE_BRIEF.md) — run by the
 * Mon/Wed/Fri Modal schedule (modal/marketing_research.py's run_instagram_content function)
 * and available for manual/local runs the same way scripts/research-marketing.ts is. */
async function main() {
  const { orgId } = await getDemoOrgAndUser()
  const result = await runInstagramGeneration(orgId)
  console.log(JSON.stringify(result, null, 2))
  if (!result.draftId) process.exit(1)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
