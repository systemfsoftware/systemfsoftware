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
 * than dispatch, so it lives here rather than in the emitted workflow cell.
 */
export const restartIndicesFor = (
  strategy: RestartStrategyName,
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
