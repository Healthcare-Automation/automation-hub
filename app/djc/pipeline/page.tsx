import { getDjcPipeline } from '@/lib/djcPipeline'
import PipelineView from '@/components/djc/PipelineView'

export const revalidate = 60

export default async function PipelinePage() {
  let data = null
  try {
    data = await getDjcPipeline()
  } catch (err) {
    console.error('Failed to load DJC pipeline:', err)
  }
  return data ? (
    <PipelineView data={data} />
  ) : (
    <p className="text-sm text-zinc-500">Pipeline unavailable — could not read pipeline data.</p>
  )
}
