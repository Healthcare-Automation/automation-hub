process.env.DJC_DATABASE_URL = process.env.DJC_DATABASE_URL!.replace(':5432/', ':6543/')
process.env.DATABASE_URL = process.env.DATABASE_URL!.replace(':5432/', ':6543/')
async function main() {
  const { getDjcOverview } = await import('../lib/djcPipeline')
  const { getKimedicsSnapshot } = await import('../lib/impact')
  let t = Date.now()
  const o = await getDjcOverview()
  console.log('overview:', Date.now() - t, 'ms, placements:', o?.placementsAllTime)
  t = Date.now()
  const s = await getKimedicsSnapshot()
  console.log('kim snapshot:', Date.now() - t, 'ms, hours:', s?.hoursSaved)
  process.exit(0)
}
main().catch(e => { console.log('ERROR:', e.message); process.exit(1) })
