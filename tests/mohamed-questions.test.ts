import assert from 'node:assert/strict'
import { test } from 'node:test'
import { QuestionsNotMigratedError } from '../lib/mohamedQuestions'

test('QuestionsNotMigratedError is a distinct, catchable class', () => {
  const err = new QuestionsNotMigratedError('mohamed_client_questions not migrated')
  assert.ok(err instanceof Error)
  assert.ok(err instanceof QuestionsNotMigratedError)
  assert.equal(err.message, 'mohamed_client_questions not migrated')
})
