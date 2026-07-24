import { getImpactData } from '@/lib/impact'
import ImpactView from '@/components/impact/ImpactView'

export const revalidate = 300

export default async function ImpactPage() {
  let data = null
  try {
    data = await getImpactData()
  } catch (err) {
    console.error('Failed to load impact data:', err)
  }
  return data ? (
    <ImpactView data={data} />
  ) : (
    <p className="text-sm text-zinc-500">Impact analysis unavailable — could not read automation data.</p>
  )
}
