import { unstable_cache } from 'next/cache'
import { getDjcPipeline, getPipelineFunnel, getSpecialtyOutcomes } from '@/lib/djcPipeline'
import type { PipelineRange } from '@/lib/djcTypes'
import { withDbRetry, isPoolSaturation } from '@/lib/dbRetry'
import PipelineView from '@/components/djc/PipelineView'

export const revalidate = 60

const getCachedPipeline = unstable_cache(() => getDjcPipeline(), ['djc-pipeline'], { revalidate: 60 })
const getCachedFunnel = unstable_cache(
  (r: PipelineRange) => getPipelineFunnel(r), ['djc-pipeline-funnel'], { revalidate: 60 })
// All three windows arrive together, so the specialty toggle switches instantly without a
// round-trip — and without opening a pooler connection per click.
const getCachedOutcomes = unstable_cache(
  () => getSpecialtyOutcomes(), ['djc-specialty-outcomes'], { revalidate: 300 })

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const { range: raw } = await searchParams
  const range: PipelineRange = raw === '7d' || raw === '30d' ? raw : 'all'

  let data = null
  let funnel = null
  let outcomes = null
  let busy = false
  try {
    // Sequential, for the same connection-cap reason as the overview.
    data = await withDbRetry(() => getCachedPipeline())
    funnel = await withDbRetry(() => getCachedFunnel(range)).catch(() => null)
    outcomes = await withDbRetry(() => getCachedOutcomes()).catch(() => null)
  } catch (err) {
    busy = isPoolSaturation(err)
    console.error('Failed to load DJC pipeline:', err)
  }
  if (data) return <PipelineView data={data} funnel={funnel} range={range} outcomes={outcomes} />
  return (
    <p className="text-sm text-zinc-500">
      {busy
        ? 'The database is busy right now. Refresh in a few seconds — nothing is wrong with the data.'
        : 'Pipeline unavailable — could not read pipeline data.'}
    </p>
  )
}
