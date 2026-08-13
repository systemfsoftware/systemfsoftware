import type { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Either from 'effect/Either'
import * as Match from 'effect/Match'
import * as S from 'effect/Schema'
import type { DecideInput, RestartStrategy } from './restart-decision.schema.js'

const RestartDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon/RestartDecision',
)
type RestartDecisionTypeId = typeof RestartDecisionTypeId

export class RestartDecisionContinue extends S.TaggedClass<RestartDecisionContinue>()('Continue', {}) {
  readonly [RestartDecisionTypeId] = RestartDecisionTypeId
}

export class RestartDecisionRestart extends S.TaggedClass<RestartDecisionRestart>()('Restart', {
  indices: S.NonEmptyArray(S.Int),
}) {
  readonly [RestartDecisionTypeId] = RestartDecisionTypeId
}

export class RestartDecisionExhausted extends S.TaggedError<RestartDecisionExhausted>()('Exhausted', {}) {
  readonly [RestartDecisionTypeId] = RestartDecisionTypeId
}

export type RestartDecisionWorkflow = Workflow<
  DecideInput,
  RestartDecisionContinue | RestartDecisionRestart,
  RestartDecisionExhausted
>

const restartIndicesFor = (
  strategy: RestartStrategy,
  failedIndex: number,
  total: number,
): readonly [number, ...ReadonlyArray<number>] =>
  Match.value(strategy).pipe(
    Match.when('one_for_one', () => [failedIndex] as const),
    Match.when(
      'one_for_all',
      () => [0, ...Array.from({ length: Math.max(0, total - 1) }, (_, i) => i + 1)] as const,
    ),
    Match.when(
      'rest_for_one',
      () =>
        [
          failedIndex,
          ...Array.from({ length: Math.max(0, total - failedIndex - 1) }, (_, i) => failedIndex + 1 + i),
        ] as const,
    ),
    Match.exhaustive,
  )

export const decideRestart: RestartDecisionWorkflow = (input) =>
  Match.value(input).pipe(
    Match.when({ exitSuccess: true }, () => Either.right(new RestartDecisionContinue())),
    Match.when(
      { exitSuccess: false, intensityExceeded: true },
      () => Either.left(new RestartDecisionExhausted()),
    ),
    Match.orElse(() =>
      Either.right(
        new RestartDecisionRestart({
          indices: restartIndicesFor(input.strategy, input.failedIndex, input.totalChildren),
        }),
      )
    ),
  )
