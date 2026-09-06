'use client'

import { useState, useTransition } from 'react'
import { ComplianceBanner } from './ComplianceBanner'
import { FeedbackForm } from './FeedbackForm'
import { highlightClaims } from './highlightClaims'

interface DraftResult {
  id: string
  format: 'linkedin_post' | 'video_script'
  hook_options: string[]
  draft_text: string
  claims_requiring_review: string[]
  alternative_pov: string
  suggested_visual: string | null
  generated_by: 'template' | 'llm'
}

/** Content Studio, inline in the Story Workspace panel flow (no page jump): format
 * chooser, draft with claims-needing-review highlighted inline, copy button, and feedback
 * chips right under the draft — everything Andy asked for on one screen. */
export function ContentStudioPanel({ opportunityId, angleId }: { opportunityId: string; angleId: string }) {
  const [format, setFormat] = useState<'linkedin_post' | 'video_script'>('linkedin_post')
  const [draft, setDraft] = useState<DraftResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function generate() {
    setError(null)
    setCopied(false)
    startTransition(async () => {
      const res = await fetch('/api/marketing/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId, angleId, format }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        setError('Could not generate — try again.')
        return
      }
      setDraft(body.draft)
    })
  }

  function copy() {
    if (!draft) return
    navigator.clipboard.writeText(draft.draft_text).then(() => setCopied(true))
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-700/60">
      <p className="text-sm font-medium text-zinc-900 dark:text-white">Content Studio</p>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-zinc-700 dark:text-zinc-300">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={format === 'linkedin_post'} onChange={() => setFormat('linkedin_post')} />
          LinkedIn post
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={format === 'video_script'} onChange={() => setFormat('video_script')} />
          Short-form video script
        </label>
        <button
          type="button"
          disabled={isPending}
          onClick={generate}
          className="rounded border border-zinc-900 px-3 py-1 text-xs font-medium text-zinc-900 disabled:opacity-40 dark:border-white dark:text-white"
        >
          {isPending ? 'Generating…' : draft ? 'Regenerate' : 'Generate'}
        </button>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {draft && (
        <div className="mt-4 space-y-4 border-t border-zinc-200 pt-4 dark:border-zinc-700/60">
          <span className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:border-zinc-700">
            {draft.generated_by === 'llm' ? 'Generated via LLM' : 'Generated via local template (no LLM key configured)'}
          </span>

          <ComplianceBanner claims={draft.claims_requiring_review} />

          <div>
            <p className="text-xs font-medium text-zinc-500">Hook options</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-zinc-800 dark:text-zinc-200">
              {draft.hook_options.map((hook, i) => (
                <li key={i}>{hook}</li>
              ))}
            </ul>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-zinc-500">Draft</p>
              <button
                type="button"
                onClick={copy}
                className="rounded border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="mt-1 whitespace-pre-wrap rounded border border-zinc-200 p-3 text-[13px] leading-relaxed text-zinc-800 dark:border-zinc-700 dark:text-zinc-200">
              {highlightClaims(draft.draft_text, draft.claims_requiring_review)}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-zinc-500">Alternative point of view</p>
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{draft.alternative_pov}</p>
          </div>

          {draft.suggested_visual && (
            <div>
              <p className="text-xs font-medium text-zinc-500">Suggested visual</p>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{draft.suggested_visual}</p>
            </div>
          )}

          <FeedbackForm targetType="content_draft" targetId={draft.id} isAdmin />
        </div>
      )}
    </div>
  )
}
