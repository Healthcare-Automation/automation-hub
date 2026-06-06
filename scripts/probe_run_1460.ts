import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' })

async function main() {
  console.log('=== scrape_runs 1458..1461 ===')
  const runs = await sql`
    SELECT id, run_type, started_at, finished_at
    FROM scrape_runs
    WHERE id BETWEEN 1458 AND 1461
    ORDER BY id`
  for (const r of runs) console.log(r)

  console.log('\n=== email_scrapes for run 1460 ===')
  const es = await sql`
    SELECT id, run_id, created_at, job_post_id, subject, location, view_job_link, action_or_change
    FROM email_scrapes
    WHERE run_id = 1460
    ORDER BY id`
  for (const r of es) console.log(r)
  const esIds = es.map(r => r.id)

  console.log('\n=== job_content tied to those email_scrapes ===')
  if (esIds.length) {
    const jc = await sql`
      SELECT id, job_id, run_id, email_scrape_id, sf_job_id, practice_value, title_line, created_at
      FROM job_content
      WHERE email_scrape_id IN ${sql(esIds)}
      ORDER BY id`
    for (const r of jc) console.log(r)
    if (!jc.length) console.log('  (none)')
  }

  console.log('\n=== link_batch run paired within 15min of 1460 ===')
  const batch = await sql`
    SELECT b.id, b.run_type, b.started_at, b.finished_at
    FROM scrape_runs g
    JOIN scrape_runs b ON b.run_type = 'link_batch'
      AND b.started_at > g.started_at
      AND b.started_at < g.started_at + INTERVAL '15 minutes'
    WHERE g.id = 1460
    ORDER BY b.started_at`
  for (const r of batch) console.log(r)
  if (!batch.length) console.log('  (no paired link_batch)')

  console.log('\n=== job_event_log for run 1460 + paired batch ===')
  const runIds = [1460, ...batch.map(b => b.id)]
  const ev = await sql`
    SELECT id, run_id, job_id, event_type, created_at, payload
    FROM job_event_log
    WHERE run_id IN ${sql(runIds)}
    ORDER BY id`
  for (const r of ev) {
    const p = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload
    console.log(`#${r.id} run=${r.run_id} job=${r.job_id} ${r.event_type} @${r.created_at}`)
    if (p) console.log(`    ${JSON.stringify(p).slice(0, 400)}`)
  }
  if (!ev.length) console.log('  (no events)')

  await sql.end()
}
main().catch(e => { console.error(e); process.exit(1) })
