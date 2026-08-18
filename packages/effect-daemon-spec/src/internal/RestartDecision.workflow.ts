import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import type { DecideInput } from './RestartDecision.schema.js'

/**
 * The supervision strategies a restart decision covers.
 *
 * Declared here rather than imported from `restart-decision.schema.ts`: a decision's pure
 * body may import no other cell's values, so the decision owns its domain rather than
 * borrowing a schema's. The schema's `RestartStrategy` is the same literal union, so a
 * decoded value satisfies this structurally.
 */
export type RestartStrategyName = 'one_for_one' | 'one_for_all' | 'rest_for_one'

/**
 * The child indices a restart covers, by supervision strategy.
 *
 * A pure total function: the one part of the restart decision that is computation rather
 * than dispatch, so it lives in the decision cell beside the `Workflow.make` it serves.
 */
export const restartIndicesFor = (
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

/**
 * The cross-field invariant the decode input carries: a failed child's index addresses one of
 * the children that exist.
 *
 * It lives here rather than inline in `Schema.filter` because naming it makes it reachable by
 * a property test, which an inline arrow is not. The schema imports the name to build its
 * filter; the decision file is where the invariant is owned.
 */
export const failedIndexAddressesAChild = (input: {
  readonly failedIndex: number
  readonly totalChildren: number
}): boolean => input.failedIndex < input.totalChildren

/** The strategies the restart law quantifies over. */
const RESTART_STRATEGIES = ['one_for_one', 'one_for_all', 'rest_for_one'] as const

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
  (command: DecideInput): Result.Result<RestartDecisionContinue | RestartDecisionRestart, RestartDecisionExhausted> =>
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
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and never enters the published module graph.
  const { it } = await import('@effect/vitest')
  const { refutes } = await import('@systemfsoftware/effect-schema-law')
  const { expect } = await import('vitest')
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
   * `indices: S.NonEmptyArray(S.Int)` puts both refinements on one array node under v4, so
   * only integrality is attributable to a per-node weakening — the refutation harness
   * cannot explain an empty array as the failure of a single check, and a generator that
   * emits one discriminates nothing. Integrality rides the refutation law; emptiness is
   * asserted directly against the decoder just below, which is the only honest split.
   */
  refutes(RestartDecisionRestart, {
    IndicesNonInteger: fc.constant({ _tag: 'Restart', indices: [1.5] }),
  })

  it('Should_RefuseTheDecision_When_TheRestartCarriesNoIndices', () => {
    const decoded = S.decodeUnknownExit(RestartDecisionRestart)({ _tag: 'Restart', indices: [] })
    expect(decoded._tag).toBe('Failure')
  })

  /**
   * The brand the interpreter dispatches on. It is a private symbol, so no consumer can
   * forge it and no structural value satisfies the decision types by accident; a refactor
   * that drops the field from the class leaves every `decide` result undispatchable,
   * which is what this observes.
   */
  it('Should_CarryTheDecisionBrand_When_DecidingARestart', () => {
    const decided = decideRestart({
      strategy: 'one_for_one',
      totalChildren: 3,
      failedIndex: 1,
      exitSuccess: false,
      intensityExceeded: false,
    })
    expect(Result.isSuccess(decided)).toBe(true)
    if (Result.isSuccess(decided)) {
      expect(decided.success[RestartDecisionTypeId]).toBe(RestartDecisionTypeId)
    }
  })
}