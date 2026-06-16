import type { DjcIssue } from '@/lib/djcTypes'

const LEVEL = { error: 'text-red-400 bg-red-500/10 ring-red-500/25', warn: 'text-amber-400 bg-amber-500/10 ring-amber-500/25' } as const

export function DjcIssues({ issues }: { issues: DjcIssue[] }) {
  if (issues.length === 0) {
    return <p className="text-[12px] text-emerald-400/80">No issues in recent runs.</p>
  }
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
        Needs attention · {issues.length}
      </p>
      <ol className="space-y-1">
        {issues.map((i, idx) => (
          <li key={idx} className="flex items-start gap-2 rounded-md bg-zinc-800/30 px-2.5 py-1.5 text-[12px] ring-1 ring-zinc-700/40">
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ${LEVEL[i.level as 'error' | 'warn'] ?? 'text-zinc-400'}`}>
              {i.level}
            </span>
            <div className="min-w-0">
              <span className="text-zinc-300">run #{i.runId} · {i.stage} · {i.eventType.replace(/_/g, ' ')}</span>
              {(i.name || i.candidateId) && <span className="text-zinc-500"> · {i.name ?? i.candidateId}</span>}
              {i.message && <p className="truncate text-zinc-500">{i.message}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
