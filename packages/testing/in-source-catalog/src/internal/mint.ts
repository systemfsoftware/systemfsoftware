import type { Arbitrary } from 'effect/testing/FastCheck'
import type { LiteralBounded, PublishedCase, PublishedCases, RefuseHomes } from '../brand.js'
import { publishedCasesBrand, refuseHomesBrand } from '../brand.js'

/** @internal */
export const mintRefuseHomes = <A>(arbitrary: Arbitrary<A>): RefuseHomes<A> =>
  Object.assign(arbitrary, { [refuseHomesBrand]: 'refuse-homes' } as const)

/** @internal */
export const mintPublishedCases = <A, R, const E extends LiteralBounded<E>>(
  cases: readonly PublishedCase<A, R, E>[],
): PublishedCases<A, R> => ({
  cases,
  [publishedCasesBrand]: 'published-cases',
})
