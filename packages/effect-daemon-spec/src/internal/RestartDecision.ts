import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'

/**
 * The supervision strategies a restart decision covers.
 *
 * Declared here rather than imported from `restart-decision.schema.ts`: a kernel cell may
 * import no other cell, so a pure body owns its domain rather than borrowing a schema's.
 * The schema's `RestartStrategy` is the same literal union, so a decoded value satisfies
 * this structurally.
 */
export type RestartStrategyName = 'one_for_one' | 'one_for_all' | 'rest_for_one'

/**
 * The child indices a restart covers, by supervision strategy.
 *
 * A pure total function: the one part of the restart decision that is computation rather
 * than dispatch, so it lives here rather than in the workflow cell.
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
 * a property test, which an inline arrow is not.
 */
export const failedIndexAddressesAChild = (input: {
  readonly failedIndex: number
  readonly totalChildren: number
}): boolean => input.failedIndex < input.totalChildren

/** The strategies the restart law quantifies over. */
const RESTART_STRATEGIES = ['one_for_one', 'one_for_all', 'rest_for_one'] as const

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { it } = await import('@effect/vitest')
  const { FastCheck: fc } = await import('effect/testing')

  /**
   * A supervision tree with a failed child: a total, and a failed index inside it. The schema's
   * own filter guarantees `failedIndex < totalChildren`, so the arbitrary draws the same shape
   * rather than a wider one the kernel never sees.
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
}
