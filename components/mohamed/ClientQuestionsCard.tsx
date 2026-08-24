'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ClientQuestion } from '@/lib/mohamedQuestions'

/**
 * "Questions for you" — clarifying workflow questions the automation needs
 * Mohamed to answer (billing rules, edge cases). Open questions show an
 * answer box; answered ones collapse to a one-line summary so the trail
 * stays visible without taking over the page.
 */
const TOPIC_HEADLINES: Record<string, string> = {
  eligibility_coverage_gap: 'Coverage-gap billing rule',
}

function humanizeTopic(topic: string): string {
  return topic.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function topicHeadline(topic: string): string {
  return TOPIC_HEADLINES[topic] ?? humanizeTopic(topic)
}

/** Splits text into a short clamped summary plus optional remainder:
 * prefer the first paragraph break, else the first full sentence within
 * ~200 chars, else a hard cut at 200 chars. */
function splitClamped(text: string): { summary: string; rest: string | null } {
  const paragraphBreak = text.indexOf('\n\n')
  if (paragraphBreak > 0) {
    return { summary: text.slice(0, paragraphBreak).trim(), rest: text.slice(paragraphBreak).trim() }
  }
  if (text.length <= 200) return { summary: text, rest: null }
  const window = text.slice(0, 220)
  const sentenceEnd = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '))
  const cut = sentenceEnd > 80 ? sentenceEnd + 1 : 200
  return { summary: text.slice(0, cut).trim(), rest: text.slice(cut).trim() || null }
}

export function ClientQuestionsCard({
  questions,
  canAnswer,
  degraded = false,
}: {
  questions: ClientQuestion[]
  canAnswer: boolean
  degraded?: boolean
}) {
  const open = questions.filter(q => q.status === 'open')
  const answered = questions.filter(q => q.status === 'answered')

  return (
    <section data-section="questions" className="mt-7 rounded-2xl border border-sky-200 bg-sky-50 p-5">
      <h2 className="text-base font-semibold text-sky-950">Questions for you</h2>
      <p className="mt-0.5 text-xs text-sky-900/70">
        The automation needs these billing-rule decisions from you. Answers here become the rules it follows.
      </p>
      {degraded ? (
        <p className="mt-3 text-xs text-amber-700">Reconnecting… refreshes automatically.</p>
      ) : questions.length === 0 ? (
        <p className="mt-3 text-xs text-sky-900/70">No open questions right now.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {open.map(q => (
            <OpenQuestion key={q.id} question={q} canAnswer={canAnswer} />
          ))}
          {answered.map(q => (
            <AnsweredQuestion key={q.id} question={q} />
          ))}
        </div>
      )}
    </section>
  )
}

function OpenQuestion({ question, canAnswer }: { question: ClientQuestion; canAnswer: boolean }) {
  const router = useRouter()
  const [answer, setAnswer] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [showDetails, setShowDetails] = useState(false)
  const { summary, rest } = splitClamped(question.question)

  async function submit() {
    if (!answer.trim()) return
    setState('saving')
    try {
      const res = await fetch('/api/mohamed/answer-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: question.id, answer: answer.trim() }),
      })
      if (!res.ok) throw new Error(String(res.status))
      router.refresh()
    } catch {
      setState('error')
    }
  }

  return (
    <div className="rounded-xl border border-sky-300 bg-white p-4">
      <div className="flex items-start gap-2">
        <span className="mt-1 inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900">{topicHeadline(question.topic)}</p>
          <p className="mt-0.5 text-sm text-zinc-700">{summary}</p>
          {rest && (
            <button
              type="button"
              onClick={() => setShowDetails(v => !v)}
              className="mt-1 text-xs font-medium text-sky-700 hover:underline"
            >
              {showDetails ? 'Hide details' : 'Show details'}
            </button>
          )}
          {showDetails && rest && <p className="mt-1 text-sm text-zinc-700">{rest}</p>}
        </div>
      </div>
      {canAnswer ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <textarea
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder="Type your answer…"
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
          />
          <button
            onClick={submit}
            disabled={state === 'saving' || !answer.trim()}
            className="shrink-0 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {state === 'saving' ? 'Saving…' : 'Save answer'}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">Log in to answer.</p>
      )}
      {state === 'error' && <p className="mt-1 text-xs text-red-600">Could not save — try again.</p>}
    </div>
  )
}

function AnsweredQuestion({ question }: { question: ClientQuestion }) {
  const [expanded, setExpanded] = useState(false)
  const { summary: questionSummary } = splitClamped(question.question)
  const answerText = question.answer ?? ''
  const { summary: answerSummary } = splitClamped(answerText)

  return (
    <div className="rounded-xl border border-sky-200 bg-white p-4">
      <button type="button" onClick={() => setExpanded(v => !v)} className="flex w-full items-start gap-2 text-left">
        <span className="mt-0.5 shrink-0 text-emerald-600" aria-hidden>✓</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900">{topicHeadline(question.topic)}</p>
          <p className="mt-0.5 truncate text-xs text-zinc-500">{answerSummary}</p>
        </div>
        <span className="shrink-0 text-xs text-zinc-400">{expanded ? 'Hide' : 'Details'}</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
          <p className="text-sm text-zinc-700">{questionSummary}</p>
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <span className="font-medium">Answer:</span> {answerText}
            <span className="ml-2 text-[11px] text-emerald-700">
              {question.answeredAt ? new Date(question.answeredAt).toLocaleDateString() : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
