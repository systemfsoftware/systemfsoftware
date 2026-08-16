import { it } from '@effect/vitest'
import { FastCheck as fc } from 'effect/testing'
import { restartIndicesFor } from '../restart-decision.kernel.js'

/**
 * A supervision tree with a failed child: a total, and a failed index inside it. The schema's
 * own filter guarantees `failedIndex < totalChildren`, so the arbitrary draws the same shape
 * rather than a wider one the kernel never sees.
 */
const tree = fc.integer({ min: 1, max: 32 }).chain((total) =>
  fc.tuple(fc.constant(total), fc.integer({ min: 0, max: total - 1 }))
)

const STRATEGIES = ['one_for_one', 'one_for_all', 'rest_for_one'] as const

const ascendingDistinct = (xs: readonly number[]): boolean =>
  xs.every((x, i) => i === 0 || x > (xs[i - 1] ?? Number.NEGATIVE_INFINITY))

const subset = (inner: readonly number[], outer: readonly number[]): boolean => inner.every((x) => outer.includes(x))

/**
 * Whatever the strategy, a restart set is a set of real child indices in a stable order: a
 * mutant that reversed the order, repeated an index, or ran one past the last child breaks it.
 */
it.prop('∀t_RestartSet_⊆Children', [tree], ([[total, failedIndex]]) =>
  STRATEGIES.every((strategy) => {
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
