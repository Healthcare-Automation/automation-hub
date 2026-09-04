import { getDemoOrgAndUser } from '@/lib/marketingDemoActor'
import { getTrendClusters } from '@/lib/marketingQueries'
import { DemoBadge } from '@/components/marketing/DemoBadge'

export const dynamic = 'force-dynamic'

/** Trend Radar: clusters of raw evidence, scored and explained.
 *  Ported from marketing_content/app/trend-radar/page.tsx. */
export default async function TrendRadarPage() {
  const { orgId } = await getDemoOrgAndUser()
  const clusters = await getTrendClusters(orgId)

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Trend Radar</h2>
        <p className="mt-1 text-sm text-zinc-500">Clusters of raw evidence, scored and explained.</p>
      </div>

      {clusters.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No trend clusters yet. Run <code>npx tsx scripts/seed-marketing.ts</code> to populate demo data.
        </p>
      ) : (
        <div className="space-y-8">
          {clusters.map(({ cluster, score, evidence }) => (
            <section key={cluster.id} className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-700/60">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-zinc-900 dark:text-white">{cluster.title}</h3>
                {cluster.is_demo_data && <DemoBadge />}
              </div>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{cluster.summary}</p>

              {score && (
                <div className="mt-4 border-t border-zinc-200 pt-4 text-sm dark:border-zinc-700/60">
                  <p className="font-medium text-zinc-900 dark:text-white">Trend score: {score.total_score}/100</p>
                  <p className="mt-1 text-zinc-500">{score.explanation}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-zinc-500 sm:grid-cols-3">
                    <div><dt className="inline font-medium">Relevance:</dt> <dd className="inline">{score.dental_healthcare_relevance_score}</dd></div>
                    <div><dt className="inline font-medium">Momentum:</dt> <dd className="inline">{score.momentum_recency_score}</dd></div>
                    <div><dt className="inline font-medium">Evidence:</dt> <dd className="inline">{score.evidence_strength_score}</dd></div>
                    <div><dt className="inline font-medium">Cross-source:</dt> <dd className="inline">{score.cross_source_confirmation_score}</dd></div>
                    <div><dt className="inline font-medium">Story potential:</dt> <dd className="inline">{score.story_potential_score}</dd></div>
                    <div><dt className="inline font-medium">Learned fit:</dt> <dd className="inline">{score.learned_interest_fit_score}</dd></div>
                  </dl>
                </div>
              )}

              <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700/60">
                <p className="text-sm font-medium text-zinc-900 dark:text-white">Evidence ({evidence.length})</p>
                <ul className="mt-2 space-y-2">
                  {evidence.map((item) => (
                    <li key={item.id} className="text-xs text-zinc-500">
                      <div className="flex flex-wrap items-center gap-2">
                        <a href={item.source_url} className="text-zinc-900 hover:underline dark:text-white" target="_blank" rel="noreferrer">
                          {item.title}
                        </a>
                        <span className="rounded border border-zinc-300 px-1.5 py-0.5 dark:border-zinc-700">
                          {item.reliability_classification.replace(/_/g, ' ')}
                        </span>
                        {item.is_demo_data && <DemoBadge />}
                      </div>
                      <p className="mt-0.5">{item.supporting_excerpt}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
