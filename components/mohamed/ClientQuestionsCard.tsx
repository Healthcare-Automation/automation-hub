'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ClientQuestion } from '@/lib/mohamedQuestions'

/**
 * "Questions for you" — clarifying workflow questions the automation needs
 * Mohamed to answer (billing rules, edge cases). Open questions show an
 * answer box; answered ones show the decision so the trail stays visible.
 */
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
            <QuestionItem key={q.id} question={q} canAnswer={canAnswer} />
          ))}
          {answered.map(q => (
            <div key={q.id} className="rounded-xl border border-sky-200 bg-white p-4">
              <p className="text-sm text-zinc-800">{q.question}</p>
              <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                <span className="font-medium">Answer:</span> {q.answer}
                <span className="ml-2 text-[11px] text-emerald-700">
                  {q.answeredAt ? new Date(q.answeredAt).toLocaleDateString() : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function QuestionItem({ question, canAnswer }: { question: ClientQuestion; canAnswer: boolean }) {
  const router = useRouter()
  const [answer, setAnswer] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle')

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
        <span className="mt-0.5 inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-500" />
        <p className="text-sm text-zinc-800">{question.question}</p>
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
