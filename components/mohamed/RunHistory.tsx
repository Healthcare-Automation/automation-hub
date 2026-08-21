import type { RunHistoryItem } from '@/lib/mohamedQueries'

const statusStyles: Record<RunHistoryItem['status'], string> = {
  review_ready: 'bg-emerald-50 text-emerald-800',
  blocked: 'bg-amber-50 text-amber-800',
  failed: 'bg-red-50 text-red-800',
}

const statusLabels: Record<RunHistoryItem['status'], string> = {
  review_ready: 'Reached review',
  blocked: 'Rows blocked',
  failed: 'Failed',
}

function when(iso: string) {
  return iso.replace('T', ' ').slice(0, 16) + ' UTC'
}

export function RunHistory({ history, selectedRunId }: { history: RunHistoryItem[]; selectedRunId: string }) {
  if (history.length === 0) return null
  return (
    <section className="mt-7 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-5 py-3">
        <h2 className="text-sm font-semibold">Run history</h2>
        <p className="mt-0.5 text-xs text-zinc-500">Every run is kept. Click a run to open its trace.</p>
      </div>
      <table className="w-full text-left text-xs">
        <thead className="bg-zinc-50 text-zinc-500">
          <tr>
            {['Started', 'Run', 'Mode', 'Source', 'Period', 'Events', 'Result'].map(label => (
              <th key={label} className="px-4 py-2 font-medium">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {history.map(item => (
            <tr key={item.runId} className={item.runId === selectedRunId ? 'bg-zinc-50' : ''}>
              <td className="px-4 py-2 text-zinc-600">{when(item.startedAt)}</td>
              <td className="px-4 py-2 font-mono">
                <a href={`/mohamed?run=${item.runId}`} className="text-emerald-700 hover:underline">
                  {item.runId.slice(0, 12)}
                </a>
              </td>
              <td className="px-4 py-2">{item.mode.replace('_', ' ')}</td>
              <td className="px-4 py-2">{item.source.replaceAll('_', ' ')}</td>
              <td className="px-4 py-2">{item.periodStart} → {item.periodEnd}</td>
              <td className="px-4 py-2">{item.eventCount}</td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 font-medium ${statusStyles[item.status]}`}>{statusLabels[item.status]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
