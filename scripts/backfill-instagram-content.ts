import { config } from 'dotenv'
config({ path: '.env.local' })

import { getDemoOrgAndUser } from '../lib/marketingDemoActor'
import { runInstagramGeneration } from '../lib/marketingInstagramPipeline'
import sql from '../lib/db'

/** Runs the Instagram generation pipeline N times in a row (default 10) to build up a
 * reviewable backlog beyond the Mon/Wed/Fri cron cadence — see the 2026-09-08 carousel
 * redesign brief's volume goal (~20 drafts total). Each call is a full independent
 * generate-plan -> research -> synthesize -> render-carousel pass; the generator's own
 * recent-fingerprint/feedback biasing (instagramGenerator.ts's planTopic) is what keeps
 * consecutive runs from converging on the same 2-3 themes, since each run re-reads the
 * growing draft history before picking its angle. Stops early (does not throw) if a run
 * fails outright, so a mid-batch failure doesn't lose the drafts already created.
 *
 * Usage: npm run instagram:backfill -- 10   (or default 10 if no count given) */
async function main() {
  const count = Number.parseInt(process.argv[2] ?? '10', 10)
  const { orgId } = await getDemoOrgAndUser()

  const mainIdeas: string[] = []
  let created = 0
  let failed = 0

  for (let i = 0; i < count; i++) {
    console.log(`\n--- Run ${i + 1}/${count} ---`)
    try {
      const result = await runInstagramGeneration(orgId)
      if (result.draftId) {
        created++
        console.log(`Draft ${result.draftId}: ${result.slidesRendered} slide(s) rendered.`)
      } else {
        failed++
        console.error(`Run ${i + 1} skipped: ${result.skippedReason}`)
      }
    } catch (err) {
      failed++
      console.error(`Run ${i + 1} threw:`, err instanceof Error ? err.message : err)
    }
  }

  console.log(`\nBackfill done: ${created} created, ${failed} failed/skipped, out of ${count} requested.`)
  await sql.end({ timeout: 5 })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
