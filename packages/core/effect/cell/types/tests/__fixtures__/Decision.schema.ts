import * as S from 'effect/Schema'

const DecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/tests/Decision')
type DecisionTypeId = typeof DecisionTypeId

export class DecisionOne extends S.TaggedClass<DecisionOne>()('DecisionOne', {
  value: S.Int,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class DecisionTwo extends S.TaggedClass<DecisionTwo>()('DecisionTwo', {
  reason: S.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export type Decision = DecisionOne | DecisionTwo

export class DecisionError extends S.TaggedError<DecisionError>()('DecisionError', {
  why: S.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class LoneDecision extends S.TaggedClass<LoneDecision>()('LoneDecision', {}) {
  readonly [DecisionTypeId] = DecisionTypeId
}
