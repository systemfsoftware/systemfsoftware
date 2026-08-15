import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Either from 'effect/Either'
import * as Match from 'effect/Match'
import * as S from 'effect/Schema'
import { restartIndicesFor } from './restart-decision.kernel.js'
import type { DecideInput } from './restart-decision.schema.js'

const RestartDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon/RestartDecision')
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

export type RestartDecisionWorkflow = Workflow.Workflow<
  DecideInput,
  RestartDecisionContinue | RestartDecisionRestart,
  RestartDecisionExhausted
>

export const decideRestart = Workflow.make(
  (command: DecideInput): Either.Either<RestartDecisionContinue | RestartDecisionRestart, RestartDecisionExhausted> =>
    Match.value(command).pipe(
      Match.when({ exitSuccess: true }, () => Either.right(new RestartDecisionContinue())),
      Match.when({ exitSuccess: false, intensityExceeded: true }, () => Either.left(new RestartDecisionExhausted())),
      Match.orElse(() =>
        Either.right(
          new RestartDecisionRestart({
            indices: restartIndicesFor(command.strategy, command.failedIndex, command.totalChildren),
          }),
        )
      ),
    ),
)
