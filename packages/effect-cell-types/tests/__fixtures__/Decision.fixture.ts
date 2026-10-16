import * as S from 'effect/Schema'

import { DecisionOne } from './accept-tagged-command.workflow.js'

const DecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/tests/Decision')
type DecisionTypeId = typeof DecisionTypeId

export class LoneDecision extends S.TaggedClass<LoneDecision>()('LoneDecision', {}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class DecisionError extends S.TaggedError<DecisionError>()('DecisionError', {
  why: S.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export const SingleEventList = S.Array(DecisionOne)

export const ErrorClassDecision = S.Union([LoneDecision, DecisionError])

export const ErrorClassEventList = S.Array(S.Union([DecisionOne, DecisionError]))

export const LoneErrorEventList = S.Array(DecisionError)
