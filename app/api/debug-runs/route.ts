import { NextResponse } from 'next/server'
import sql from '@/lib/db'

export async function GET() {
  try {
    console.log('=== Debug Runs API ===')

    // Check what runs exist
    const runs = await sql`
      SELECT id, run_type, started_at, finished_at
      FROM scrape_runs
      ORDER BY id DESC
      LIMIT 20
    `

    console.log('Recent runs:', runs.length)

    // Check what job_content exists for recent runs
    const jobCounts = await sql`
      SELECT
        jc.run_id,
        COUNT(*) as job_count,
        COUNT(jc.sf_job_id) as jobs_with_sf_id
      FROM job_content jc
      WHERE jc.run_id IN (
        SELECT id FROM scrape_runs ORDER BY id DESC LIMIT 10
      )
      GROUP BY jc.run_id
      ORDER BY jc.run_id DESC
    `

    console.log('Job counts by run:', jobCounts)

    return NextResponse.json({
      runs: runs.map(r => ({
        id: r.id,
        run_type: r.run_type,
        started_at: r.started_at,
        finished_at: r.finished_at
      })),
      jobCounts: jobCounts.map(j => ({
        run_id: j.run_id,
        job_count: Number(j.job_count),
        jobs_with_sf_id: Number(j.jobs_with_sf_id)
      }))
    })
  } catch (error) {
    console.error('Debug runs error:', error)
    const details =
      error instanceof Error ? error.message : typeof error === 'string' ? error : null
    return NextResponse.json(
      { error: 'Failed to fetch debug data', details },
      { status: 500 }
    )
  }
}