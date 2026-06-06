import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' })

async function main() {
  const ids = ['a015f00000KxRpaAAF', 'a01UP00000fw2ORYAY']

  console.log('=== Any job_event_log mention of either SF ID? ===')
  for (const id of ids) {
    const rows = await sql`
      SELECT id, run_id, job_id, event_type, created_at, payload
      FROM job_event_log
      WHERE payload::text ILIKE ${'%' + id + '%'}
      ORDER BY id ASC
      LIMIT 30
    `
    console.log(`\n--- ${id}: ${rows.length} events ---`)
    for (const r of rows.slice(0, 15)) {
      const p = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload
      const source = p?.source ?? p?.reason ?? ''
      console.log(`  #${r.id}  run=${r.run_id}  job=${r.job_id}  ${r.event_type}  source=${source}  @${r.created_at}`)
    }
    if (rows.length > 15) console.log(`  ...${rows.length - 15} more`)
  }

  console.log('\n=== Job__c create events ever, by job_id 19872 ===')
  const creates = await sql`
    SELECT id, run_id, event_type, created_at, payload
    FROM job_event_log
    WHERE job_id = '19872'
      AND event_type IN ('job_created_in_salesforce','job_create_failed','job_create_skipped','sf_job_created')
    ORDER BY id
  `
  console.log(`(${creates.length} create-events for job 19872)`)
  for (const r of creates) {
    const p = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload
    console.log(`  #${r.id}  ${r.event_type}  sf_job_id=${p?.sf_job_id ?? '-'}  source=${p?.source ?? '-'}  @${r.created_at}`)
  }

  console.log('\n=== earliest sf_ids_update for 19872 ===')
  const earliest = await sql`
    SELECT id, run_id, event_type, created_at, payload
    FROM job_event_log
    WHERE job_id = '19872'
      AND event_type = 'sf_ids_update'
    ORDER BY id ASC
    LIMIT 5
  `
  for (const r of earliest) {
    const p = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload
    console.log(`  #${r.id}  run=${r.run_id}  source=${p?.source}  next.sf_job_id=${p?.next?.sf_job_id}  @${r.created_at}`)
  }

  await sql.end()
}
main().catch(e => { console.error(e); process.exit(1) })
