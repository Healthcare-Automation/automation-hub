import type { WeeklySummary } from '@/lib/types'

function formatUTCShortDate(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(d)
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function CloudIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  )
}

interface Props {
  summary: WeeklySummary
}

export default function WeeklySummaryCards({ summary }: Props) {
  const end = new Date()
  const start = new Date(end)
  // Rolling 7-day window (inclusive), shown in UTC to match server-side SQL windows.
  start.setUTCDate(start.getUTCDate() - 6)
  const rangeLabel = `${formatUTCShortDate(start)}–${formatUTCShortDate(end)} (UTC)`

  const stats = [
    {
      icon: <MailIcon />,
      value: summary.emailsProcessed.toLocaleString(),
      label: 'Emails',
    },
    {
      icon: <SearchIcon />,
      value: summary.jobsScraped.toLocaleString(),
      label: 'Jobs scraped',
    },
    {
      icon: <CloudIcon />,
      value: summary.sfPatches.toLocaleString(),
      label: 'SF synced',
    },
    {
      icon: <CheckIcon />,
      value: `${summary.successRate}%`,
      label: `${summary.completedRuns} of ${summary.totalRuns} runs`,
    },
  ]

  return (
    <div>
      <div className="px-5 pt-4 pb-3">
        <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.1em]">
          Top metrics
        </p>
        <p className="text-xs text-zinc-600 mt-1">
          Past 7 days (rolling) • {rangeLabel}
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-zinc-700/50">
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-center gap-3 px-5 py-4">
          <div className="text-zinc-500 shrink-0">{stat.icon}</div>
          <div>
            <p className="text-xl font-semibold text-white tabular-nums tracking-tight leading-none">
              {stat.value}
            </p>
            <p className="text-xs text-zinc-500 mt-1">{stat.label}</p>
          </div>
        </div>
      ))}
      </div>
    </div>
  )
}
