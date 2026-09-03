import type { Arbitrary } from 'effect/testing/FastCheck'

export const refuseHomesBrand = Symbol('in-source-catalog/refuse-homes')
export const publishedCasesBrand = Symbol('in-source-catalog/published-cases')

export type RefuseHomes<A> = Arbitrary<A> & {
  readonly [refuseHomesBrand]: 'refuse-homes'
}

type IsLiteralType<T> = T extends string ? string extends T ? false : true
  : T extends number ? number extends T ? false : true
  : T extends boolean ? boolean extends T ? false : true
  : false

type Primitive = string | number | boolean

export type LiteralBounded<E> = { readonly [K in keyof E]: IsLiteralType<E[K]> extends true ? Primitive : never }

export interface PublishedCase<A, R, E extends LiteralBounded<E>> {
  readonly label: string
  readonly input: A
  readonly project: (result: R) => Record<string, unknown>
  readonly expect: E
}

export interface PublishedCaseRuntime<A, R> {
  readonly label: string
  readonly input: A
  readonly project: (result: R) => Record<string, unknown>
  readonly expect: Readonly<Record<string, unknown>>
}

export interface PublishedCases<A, R> {
  readonly cases: readonly PublishedCaseRuntime<A, R>[]
  readonly [publishedCasesBrand]: 'published-cases'
}
