import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' })

async function main() {
  console.log('=== job_content for both jobs ===')
  const jcs = await sql`
    SELECT id, job_id, run_id, sf_job_id, practice_value, city, state, posting_org, created_at
    FROM job_content
    WHERE job_id IN ('19763', '19872')
    ORDER BY job_id, id
  `
  for (const r of jcs) console.log(r)

  console.log('\n=== first 12 events for 19872 (origin trace) ===')
  const ev = await sql`
    SELECT id, run_id, event_type, created_at, payload
    FROM job_event_log
    WHERE job_id = '19872'
    ORDER BY id ASC
    LIMIT 12
  `
  for (const r of ev) {
    const p = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload
    console.log(`#${r.id}  run=${r.run_id}  ${r.event_type}  @${r.created_at}`)
    console.log(`   ${JSON.stringify(p).slice(0, 320)}`)
  }

  console.log('\n=== mapping events around the original create (run 1318) ===')
  const mapEv = await sql`
    SELECT id, run_id, event_type, created_at, payload
    FROM job_event_log
    WHERE job_id = '19872' AND run_id <= 1318
      AND event_type IN ('mapping_no_match','mapping_ai_match','mapping_ambiguous','mapping_cache_hit',
                         'sf_mapping_skipped','sf_mapping_pull_failed','mapping_blocked_no_practice_value',
                         'sf_create_attempt','sf_create_job','sf_create_payload')
    ORDER BY id
  `
  for (const r of mapEv) {
    const p = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload
    console.log(`#${r.id}  ${r.event_type}  ${JSON.stringify(p).slice(0, 400)}`)
  }

  await sql.end()
}
main().catch(e => { console.error(e); process.exit(1) })
