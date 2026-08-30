'use client'

import { useState } from 'react'

// Admin → Check-In: one button that triggers the Modal check-in endpoint.
// The endpoint runs every consistency check over jobs touched in the last 7
// days, picks the 10 most concerning, assigns 5 each to Andy and Sean, emails
// both, and returns the full report which this page renders. Read-only.

type Check = { name: string; ok: boolean; expected?: string | null; actual?: string | null; note?: string }
type EmailRow = { date: string; subject: string; action: string }
type JobPacket = {
  job_id: string
  sf_job_id: string
  assignee: string
  score: number
  checks: Check[]
  flags: string[]
  emails: EmailRow[]
  links: { kimedics: string; salesforce: string }
  state: Record<string, string | null>
}
type Report = {
  generated_at: string
  pulse: Check[]
  pool_size: number
  checked_jobs: number
  failed_jobs: number
  jobs: JobPacket[]
  email_sent?: boolean
  error?: string
}

function CheckRow({ c }: { c: Check }) {
  return (
    <div className="text-xs py-0.5">
      <span className={c.ok ? 'text-emerald-500' : 'text-red-500'}>{c.ok ? '✓' : '✗'}</span>{' '}
      <span className="text-zinc-700 dark:text-zinc-300">{c.name}</span>
      {!c.ok && (
        <span className="text-zinc-500">
          {' '}— expected <span className="text-zinc-800 dark:text-zinc-200">{c.expected ?? '—'}</span>, got{' '}
          <span className="text-red-600 dark:text-red-400">{c.actual ?? '—'}</span>
        </span>
      )}
      {c.ok && c.note && <span className="text-zinc-500"> — {c.note}</span>}
    </div>
  )
}

function JobCard({ job }: { job: JobPacket }) {
  const [showEmails, setShowEmails] = useState(false)
  const failed = job.checks.some((c) => !c.ok)
  return (
    <div className={`rounded-lg border p-4 ${failed ? 'border-red-200 bg-red-50 dark:border-red-900/70 dark:bg-red-950/20' : 'border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none'}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-medium text-sm">
          Job #{job.job_id}
          <span className="text-zinc-500 font-normal text-xs"> · {job.state?.status ?? ''}</span>
        </div>
        <div className="text-xs space-x-3">
          <a href={job.links.kimedics} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Kimedics</a>
          <a href={job.links.salesforce} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Salesforce</a>
        </div>
      </div>
      <div className="text-xs text-zinc-500 mt-1 mb-2">
        Dates: <span className="text-zinc-700 dark:text-zinc-300">{job.state?.sf_dates_needed ?? '—'}</span>
        {' · '}Open: <span className="text-zinc-700 dark:text-zinc-300">{job.state?.sf_open_date ?? '—'}</span>
        {' · '}Practice: <span className="text-zinc-700 dark:text-zinc-300">{job.state?.practice_value ?? '—'}</span>
      </div>
      {job.checks.map((c, i) => <CheckRow key={i} c={c} />)}
      {job.flags.map((f, i) => (
        <div key={i} className="text-xs text-amber-600 dark:text-amber-500 py-0.5">⚑ {f}</div>
      ))}
      {job.emails.length > 0 && (
        <button
          onClick={() => setShowEmails((v) => !v)}
          className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 mt-2"
        >
          {showEmails ? '▾' : '▸'} {job.emails.length} emails
        </button>
      )}
      {showEmails && (
        <table className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          <tbody>
            {job.emails.map((e, i) => (
              <tr key={i}>
                <td className="pr-3 whitespace-nowrap align-top text-zinc-500">{e.date.slice(0, 16).replace('T', ' ')}</td>
                <td className="pr-3">{e.subject}</td>
                <td className="text-zinc-500">{e.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function CheckinPage() {
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setError(null)
    setReport(null)
    try {
      const res = await fetch('/api/admin/checkin/run', { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`)
      setReport(json)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 p-3 sm:p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold">Admin · Check-In</h1>
            <p className="text-xs text-zinc-500 mt-1">
              Verifies Kimedics → Salesforce consistency over the last 7 days, picks the 10 most
              concerning jobs, and emails the review packets to Andy + Sean (5 each). Read-only.
            </p>
          </div>
          <a href="/admin/recovery" className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 rounded px-2.5 py-1 shrink-0">
            Recovery →
          </a>
        </div>

        <button
          onClick={run}
          disabled={running}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          {running ? 'Running… (~30s)' : 'Run check-in'}
        </button>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>
        )}

        {report && (
          <>
            <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none p-4">
              <div className="text-sm font-medium mb-1">
                {report.failed_jobs > 0
                  ? `${report.failed_jobs} of ${report.checked_jobs} jobs have failed checks`
                  : `All ${report.checked_jobs} jobs clear`}
                {report.email_sent === false && (
                  <span className="text-amber-600 dark:text-amber-500"> · email failed to send</span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4">
                {report.pulse.map((c, i) => <CheckRow key={i} c={{ ...c, name: c.note || c.name }} />)}
              </div>
            </div>
            {['Andy', 'Sean'].map((who) => {
              const mine = report.jobs.filter((j) => j.assignee === who)
              if (!mine.length) return null
              return (
                <div key={who} className="space-y-2">
                  <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{who}&rsquo;s {mine.length}</h2>
                  {mine.map((j) => <JobCard key={j.job_id} job={j} />)}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
