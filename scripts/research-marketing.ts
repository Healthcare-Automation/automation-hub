import { config } from 'dotenv'
config({ path: '.env.local' })

import { getDemoOrgAndUser } from '../lib/marketingDemoActor'
import { runFullPipeline } from '../lib/marketingPipeline'

/** Manual, local equivalent of the admin "Run research now" button / the
 * /api/cron/marketing-research route — same runFullPipeline call, run from the CLI
 * instead of over HTTP. Useful for a one-off run or debugging without starting `next dev`. */
async function main() {
  const { orgId } = await getDemoOrgAndUser()
  const result = await runFullPipeline({ orgId, triggeredBy: 'manual' })
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
