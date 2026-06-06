import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' })

async function main() {
  console.log('=== pipeline_runs rows for 1430 + 1431 ===')
  const runs = await sql`
    SELECT id, run_type, status, started_at, finished_at, error, gmail_run_id, link_batch_run_id
    FROM pipeline_runs
    WHERE id IN (1430, 1431)
    ORDER BY id
  `
  for (const r of runs) console.log(r)

  console.log('\n=== all events for runs 1430 + 1431 ===')
  const ev = await sql`
    SELECT id, run_id, job_id, event_type, created_at, payload
    FROM job_event_log
    WHERE run_id IN (1430, 1431)
    ORDER BY id
  `
  for (const r of ev) {
    const p = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload
    console.log(`#${r.id}  run=${r.run_id}  job=${r.job_id}  ${r.event_type}  @${r.created_at}`)
    if (p) console.log(`     ${JSON.stringify(p).slice(0, 260)}`)
  }

  console.log('\n=== job_content created in runs 1430 + 1431 ===')
  const jcs = await sql`
    SELECT id, job_id, run_id, email_scrape_id, sf_job_id, practice_value, created_at, title_line, description_full_text IS NULL AS desc_null
    FROM job_content
    WHERE run_id IN (1430, 1431) OR email_scrape_id IN (
      SELECT id FROM email_scrapes WHERE run_id IN (1430, 1431)
    )
    ORDER BY id
  `
  for (const r of jcs) console.log(r)

  console.log('\n=== email_scrapes for runs 1430 + 1431 ===')
  const es = await sql`
    SELECT id, run_id, subject, action_or_change, view_job_link, parse_ok, created_at
    FROM email_scrapes
    WHERE run_id IN (1430, 1431)
    ORDER BY id
  `
  for (const r of es) console.log(r)

  await sql.end()
}
main().catch(e => { console.error(e); process.exit(1) })
