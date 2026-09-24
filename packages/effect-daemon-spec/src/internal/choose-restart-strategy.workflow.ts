/// <reference types="vitest/importMeta" />
import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
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

/** The strategies the restart law quantifies over. */
const RESTART_STRATEGIES = ['one_for_one', 'one_for_all', 'rest_for_one'] as const

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
 * The decision channel: the two outcomes a cooldown-or-restart choice is made between, as
 * one schema the workflow declares. The error channel carries `RestartDecisionExhausted`, so
 * the compiler holds the three-way dispatch over the encoded tags of both channels.
 */
/** @internal */
export const RestartDecision = S.Union([RestartDecisionContinue, RestartDecisionRestart])
/** @internal */
export type RestartDecision = typeof RestartDecision.Type

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

/**
 * The restart decision's encoded form: what a cell's `write` handler receives once the
 * library has encoded the decision. Named here so a handler types against the edge the
 * library enforces instead of restating the payload.
 */
/** @internal */
export type RestartDecisionRestartEncoded = (typeof RestartDecisionRestart)['Encoded']

/** @internal */
export const chooseRestartStrategy = Workflow.make({
  command: DecideInput,
  decision: RestartDecision,
  error: RestartDecisionExhausted,
  decide: (command): RestartDecisionOutcome =>
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
})

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and never enters the published module graph.
  const { it } = await import('@systemfsoftware/vitest')

  const previousOrNegInf = (xs: readonly number[], i: number): number =>
    Option.getOrElse(Option.fromNullishOr(xs[i - 1]), () => Number.NEGATIVE_INFINITY)

  const isAscendingAt = (xs: readonly number[], i: number, x: number): boolean =>
    Match.value(i === 0).pipe(
      Match.when(true, () => true),
      Match.when(false, () => x > previousOrNegInf(xs, i)),
      Match.exhaustive,
    )

  const ascendingDistinct = (xs: readonly number[]): boolean => xs.every((x, i) => isAscendingAt(xs, i, x))

  const subset = (inner: readonly number[], outer: readonly number[]): boolean => inner.every((x) => outer.includes(x))

  const isChildIndex = (x: number, total: number): boolean =>
    Match.value(x >= 0).pipe(
      Match.when(true, () => x < total),
      Match.when(false, () => false),
      Match.exhaustive,
    )

  const allIndicesInTree = (indices: readonly number[], total: number): boolean =>
    indices.every((x) => isChildIndex(x, total))

  const restartSetIsValid = (indices: readonly number[], total: number): boolean =>
    Match.value(ascendingDistinct(indices)).pipe(
      Match.when(true, () => allIndicesInTree(indices, total)),
      Match.when(false, () => false),
      Match.exhaustive,
    )

  /**
   * A supervision tree with a failed child: a total, and a failed index inside it. The schema's
   * own filter guarantees `failedIndex < totalChildren`, so the arbitrary draws the same shape
   * rather than a wider one the decision never sees.
   *
   * Whatever the strategy, a restart set is a set of real child indices in a stable order: a
   * mutant that reversed the order, repeated an index, or ran one past the last child breaks it.
   */
  it.prop(
    '∀t_RestartSet_⊆Children',
    { of: [DecideInput], subject: restartIndicesFor },
    (subject, [input]) =>
      RESTART_STRATEGIES.every((strategy) =>
        restartSetIsValid(subject(strategy, input.failedIndex, input.totalChildren), input.totalChildren)
      ),
  )

  const blastRadiusWidens = (one: readonly number[], rest: readonly number[], all: readonly number[]): boolean =>
    Match.value(subset(one, rest)).pipe(
      Match.when(true, () => subset(rest, all)),
      Match.when(false, () => false),
      Match.exhaustive,
    )

  /**
   * The three strategies are ordered by blast radius, and the ordering is containment:
   * one_for_one restarts the failed child, rest_for_one that child and its juniors, one_for_all
   * every child. An off-by-one in any branch breaks a containment the branch itself cannot see.
   */
  it.prop(
    '∀t_BlastRadius_⊆Widening',
    { of: [DecideInput], subject: restartIndicesFor },
    (subject, [input]) =>
      blastRadiusWidens(
        subject('one_for_one', input.failedIndex, input.totalChildren),
        subject('rest_for_one', input.failedIndex, input.totalChildren),
        subject('one_for_all', input.failedIndex, input.totalChildren),
      ),
  )

  const oneForAllCoversTree = (forAll: readonly number[], total: number): boolean => forAll.length === total

  const restForOneIsSuffix = (restForOne: readonly number[], total: number, failedIndex: number): boolean =>
    restForOne.length === total - failedIndex

  const cardinalityMatchesStrategy = (
    forAll: readonly number[],
    restForOne: readonly number[],
    total: number,
    failedIndex: number,
  ): boolean =>
    Match.value(oneForAllCoversTree(forAll, total)).pipe(
      Match.when(true, () => restForOneIsSuffix(restForOne, total, failedIndex)),
      Match.when(false, () => false),
      Match.exhaustive,
    )

  /** one_for_all covers the whole tree, and rest_for_one exactly the failed child's suffix. */
  it.prop(
    '∀t_Cardinality_=Strategy',
    { of: [DecideInput], subject: restartIndicesFor },
    (subject, [input]) =>
      cardinalityMatchesStrategy(
        subject('one_for_all', input.failedIndex, input.totalChildren),
        subject('rest_for_one', input.failedIndex, input.totalChildren),
        input.totalChildren,
        input.failedIndex,
      ),
  )
}
