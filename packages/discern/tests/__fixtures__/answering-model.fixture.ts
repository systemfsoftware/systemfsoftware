import { Discern } from '@systemfsoftware/discern'
import { Effect } from 'effect'
import type { AnswerFor } from './counting-model.fixture.js'

const uncountedUsage = { inputTokens: undefined, outputTokens: undefined } as const

export const answeringProvider = (answerFor: AnswerFor): Discern.Model.Provider =>
  Discern.Model.provider((request) => Effect.succeed({ answers: answerFor(request), usage: uncountedUsage }))
