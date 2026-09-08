'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { InstagramDraftRow } from '@/lib/marketingQueries'
import { INSTAGRAM_SENTIMENT_TAGS, type InstagramSentimentTag } from '@/lib/marketing/types'
import { ComplianceBanner } from './ComplianceBanner'
import { DemoBadge } from './DemoBadge'
import { CarouselPreview } from './CarouselPreview'
import { cn } from '@/lib/utils'

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
  uncited_educational: 'No hard stat (uncited)',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const SELECT_CLS =
  'rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] text-stone-700 shadow-sm transition-colors hover:border-stone-300 focus:border-stone-400 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200'

/** Instagram queue review board (2026-09-08 UI redesign, alongside the carousel image
 * pipeline) — a warm-toned visual card grid with real carousel previews, matching the
 * editorial design system used for the generated slides themselves rather than a generic
 * admin-table look. Runs on a 3-posts/week -> ~20-post backlog scale (client-side
 * sort/filter, same convention as before), each card expands inline for the full caption,
 * hashtags, citations, and notes (no page jump, per Andy's standing UX preference). */
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select value={sentimentFilter} onChange={(e) => setSentimentFilter(e.target.value as InstagramSentimentTag | 'all')} className={SELECT_CLS}>
          <option value="all">All sentiment tags</option>
          {INSTAGRAM_SENTIMENT_TAGS.map((tag) => (
            <option key={tag} value={tag}>
              {SENTIMENT_LABELS[tag]}
            </option>
          ))}
        </select>
        <select value={usedFilter} onChange={(e) => setUsedFilter(e.target.value as UsedFilter)} className={SELECT_CLS}>
          <option value="all">Used + unused</option>
          <option value="used">Used only</option>
          <option value="unused">Unused only</option>
        </select>
        <select value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value as ReviewFilter)} className={SELECT_CLS}>
          <option value="all">Approved + disapproved + unreviewed</option>
          <option value="approved">Approved</option>
          <option value="disapproved">Disapproved</option>
          <option value="unreviewed">Unreviewed</option>
        </select>
        <span className="text-[13px] text-stone-400">Sort</span>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className={SELECT_CLS}>
          <option value="impact">Est. impact</option>
          <option value="created">Newest</option>
        </select>
        <span className="ml-auto rounded-full bg-stone-900/5 px-3 py-1 text-[12px] font-medium text-stone-500 dark:bg-white/5 dark:text-stone-400">
          {filtered.length} of {drafts.length}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((draft) => (
          <InstagramDraftCard
            key={draft.id}
            draft={draft}
            isAdmin={isAdmin}
            expanded={expandedId === draft.id}
            onToggle={() => setExpandedId(expandedId === draft.id ? null : draft.id)}
          />
        ))}
      </div>

      {expandedId && (
        <DraftDetailModal
          draft={filtered.find((d) => d.id === expandedId) ?? drafts.find((d) => d.id === expandedId)!}
          isAdmin={isAdmin}
          onClose={() => setExpandedId(null)}
        />
      )}
    </div>
  )
}

