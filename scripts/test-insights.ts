import 'dotenv/config'
import { getDjcInsights, drillDjcCandidates } from '../lib/djcInsights'

async function main() {
  const d = await getDjcInsights()
  if (!d) throw new Error('DJC_DATABASE_URL not configured')
  console.log('totals:', d.totals)
  console.log('funnel:', d.funnel.map(f => `${f.key}=${f.count}`).join(' '))
  console.log('sources:', d.contactSources)
  console.log('specialties[0..2]:', d.specialties.slice(0, 3))
  console.log('states[0..4]:', d.states.slice(0, 5))
  console.log('experience:', d.experience)
  console.log('gradYears:', d.gradYears)
  console.log('activity.overall:', d.activity.overall)
  console.log('cohorts (last 4):', d.registeredCohorts.slice(-4))
  console.log('dropoff:', d.dropoff)
  console.log('rating:', d.rating)
  console.log('views days:', d.viewsBurndown.length, 'latest:', d.viewsBurndown.at(-1))
  console.log('sightingsSince:', d.sightingsSince)

  for (const [dim, value] of [
    ['funnel', 'netNew'], ['contact_source', 'cv'], ['specialty', 'Pediatrics'],
    ['experience', '10-19'], ['rating', '80-100'], ['state', 'Florida'],
  ] as const) {
    const rows = await drillDjcCandidates(dim, value)
    console.log(`drill ${dim}=${value}: ${rows?.length} rows; first:`, rows?.[0]?.name, rows?.[0]?.rating)
  }
  const bad = await drillDjcCandidates('evil; drop table', 'x')
  console.log('unknown dim returns:', bad)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
