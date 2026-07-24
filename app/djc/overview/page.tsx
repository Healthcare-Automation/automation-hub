import { getDjcOverview } from '@/lib/djcPipeline'
import { getKimedicsSnapshot } from '@/lib/impact'
import OverviewView from '@/components/djc/OverviewView'

export const revalidate = 60

export default async function OverviewPage() {
  let data = null
  let kimedics = null
  try {
    ;[data, kimedics] = await Promise.all([
      getDjcOverview(),
      getKimedicsSnapshot().catch(() => null),
    ])
  } catch (err) {
    console.error('Failed to load DJC overview:', err)
  }
  return data ? (
    <OverviewView data={data} kimedics={kimedics} />
  ) : (
    <p className="text-sm text-zinc-500">Overview unavailable — could not read pipeline data.</p>
  )
}
