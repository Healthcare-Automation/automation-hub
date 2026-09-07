import { config } from 'dotenv'
config({ path: '.env.local' })

import { getDemoOrgAndUser } from '../lib/marketingDemoActor'
import { generateStatCardImage } from '../lib/marketing/imageGenerator'
import { getInstagramDraftsMissingImage, setInstagramDraftImage } from '../lib/marketingQueries'
import sql from '../lib/db'

/** One-off backfill for Instagram drafts that predate image generation
 * (INSTAGRAM_IMAGE_BRIEF.md). Safe to re-run — only targets drafts with image_url still
 * null, so a draft already imaged (by this script or the live pipeline) is skipped. */
async function main() {
  const { orgId } = await getDemoOrgAndUser()
  const drafts = await getInstagramDraftsMissingImage(orgId)
  console.log(`Backfilling ${drafts.length} draft(s) missing an image.`)

  for (const draft of drafts) {
    const image = await generateStatCardImage({
      stylePrompt: draft.imagePrompt,
      statOrQuote: draft.hookLine,
      citationSource: draft.sourceUrls[0] ?? null,
    })
    if (!image) {
      console.error(`Draft ${draft.id}: image generation failed, left without an image.`)
      continue
    }
    await setInstagramDraftImage(draft.id, image.bytes)
    console.log(`Draft ${draft.id}: generated image (${image.bytes.length} bytes).`)
  }

  await sql.end({ timeout: 5 })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
