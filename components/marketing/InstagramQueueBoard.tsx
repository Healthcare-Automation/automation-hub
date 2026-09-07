'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { InstagramDraftRow } from '@/lib/marketingQueries'
import { INSTAGRAM_SENTIMENT_TAGS, type InstagramSentimentTag } from '@/lib/marketing/types'
import { ComplianceBanner } from './ComplianceBanner'
import { DemoBadge } from './DemoBadge'

type SortKey = 'impact' | 'created'
type UsedFilter = 'all' | 'used' | 'unused'
type ReviewFilter = 'all' | 'approved' | 'disapproved' | 'unreviewed'

const SENTIMENT_LABELS: Record<InstagramSentimentTag, string> = {
  contrarian: 'Contrarian',
  educational: 'Educational',
  myth_busting: 'Myth-busting',
  data_driven: 'Data-driven',
  inspirational: 'Inspirational',
  community_focused: 'Community-focused',
  cost_saving: 'Cost-saving',
  urgency: 'Urgency',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Instagram queue review board — sortable/filterable grid over a page's worth of drafts
 * (client-side, same convention as TrendRadarTable: this runs on a 3-posts/week scale, not
 * a firehose). Each card expands inline (no page jump, per Andy's standing UX preference)
 * to show the full caption, hashtags, citations, and notes. */
export function InstagramQueueBoard({ drafts, isAdmin }: { drafts: InstagramDraftRow[]; isAdmin: boolean }) {
  const [sortKey, setSortKey] = useState<SortKey>('impact')
  const [sentimentFilter, setSentimentFilter] = useState<InstagramSentimentTag | 'all'>('all')
  const [usedFilter, setUsedFilter] = useState<UsedFilter>('all')
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return drafts
      .filter((d) => {
        if (sentimentFilter !== 'all' && !d.sentimentTags.includes(sentimentFilter)) return false
        if (usedFilter === 'used' && !d.usedAt) return false
        if (usedFilter === 'unused' && d.usedAt) return false
        if (reviewFilter !== 'all' && d.reviewStatus !== reviewFilter) return false
        return true
      })
      .sort((a, b) => {
        if (sortKey === 'impact') return (b.impactScore ?? -1) - (a.impactScore ?? -1)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
  }, [drafts, sentimentFilter, usedFilter, reviewFilter, sortKey])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value={sentimentFilter}
          onChange={(e) => setSentimentFilter(e.target.value as InstagramSentimentTag | 'all')}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="all">All sentiment tags</option>
          {INSTAGRAM_SENTIMENT_TAGS.map((tag) => (
            <option key={tag} value={tag}>
              {SENTIMENT_LABELS[tag]}
            </option>
          ))}
        </select>
        <select
          value={usedFilter}
          onChange={(e) => setUsedFilter(e.target.value as UsedFilter)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="all">Used + unused</option>
          <option value="used">Used only</option>
          <option value="unused">Unused only</option>
        </select>
        <select
          value={reviewFilter}
          onChange={(e) => setReviewFilter(e.target.value as ReviewFilter)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="all">Approved + disapproved + unreviewed</option>
          <option value="approved">Approved</option>
          <option value="disapproved">Disapproved</option>
          <option value="unreviewed">Unreviewed</option>
        </select>
        <span className="text-zinc-400">Sort by</span>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="impact">Est. impact</option>
          <option value="created">Newest</option>
        </select>
        <span className="ml-auto text-zinc-400">
          {filtered.length} of {drafts.length}
        </span>
      </div>

      <ul className="space-y-3">
        {filtered.map((draft) => (
          <InstagramDraftCard
            key={draft.id}
            draft={draft}
            isAdmin={isAdmin}
            expanded={expandedId === draft.id}
            onToggle={() => setExpandedId(expandedId === draft.id ? null : draft.id)}
          />
        ))}
      </ul>
    </div>
  )
}

function InstagramDraftCard({
  draft,
  isAdmin,
  expanded,
  onToggle,
}: {
  draft: InstagramDraftRow
  isAdmin: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const router = useRouter()
  const [notes, setNotes] = useState(draft.notes ?? '')
  const [isPending, startTransition] = useTransition()
  const [savedNotes, setSavedNotes] = useState(false)

  function saveNotes() {
    setSavedNotes(false)
    startTransition(async () => {
      const res = await fetch('/api/marketing/instagram/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: draft.id, notes }),
      })
      if (res.ok) {
        setSavedNotes(true)
        router.refresh()
      }
    })
  }

  function toggleUsed() {
    startTransition(async () => {
      const res = await fetch('/api/marketing/instagram/used', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: draft.id, used: !draft.usedAt }),
      })
      if (res.ok) router.refresh()
    })
  }

  function review(tag: 'approved' | 'disapproved') {
    startTransition(async () => {
      const res = await fetch('/api/marketing/instagram/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: draft.id, tag }),
      })
      if (res.ok) router.refresh()
    })
  }

  return (
    <li className="rounded-lg border border-zinc-200 dark:border-zinc-700/60">
      <div className="flex gap-4 p-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 text-center text-[10px] text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/60">
          {draft.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="px-1.5">Image not generated — prompt only</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {draft.impactScore != null && (
              <span
                title={draft.impactScoreReasoning ?? undefined}
                className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
              >
                Est. impact {draft.impactScore}/100
              </span>
            )}
            {draft.sentimentTags.map((tag) => (
              <span
                key={tag}
                className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:border-zinc-700"
              >
                {SENTIMENT_LABELS[tag as InstagramSentimentTag] ?? tag}
              </span>
            ))}
            {draft.reviewStatus === 'approved' && (
              <span className="rounded border border-emerald-500/60 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
                Approved
              </span>
            )}
            {draft.reviewStatus === 'disapproved' && (
              <span className="rounded border border-red-500/60 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                Disapproved
              </span>
            )}
            {draft.isDemoData && <DemoBadge />}
            <span className="ml-auto shrink-0 text-[10px] text-zinc-400">{formatDate(draft.createdAt)}</span>
          </div>

          <button type="button" onClick={onToggle} className="mt-1.5 block w-full text-left">
            <p className="line-clamp-2 text-sm text-zinc-800 dark:text-zinc-200">{draft.hookLine || draft.caption}</p>
          </button>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
              <input type="checkbox" checked={Boolean(draft.usedAt)} disabled={!isAdmin || isPending} onChange={toggleUsed} />
              Used
            </label>
            {isAdmin && (
              <>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => review('approved')}
                  className="rounded border border-emerald-600 px-2 py-0.5 text-[11px] font-medium text-emerald-700 disabled:opacity-40 dark:border-emerald-500 dark:text-emerald-400"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => review('disapproved')}
                  className="rounded border border-red-600 px-2 py-0.5 text-[11px] font-medium text-red-700 disabled:opacity-40 dark:border-red-500 dark:text-red-400"
                >
                  Disapprove
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onToggle}
              className="ml-auto text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-zinc-200 p-4 text-sm dark:border-zinc-700/60">
          <ComplianceBanner claims={draft.claimsRequiringReview} />

          <div>
            <p className="text-xs font-medium text-zinc-500">Caption</p>
            <p className="mt-1 whitespace-pre-wrap rounded border border-zinc-200 p-3 text-[13px] leading-relaxed text-zinc-800 dark:border-zinc-700 dark:text-zinc-200">
              {draft.caption}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-zinc-500">Hashtags ({draft.hashtags.length})</p>
            <p className="mt-1 text-[13px] text-zinc-700 dark:text-zinc-300">{draft.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}</p>
          </div>

          {draft.imagePrompt && (
            <div>
              <p className="text-xs font-medium text-zinc-500">Image prompt {!draft.imageUrl && '(no image generated yet — manual follow-up)'}</p>
              <p className="mt-1 text-[13px] text-zinc-700 dark:text-zinc-300">{draft.imagePrompt}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-zinc-500">Sources ({draft.sourceUrls.length})</p>
            {draft.sourceUrls.length === 0 ? (
              <p className="mt-1 text-[13px] text-zinc-500">None cited — treat claims as directional, not verified.</p>
            ) : (
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {draft.sourceUrls.map((url, i) => (
                  <li key={i}>
                    <a href={url} target="_blank" rel="noreferrer" className="text-[13px] text-zinc-900 hover:underline dark:text-white">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-zinc-500">Audience / objective</p>
            <p className="mt-1 text-[13px] text-zinc-700 dark:text-zinc-300">
              {draft.audience} — {draft.objective}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-zinc-500">Notes</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!isAdmin}
              placeholder="Freeform notes — why approved/disapproved, edits to make before posting, etc."
              className="mt-1 w-full rounded border border-zinc-300 p-2 text-xs disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
              rows={3}
            />
            {isAdmin && (
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveNotes}
                  disabled={isPending}
                  className="rounded border border-zinc-900 px-2 py-1 text-[11px] text-zinc-900 disabled:opacity-40 dark:border-white dark:text-white"
                >
                  {isPending ? 'Saving…' : 'Save notes'}
                </button>
                {savedNotes && !isPending && <span className="text-[11px] text-zinc-500">Saved.</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
