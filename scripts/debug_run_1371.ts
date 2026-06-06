import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' })

async function main() {
  console.log('=== full event timeline for job 19872 (runs 1371, 1372, 1373, 1375) ===')
  const events = await sql`
    SELECT id, run_id, event_type, created_at, payload
    FROM job_event_log
    WHERE job_id = '19872'
      AND run_id IN (1371, 1372, 1373, 1375)
    ORDER BY id
  `
  for (const e of events) {
    const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload
    console.log(`#${e.id}  run=${e.run_id}  ${e.event_type}  @${e.created_at}`)
    if (p) {
      const compact = JSON.stringify(p).slice(0, 280)
      console.log(`     payload: ${compact}`)
    }
  }

  console.log('\n=== job_content for job 19872 ===')
  const jcs = await sql`
    SELECT id, run_id, sf_job_id, sf_account_id, practice_value, created_at, job_post_id
    FROM job_content
    WHERE job_id = '19872'
    ORDER BY id
  `
  for (const r of jcs) console.log(r)

  console.log('\n=== sf_job_id_map / link tables for this job ===')
  try {
    const m = await sql`
      SELECT *
      FROM sf_job_mapping_cache
      WHERE kimedics_job_id = '19872' OR external_job_id = '19872' OR job_post_id = '19872'
    `
    for (const r of m) console.log(r)
  } catch (e: any) { console.log('  (no sf_job_mapping_cache table or other error)', e.message) }

  console.log('\n=== latest job snapshot (jobs table) ===')
  try {
    const j = await sql`SELECT id, sf_job_id, practice_value, status, created_at FROM jobs WHERE id = '19872'`
    for (const r of j) console.log(r)
  } catch (e: any) { console.log('  (no jobs table)', e.message) }

  await sql.end()
}
main().catch(e => { console.error(e); process.exit(1) })
