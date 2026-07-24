import { unstable_cache } from 'next/cache'
import { getDjcInsights } from '@/lib/djcInsights'
import DjcInsightsPanel from '@/components/DjcInsightsPanel'

/** Candidate-pool analytics (talent, specialties, locations, experience, rating). */
const getCached = unstable_cache(() => getDjcInsights('all'), ['djc-insights-candidates'], { revalidate: 60 })

export const revalidate = 60

export default async function CandidatesPage() {
  let data = null
  try {
    data = await getCached()
  } catch (err) {
    console.error('Failed to load DJC candidates view:', err)
  }
  return data ? (
    <DjcInsightsPanel data={data} view="candidates" />
  ) : (
    <p className="text-sm text-zinc-500">Candidates view unavailable — could not read candidate data.</p>
  )
}
