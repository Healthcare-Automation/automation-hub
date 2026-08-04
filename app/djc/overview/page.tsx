import { unstable_cache } from 'next/cache'
import { getDjcStory } from '@/lib/djcStory'
import { withDbRetry, isPoolSaturation } from '@/lib/dbRetry'
import StoryOverview from '@/components/djc/StoryOverview'

export const revalidate = 60

// One database round trip a minute, shared by every serverless instance.
// Key carries a shape version: the cached payload is a plain object, so renaming a field (ready ->
// ready50/ready250/readyAny) leaves stale entries that satisfy the type at compile time and are
// undefined at runtime. Bump this whenever DjcStory's shape changes.
const getCachedStory = unstable_cache(() => getDjcStory(), ['djc-story-overview-v17'], { revalidate: 60 })

export default async function OverviewPage() {
  let story = null
  let busy = false
  try {
    story = await withDbRetry(() => getCachedStory())
  } catch (err) {
    busy = isPoolSaturation(err)
    console.error('Failed to load DJC overview:', err)
  }
  if (story) return <StoryOverview story={story} />
  return (
    <p className="text-sm text-zinc-500">
      {busy
        ? 'The database is busy right now (a scraping run is holding connections). Refresh in a few seconds — nothing is wrong with the data.'
        : 'Overview unavailable — could not read pipeline data.'}
    </p>
  )
}
