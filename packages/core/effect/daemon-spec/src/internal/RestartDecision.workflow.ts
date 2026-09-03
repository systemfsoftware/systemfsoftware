/// <reference types="vitest/importMeta" />
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { catalog } from '@systemfsoftware/in-source-catalog'
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

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines the vitest collection flag as `undefined`, so this
  // branch is statically dead in the build and never enters the published module graph.
  const { it } = await import('@effect/vitest')
  const { FastCheck: fc } = await import('effect/testing')

  /**
   * A supervision tree with a failed child: a total, and a failed index inside it. The schema's
   * own filter guarantees `failedIndex < totalChildren`, so the arbitrary draws the same shape
   * rather than a wider one the decision never sees.
   */
  const tree = fc.integer({ min: 1, max: 32 }).chain((total) =>
    fc.tuple(fc.constant(total), fc.integer({ min: 0, max: total - 1 }))
  )

  const ascendingDistinct = (xs: readonly number[]): boolean =>
    xs.every((x, i) => i === 0 || x > (xs[i - 1] ?? Number.NEGATIVE_INFINITY))

  const subset = (inner: readonly number[], outer: readonly number[]): boolean => inner.every((x) => outer.includes(x))

  /**
   * Whatever the strategy, a restart set is a set of real child indices in a stable order: a
   * mutant that reversed the order, repeated an index, or ran one past the last child breaks it.
   */
  it.prop('∀t_RestartSet_⊆Children', [tree], ([[total, failedIndex]]) =>
    RESTART_STRATEGIES.every((strategy) => {
      const indices = restartIndicesFor(strategy, failedIndex, total)
      return ascendingDistinct(indices) && indices.every((x) => x >= 0 && x < total)
    }))

  /**
   * The three strategies are ordered by blast radius, and the ordering is containment:
   * one_for_one restarts the failed child, rest_for_one that child and its juniors, one_for_all
   * every child. An off-by-one in any branch breaks a containment the branch itself cannot see.
   */
  it.prop('∀t_BlastRadius_⊆Widening', [tree], ([[total, failedIndex]]) => {
    const one = restartIndicesFor('one_for_one', failedIndex, total)
    const rest = restartIndicesFor('rest_for_one', failedIndex, total)
    const all = restartIndicesFor('one_for_all', failedIndex, total)
    return subset(one, rest) && subset(rest, all)
  })

  /** one_for_all covers the whole tree, and rest_for_one exactly the failed child's suffix. */
  it.prop(
    '∀t_Cardinality_=Strategy',
    [tree],
    ([[total, failedIndex]]) =>
      restartIndicesFor('one_for_all', failedIndex, total).length === total &&
      restartIndicesFor('rest_for_one', failedIndex, total).length === total - failedIndex,
  )

  /**
   * The refusal region is the intensity conjunction: the exit is a failure and the restart
   * intensity budget is spent. Every independent field is quantified — strategy, tree size,
   * failed index — so a mutant that narrows the refusing conjunction on any free axis dies.
   */
  await catalog.laws({
    id: 'decideRestart',
    run: decideRestart,
    reserved: catalog.refuseHomes.region(
      fc
        .record(
          {
            strategy: fc.constantFrom(...RESTART_STRATEGIES),
            totalChildren: fc.integer({ min: 1, max: 32 }),
            failedIndex: fc.integer({ min: 0, max: 31 }),
            exitSuccess: fc.constant(false),
            intensityExceeded: fc.constant(true),
          },
          { noNullPrototype: true },
        )
        .map((shape) => DecideInput.make({ ...shape, failedIndex: shape.failedIndex % shape.totalChildren })),
    ),
    refused: Result.isFailure,
    published: catalog.contract([
      {
        label: 'continue',
        input: DecideInput.make({
          strategy: 'one_for_one',
          totalChildren: 3,
          failedIndex: 1,
          exitSuccess: true,
          intensityExceeded: true,
        }),
        project: (result: RestartDecisionOutcome) => {
          if (Result.isFailure(result)) return { tag: 'refused' }
          return { tag: result.success._tag }
        },
        expect: { tag: 'Continue' },
      },
      {
        label: 'restart',
        input: DecideInput.make({
          strategy: 'one_for_one',
          totalChildren: 3,
          failedIndex: 1,
          exitSuccess: false,
          intensityExceeded: false,
        }),
        project: (result: RestartDecisionOutcome) => {
          if (Result.isFailure(result)) return { tag: 'refused' }
          return { tag: result.success._tag }
        },
        expect: { tag: 'Restart' },
      },
    ]),
  })

  /**
   * The brand the interpreter dispatches on. It is a private symbol, so no consumer can
   * forge it and no structural value satisfies the decision types by accident; a refactor
   * that drops the field from the class leaves every `decide` result undispatchable,
   * which is what this observes.
   */
  it.prop('∀t_Restart_=BrandTypeId', [tree], ([[total, failedIndex]]) => {
    const decided = decideRestart({
      strategy: 'one_for_one',
      totalChildren: total,
      failedIndex,
      exitSuccess: false,
      intensityExceeded: false,
    })
    return Result.isSuccess(decided) && decided.success[RestartDecisionTypeId] === RestartDecisionTypeId
  })
}
