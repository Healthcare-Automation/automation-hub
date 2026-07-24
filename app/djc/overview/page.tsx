import { getDjcOverview } from '@/lib/djcPipeline'
import OverviewView from '@/components/djc/OverviewView'

export const revalidate = 60

export default async function OverviewPage() {
  let data = null
  try {
    data = await getDjcOverview()
  } catch (err) {
    console.error('Failed to load DJC overview:', err)
  }
  return data ? (
    <OverviewView data={data} />
  ) : (
    <p className="text-sm text-zinc-500">Overview unavailable — could not read pipeline data.</p>
  )
}
