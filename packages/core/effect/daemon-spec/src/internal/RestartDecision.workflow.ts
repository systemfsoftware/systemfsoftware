import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { DecideInput } from './RestartDecision.schema.js'

/**
 * The supervision strategies a restart decision covers.
 *
 * Declared here rather than imported from `restart-decision.schema.ts`: a decision's pure
 * body may import no other cell's values, so the decision owns its domain rather than
 * borrowing a schema's. The schema's `RestartStrategy` is the same literal union, so a
 * decoded value satisfies this structurally.
 */
/** @internal */
export type RestartStrategyName = 'one_for_one' | 'one_for_all' | 'rest_for_one'

/**
 * The child indices a restart covers, by supervision strategy.
 *
 * A pure total function: the one part of the restart decision that is computation rather
 * than dispatch, so it lives in the decision cell beside the `Workflow.make` it serves.
 */
/** @internal */
const restartIndicesFor = (
  strategy: RestartStrategyName,
  failedIndex: number,
  total: number,
): readonly [number, ...readonly number[]] =>
  Match.value(strategy).pipe(
    Match.when('one_for_one', () => [failedIndex] as const),
    Match.when('one_for_all', () => Arr.range(0, total - 1)),
    Match.when('rest_for_one', () => Arr.range(failedIndex, total - 1)),
    Match.exhaustive,
  )

const RestartDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon/RestartDecision')
type RestartDecisionTypeId = typeof RestartDecisionTypeId

/** @internal */
export class RestartDecisionContinue extends S.TaggedClass<RestartDecisionContinue>()('Continue', {}) {
  readonly [RestartDecisionTypeId] = RestartDecisionTypeId
}
/** @internal */
export class RestartDecisionRestart extends S.TaggedClass<RestartDecisionRestart>()('Restart', {
  indices: S.NonEmptyArray(S.Int),
}) {
  readonly [RestartDecisionTypeId] = RestartDecisionTypeId
}
/** @internal */
export class RestartDecisionExhausted extends S.TaggedError<RestartDecisionExhausted>()('Exhausted', {}) {
  readonly [RestartDecisionTypeId] = RestartDecisionTypeId
}

/**
 * The outcome a restart decision produces. Named here, at the module that owns the
 * decision, so consumers import the contract instead of reconstructing it with
 * `ReturnType<…>` — which couples them to this signature's shape and attaches no
 * documentation of its own.
 */
/** @internal */
export type RestartDecisionOutcome = Result.Result<
  RestartDecisionContinue | RestartDecisionRestart,
  RestartDecisionExhausted
>

/** @internal */
export type RestartDecisionWorkflow = Workflow.Workflow<
  DecideInput,
  RestartDecisionContinue | RestartDecisionRestart,
  RestartDecisionExhausted
>

/** @internal */
export const decideRestart = Workflow.make(
  DecideInput,
  (command): RestartDecisionOutcome =>
    Match.value(command).pipe(
      Match.when({ exitSuccess: true }, () => Result.succeed(RestartDecisionContinue.make())),
      Match.when({ exitSuccess: false, intensityExceeded: true }, () => Result.fail(RestartDecisionExhausted.make())),
      Match.orElse(() =>
        Result.succeed(
          RestartDecisionRestart.make({
            indices: restartIndicesFor(command.strategy, command.failedIndex, command.totalChildren),
          }),
        )
      ),
    ),
)
