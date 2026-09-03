import type { Arbitrary } from 'effect/testing/FastCheck'

const refuseHomesBrand = Symbol('in-source-catalog/refuse-homes')
const publishedCasesBrand = Symbol('in-source-catalog/published-cases')

export type RefuseHomes<A> = Arbitrary<A> & {
  readonly [refuseHomesBrand]: 'refuse-homes'
}

export interface PublishedCase<A, R> {
  readonly label: string
  readonly input: A
  readonly project: (result: R) => Readonly<Record<string, unknown>>
  readonly expect: Readonly<Record<string, unknown>>
}

export interface PublishedCases<A, R> {
  readonly cases: readonly PublishedCase<A, R>[]
  readonly [publishedCasesBrand]: 'published-cases'
}

export const mintRefuseHomes = <A>(arbitrary: Arbitrary<A>): RefuseHomes<A> =>
  Object.assign(arbitrary, { [refuseHomesBrand]: 'refuse-homes' } as const)

export const mintPublishedCases = <A, R>(cases: readonly PublishedCase<A, R>[]): PublishedCases<A, R> => ({
  cases,
  [publishedCasesBrand]: 'published-cases',
})
