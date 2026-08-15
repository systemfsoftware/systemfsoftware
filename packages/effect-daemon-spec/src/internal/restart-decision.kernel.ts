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
