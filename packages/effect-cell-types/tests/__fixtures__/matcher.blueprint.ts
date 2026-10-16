import { Blueprint } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import type { Check } from './question.blueprint.js'

type Top<A = unknown> = A

export const TypeId = Symbol.for('~systemfsoftware/effect-cell-types/tests/Matcher')
export type TypeId = typeof TypeId

interface Case {
  readonly holds: (input: never) => boolean
  readonly handler: (input: never) => Top
}

export interface MatcherSpec {
  readonly cases: ReadonlyArray<Case>
}

export interface MatcherIndex {
  readonly Input: Top
  readonly Out: Top
}

/** What a finished matcher compiles to: the decision function itself, with its case count attached. */
export interface Policy<Input, Out> {
  (input: Input): Out
  readonly cases: number
}

type InputOf<X> = X extends MatcherIndex ? X['Input'] : never
type OutOf<X> = X extends MatcherIndex ? X['Out'] : never
type CheckInputOf<C> = C extends Check<infer Input> ? Input : never
type Returned<F> = F extends (...args: never[]) => infer R ? R : never
type MatcherOutOf<M> = M extends { readonly [Blueprint.IndexId]?: infer X } ? OutOf<X> : never

interface When extends Blueprint.Operation {
  readonly params: readonly [check: Check<InputOf<this['Index']>>, handler: (input: InputOf<this['Index']>) => Top]
  readonly lastFirst: Check<never>
  readonly lastRest: readonly [handler: (input: CheckInputOf<this['First']>) => Top]
  readonly out: Matcher<InputOf<this['Index']>, OutOf<this['Index']> | Returned<this['Args'][1]>>
}

interface Concat extends Blueprint.Operation {
  readonly params: readonly [other: Matcher<InputOf<this['Index']>, Top>]
  readonly lastFirst: Matcher<never, Top>
  readonly lastRest: readonly []
  readonly out: Matcher<InputOf<this['Index']>, OutOf<this['Index']> | MatcherOutOf<this['Args'][0]>>
  readonly last: <Input, Out>(
    other: Matcher<Input, Out>,
  ) => Blueprint.Applied<TypeId, 'concat', Concat, readonly [Matcher<Input, Out>]>
}

interface OrElse extends Blueprint.Operation {
  readonly params: readonly [fallback: (input: InputOf<this['Index']>) => Top]
  readonly lastRest: readonly []
  readonly out: Policy<InputOf<this['Index']>, OutOf<this['Index']> | Returned<this['Args'][0]>>
  readonly last: <Input, R>(
    fallback: (input: Input) => R,
  ) => Blueprint.Applied<TypeId, 'orElse', OrElse, readonly [(input: Input) => R]>
}

export interface MatcherOps {
  readonly when: When
  readonly concat: Concat
  readonly orElse: OrElse
}

export type Matcher<Input, Out> = Blueprint.Blueprint<
  TypeId,
  MatcherSpec,
  MatcherOps,
  { readonly Input: Input; readonly Out: Out }
>

type AnyMatcher = Matcher<never, Top>

const decide = (cases: ReadonlyArray<Case>, fallback: (input: never) => Top) => (input: never): Top =>
  Option.match(Arr.findFirst(cases, (c) => c.holds(input)), {
    onNone: () => fallback(input),
    onSome: (c) => c.handler(input),
  })

const Matchers = Blueprint.make<MatcherSpec, MatcherIndex>()(TypeId).operations<MatcherOps>()({
  operations: {
    when: (self: AnyMatcher, check: Check<never>, handler: (input: never) => Top): AnyMatcher =>
      Matchers.of({ cases: [...self.spec.cases, { holds: check.holds, handler }] }),
    concat: {
      isDataFirst: (args) => args.length === 2,
      run: (self: AnyMatcher, other: AnyMatcher): AnyMatcher =>
        Matchers.of({ cases: [...self.spec.cases, ...other.spec.cases] }),
    },
    orElse: (self: AnyMatcher, fallback: (input: never) => Top) =>
      Object.assign(decide(self.spec.cases, fallback), { cases: self.spec.cases.length }),
  },
  targets: {},
})

export const isMatcher = Matchers.is

/** Identity entrypoint: the input a matcher decides over. */
export const matcher = <Input>(): Matcher<Input, never> => Matchers.of({ cases: [] })

export const when = Matchers.operations.when

export const concat = Matchers.operations.concat

export const orElse = Matchers.operations.orElse