function ImpactBadge({ score, reasoning }: { score: number | null; reasoning: string | null }) {
  if (score == null) return null
  const tone =
    score >= 70
      ? 'border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
      : score >= 40
        ? 'border-amber-600/30 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
        : 'border-stone-300 bg-stone-50 text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400'
  return (
    <span title={reasoning ?? undefined} className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', tone)}>
      {score}
    </span>
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
  const [isPending, startTransition] = useTransition()

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
    <div
      className={cn(
        'group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm ring-1 ring-transparent transition-all hover:shadow-md dark:border-stone-800 dark:bg-stone-900/60',
        expanded && 'ring-2 ring-orange-400/40',
      )}
    >
      <button type="button" onClick={onToggle} className="block p-3 pb-0 text-left">
        <CarouselPreview draftId={draft.id} slideCount={draft.slideCount} legacyImageUrl={draft.imageUrl} />
      </button>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <ImpactBadge score={draft.impactScore} reasoning={draft.impactScoreReasoning} />
          {draft.reviewStatus === 'approved' && (
            <span className="rounded-full border border-emerald-600/30 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              Approved
            </span>
          )}
          {draft.reviewStatus === 'disapproved' && (
            <span className="rounded-full border border-red-600/30 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              Disapproved
            </span>
          )}
          {draft.usedAt && (
            <span className="rounded-full border border-stone-300 bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
              Used
            </span>
          )}
          {draft.isDemoData && <DemoBadge />}
          <span className="ml-auto shrink-0 text-[11px] text-stone-400">{formatDate(draft.createdAt)}</span>
        </div>

        <button type="button" onClick={onToggle} className="text-left">
          <p className="line-clamp-3 font-serif text-[15px] leading-snug text-stone-800 dark:text-stone-100">
            {draft.hookLine || draft.caption}
          </p>
        </button>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <label className="flex items-center gap-1.5 text-[12px] text-stone-500 dark:text-stone-400">
            <input type="checkbox" checked={Boolean(draft.usedAt)} disabled={!isAdmin || isPending} onChange={toggleUsed} />
            Used
          </label>
          {isAdmin && (
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                disabled={isPending}
                onClick={() => review('approved')}
                className="rounded-full border border-emerald-600/40 px-2.5 py-1 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-40 dark:border-emerald-500/40 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => review('disapproved')}
                className="rounded-full border border-red-600/40 px-2.5 py-1 text-[11px] font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-40 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                Disapprove
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DraftDetailModal({ draft, isAdmin, onClose }: { draft: InstagramDraftRow; isAdmin: boolean; onClose: () => void }) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="grid max-h-[90vh] w-full max-w-3xl grid-cols-1 gap-0 overflow-hidden rounded-2xl bg-[#F8F4EC] shadow-2xl sm:grid-cols-[280px_1fr] dark:bg-stone-900"
      >
        <div className="bg-stone-100 p-4 dark:bg-stone-950">
          <CarouselPreview draftId={draft.id} slideCount={draft.slideCount} legacyImageUrl={draft.imageUrl} />
        </div>

        <div className="max-h-[90vh] overflow-y-auto p-5">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <ImpactBadge score={draft.impactScore} reasoning={draft.impactScoreReasoning} />
              {draft.sentimentTags.map((tag) => (
                <span
                  key={tag}
                  className={
                    tag === 'uncited_educational'
                      ? 'rounded-full border border-amber-600/30 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
                      : 'rounded-full border border-stone-300 px-2 py-0.5 text-[11px] text-stone-500 dark:border-stone-700'
                  }
                >
                  {SENTIMENT_LABELS[tag as InstagramSentimentTag] ?? tag}
                </span>
              ))}
            </div>
            <button type="button" onClick={onClose} className="shrink-0 rounded-full p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700 dark:hover:bg-stone-800">
              ✕
            </button>
          </div>

          <ComplianceBanner claims={draft.claimsRequiringReview} />

          <div className="mt-4 space-y-4 text-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Caption</p>
              <p className="mt-1 whitespace-pre-wrap rounded-xl border border-stone-200 bg-white p-3 text-[13px] leading-relaxed text-stone-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                {draft.caption}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Hashtags ({draft.hashtags.length})</p>
              <p className="mt-1 text-[13px] text-stone-700 dark:text-stone-300">{draft.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}</p>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Sources ({draft.sourceUrls.length})</p>
              {draft.sourceUrls.length === 0 ? (
                <p className="mt-1 text-[13px] text-stone-500">None cited — treat claims as directional, not verified.</p>
              ) : (
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {draft.sourceUrls.map((url, i) => (
                    <li key={i}>
                      <a href={url} target="_blank" rel="noreferrer" className="text-[13px] text-stone-900 hover:underline dark:text-white">
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Audience / objective</p>
              <p className="mt-1 text-[13px] text-stone-700 dark:text-stone-300">
                {draft.audience} — {draft.objective}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Notes</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!isAdmin}
                placeholder="Freeform notes — why approved/disapproved, edits to make before posting, etc."
                className="mt-1 w-full rounded-xl border border-stone-200 bg-white p-2.5 text-xs disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900"
                rows={3}
              />
              {isAdmin && (
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={saveNotes}
                    disabled={isPending}
                    className="rounded-full bg-stone-900 px-3 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 dark:bg-white dark:text-stone-900"
                  >
                    {isPending ? 'Saving…' : 'Save notes'}
                  </button>
                  {savedNotes && !isPending && <span className="text-[11px] text-stone-500">Saved.</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
