import { isMohamedLedgerConfigured, mohamedQuery } from './mohamedDb'

/**
 * Clarifying questions for Mohamed — workflow-rule questions the automation
 * needs answered (e.g. "what do we do when a member is missing one of the two
 * required coverages?"). The VPS pipeline inserts them; the hub displays them
 * and records answers. No PHI: question/answer text is workflow-level only.
 */

export type ClientQuestion = {
  id: number
  createdAt: string
  topic: string
  question: string
  status: 'open' | 'answered' | 'dismissed'
  answer: string | null
  answeredAt: string | null
  answeredBy: string | null
}

type RawRow = {
  id: number
  created_at: string | Date
  topic: string
  question: string
  status: string
  answer: string | null
  answered_at: string | Date | null
  answered_by: string | null
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

function toQuestion(raw: RawRow): ClientQuestion {
  return {
    id: raw.id,
    createdAt: iso(raw.created_at),
    topic: raw.topic,
    question: raw.question,
    status: raw.status as ClientQuestion['status'],
    answer: raw.answer,
    answeredAt: raw.answered_at ? iso(raw.answered_at) : null,
    answeredBy: raw.answered_by,
  }
}

/** Open questions first (newest first), then recently answered ones so the
 * decision trail stays visible on the page. */
export async function getClientQuestions(): Promise<ClientQuestion[]> {
  if (!isMohamedLedgerConfigured) return []
  try {
    const rows = await mohamedQuery(sql => sql<RawRow[]>`
      select id, created_at, topic, question, status, answer, answered_at, answered_by
      from mohamed_client_questions
      where status in ('open', 'answered')
      order by (status = 'open') desc, created_at desc
      limit 20
    `)
    return rows.map(toQuestion)
  } catch {
    // Table not migrated yet or pooler unreachable: the section just doesn't render.
    return []
  }
}

export class QuestionWriteError extends Error {}

const ANSWERER = /^[a-z0-9_.:-]{1,40}$/

/** Records an answer to an open question. */
export async function answerClientQuestion(id: number, answer: string, answeredBy: string): Promise<void> {
  if (!isMohamedLedgerConfigured) throw new QuestionWriteError('not_configured')
  if (!Number.isInteger(id) || id <= 0) throw new QuestionWriteError('invalid_id')
  const trimmed = answer.trim()
  if (!trimmed || trimmed.length > 4000) throw new QuestionWriteError('invalid_answer')
  if (!ANSWERER.test(answeredBy)) throw new QuestionWriteError('invalid_answerer')
  const rows = await mohamedQuery(sql => sql`
    update mohamed_client_questions
    set status = 'answered', answer = ${trimmed}, answered_at = now(), answered_by = ${answeredBy}
    where id = ${id} and status = 'open'
    returning id
  `)
  if (rows.length === 0) throw new QuestionWriteError('not_open')
}
