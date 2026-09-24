import { dual } from 'effect/Function'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import * as Predicate from 'effect/Predicate'

type Top<A = unknown> = A

type Branded<T extends symbol> = { readonly [K in T]: T }

export type Combinator<Spec> = (spec: Spec, ...args: never[]) => Spec

export type Projection<Spec> = (spec: Spec) => Top

export type ArgumentsOf<F, Spec> = F extends (spec: Spec, ...args: infer A) => Spec ? A : never

export type Resource<
  T extends symbol,
  Spec,
  Combinators extends Readonly<Record<string, Combinator<Spec>>>,
  Projections extends Readonly<Record<string, Projection<Spec>>>,
> =
  & Pipeable
  & Branded<T>
  & { readonly spec: Spec }
  & {
    readonly [K in keyof Combinators]: (
      ...args: ArgumentsOf<Combinators[K], Spec>
    ) => Resource<T, Spec, Combinators, Projections>
  }
  & { readonly [K in keyof Projections]: ReturnType<Projections[K]> }

export interface Dual<Args extends ReadonlyArray<Top>, R> {
  (...args: Args): <Self extends R>(self: Self) => Self
  <Self extends R>(self: Self, ...args: Args): Self
}

export interface Definition<
  T extends symbol,
  Spec,
  Combinators extends Readonly<Record<string, Combinator<Spec>>>,
  Projections extends Readonly<Record<string, Projection<Spec>>>,
> {
  readonly TypeId: T
  readonly is: (u: unknown) => u is Resource<T, Spec, Combinators, Projections>
  readonly of: (spec: Spec) => Resource<T, Spec, Combinators, Projections>
  readonly combinators: {
    readonly [K in keyof Combinators]: Dual<
      ArgumentsOf<Combinators[K], Spec>,
      Resource<T, Spec, Combinators, Projections>
    >
  }
}

const MethodsId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/Resource/methods')

type Methods<Combinators> = { readonly [K in keyof Combinators]: (...args: ReadonlyArray<Top>) => object }

function assertCarriesMethods<Combinators>(
  _self: object,
): asserts _self is { readonly [MethodsId]: Methods<Combinators> } {}

const methodsOf = <Combinators>(self: object): Methods<Combinators> => {
  assertCarriesMethods<Combinators>(self)
  return self[MethodsId]
}

function assertKeysOf<O>(_keys: ReadonlyArray<string>): asserts _keys is ReadonlyArray<keyof O & string> {}

const keysOf = <O extends object>(o: O): ReadonlyArray<keyof O & string> => {
  const keys = Object.keys(o)
  assertKeysOf<O>(keys)
  return keys
}

type AnyCombinator<Spec> = (spec: Spec, ...args: ReadonlyArray<Top>) => Spec

function assertApplicable<Spec>(_combinator: Combinator<Spec>): asserts _combinator is AnyCombinator<Spec> {}

function assertResource<
  T extends symbol,
  Spec,
  Combinators extends Readonly<Record<string, Combinator<Spec>>>,
  Projections extends Readonly<Record<string, Projection<Spec>>>,
>(_self: object): asserts _self is Resource<T, Spec, Combinators, Projections> {}

function assertCombinators<
  T extends symbol,
  Spec,
  Combinators extends Readonly<Record<string, Combinator<Spec>>>,
  Projections extends Readonly<Record<string, Projection<Spec>>>,
>(_duals: object): asserts _duals is Definition<T, Spec, Combinators, Projections>['combinators'] {}

const applied = <Spec>(combinator: Combinator<Spec>) => {
  assertApplicable(combinator)
  return combinator
}

export const make = <Spec>() =>
<
  T extends symbol,
  const Combinators extends Readonly<Record<string, Combinator<Spec>>>,
  const Projections extends Readonly<Record<string, Projection<Spec>>>,
>(options: {
  readonly typeId: T
  readonly combinators: Combinators
  readonly projections: Projections
}): Definition<T, Spec, Combinators, Projections> => {
  const { typeId, combinators, projections } = options
  const is = (u: unknown): u is Resource<T, Spec, Combinators, Projections> => Predicate.hasProperty(u, typeId)
  const of = (spec: Spec): Resource<T, Spec, Combinators, Projections> => {
    const methods = Object.fromEntries(
      Object.entries(combinators).map(([name, combinator]) => [
        name,
        (...args: ReadonlyArray<Top>) => of(applied(combinator)(spec, ...args)),
      ]),
    )
    const getters = Object.fromEntries(
      Object.entries(projections).map(([name, projection]) => [
        name,
        { get: () => projection(spec), enumerable: true },
      ]),
    )
    const self = Object.defineProperties(
      { ...methods, ...Prototype, spec, [typeId]: typeId, [MethodsId]: methods },
      getters,
    )
    assertResource<T, Spec, Combinators, Projections>(self)
    return self
  }
  const duals = Object.fromEntries(
    keysOf(combinators).map((name) => [
      name,
      dual(
        (args: IArguments) => is(args[0]),
        (self: object, ...args: ReadonlyArray<Top>) => methodsOf<Combinators>(self)[name](...args),
      ),
    ]),
  )
  assertCombinators<T, Spec, Combinators, Projections>(duals)
  return { TypeId: typeId, is, of, combinators: duals }
}

export type Of<D> = D extends Definition<infer T, infer Spec, infer Combinators, infer Projections>
  ? Resource<T, Spec, Combinators, Projections>
  : never
