import { dual } from 'effect/Function'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import * as Predicate from 'effect/Predicate'

type Top<A = unknown> = A

type Branded<T extends symbol> = { readonly [K in T]: T }

export const IndexId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/Blueprint/index')
export type IndexId = typeof IndexId

/**
 * What one operation does to a blueprint's type, written once as a type-level function in the
 * `effect/HKT` encoding. The kind fills `Self` (the receiver), `Index` (its type index), `Args` (the
 * call's arguments) and, for the data-last form, `First` (the first argument, before the receiver
 * is known); it reads back `params`, `lastRest`, and `out`. The method, the data-first dual, and the
 * data-last dual are all derived from this one transition.
 */
export interface Operation {
  readonly kind: 'operation'
  readonly Self: Top
  readonly Index: Top
  readonly Args: ReadonlyArray<Top>
  readonly First: Top
  /** The arguments after the receiver. A {@link Conditional} operation whose params are `never` for an index is absent from it. */
  readonly params: ReadonlyArray<Top>
  /** The data-last first argument, as far as it is known before the receiver is. */
  readonly lastFirst: Top
  /** The data-last arguments after the first, typed from `First` alone. */
  readonly lastRest: ReadonlyArray<Top>
  readonly out: Top
}

/** A compilation target read as a property, such as `.scoped` or `.layer`. A {@link Conditional} target is absent where `target` is `never`. */
export interface Target {
  readonly kind: 'target'
  readonly Self: Top
  readonly Index: Top
  readonly target: Top
}

/**
 * Marks an operation or target whose presence depends on the index. Only a marked member is dropped
 * where its params or target are `never`; every other member stays present, so code generic over the
 * index can still read it.
 */
export interface Conditional {
  readonly presence: 'conditional'
}

type TailOf<P extends ReadonlyArray<Top>> = P extends readonly [Top, ...infer Rest] ? Rest
  : P extends readonly [(infer _First)?, ...infer Rest] ? Rest
  : []

/** A configuration step whose arguments do not depend on the index: it returns the same blueprint. */
export interface Step<Params extends ReadonlyArray<Top>> extends Operation {
  readonly params: Params
  readonly lastFirst: Params extends readonly [infer First, ...ReadonlyArray<Top>] ? First : never
  readonly lastRest: TailOf<Params>
  readonly out: this['Self']
}

/** A compilation target whose type does not depend on the index. */
export interface Get<A> extends Target {
  readonly target: A
}

export type ParamsOf<F extends Operation, Self, X> = Readonly<
  (F & { readonly Self: Self; readonly Index: X })['params']
>

export type OutOf<F extends Operation, Self, X, A> =
  (F & { readonly Self: Self; readonly Index: X; readonly Args: A })['out']

export type LastFirstOf<F extends Operation> = F['lastFirst']

export type LastRestOf<F extends Operation, P> = Readonly<(F & { readonly First: P })['lastRest']>

export type TargetOf<F extends Target, Self, X> = (F & { readonly Self: Self; readonly Index: X })['target']

export type IndexOf<Self> = Self extends { readonly [IndexId]?: infer X } ? X : never

type OperationKeys<Ops> = {
  readonly [K in keyof Ops]: Ops[K] extends { readonly kind: 'operation' } ? K : never
}[keyof Ops]

type TargetKeys<Ops> = { readonly [K in keyof Ops]: Ops[K] extends { readonly kind: 'target' } ? K : never }[keyof Ops]

/** Defers the receiver's own type so a blueprint can name itself in its methods. */
interface Receiver<T extends symbol, Spec, Ops, X> {
  readonly self: Blueprint<T, Spec, Ops, X>
}

type Method<F, R extends { readonly self: Top }, X> = F extends Operation
  ? <const A extends ParamsOf<F, R['self'], X>>(...args: A) => OutOf<F, R['self'], X, A>
  : never

type Present<A, K> = [A] extends [never] ? never : K

type PresentIf<F, A, K> = F extends Conditional ? Present<A, K> : K

type Methods<Ops, R extends { readonly self: Top }, X> = {
  readonly [
    K in OperationKeys<Ops> as Ops[K] extends Operation ? PresentIf<Ops[K], ParamsOf<Ops[K], Top, X>, K> : never
  ]: Method<
    Ops[K],
    R,
    X
  >
}

type Targets<Ops, R extends { readonly self: Top }, X> = {
  readonly [K in TargetKeys<Ops> as Ops[K] extends Target ? PresentIf<Ops[K], TargetOf<Ops[K], Top, X>, K> : never]:
    Ops[K] extends Target ? TargetOf<Ops[K], R['self'], X> : never
}

/**
 * A cold, immutable description of an external target: its spec, its type index, `pipe`, and one
 * method per operation. It never acquires anything; `.scoped` and `.layer` compile it into acquisition.
 */
export type Blueprint<T extends symbol, Spec, Ops, X = Spec> =
  & Pipeable
  & Branded<T>
  & { readonly spec: Spec; readonly [IndexId]?: X }
  & Methods<Ops, Receiver<T, Spec, Ops, X>, X>
  & Targets<Ops, Receiver<T, Spec, Ops, X>, X>

/** A blueprint of kind `T` that carries the operation named `K`. */
export type Carrying<T extends symbol, K extends PropertyKey> = Branded<T> & { readonly [P in K]: Top }

/** The data-last form applied to its receiver: the result is the transition's. */
export type Applied<T extends symbol, K extends PropertyKey, F extends Operation, A> = <Self extends Carrying<T, K>>(
  self: Self & ([A] extends [ParamsOf<F, Self, IndexOf<Self>>] ? object : never),
) => OutOf<F, Self, IndexOf<Self>, A>

export type RestOf<T extends symbol, K extends PropertyKey, F extends Operation, P> = [P] extends [Branded<T>]
  ? [P] extends [Carrying<T, K>] ? ParamsOf<F, P, IndexOf<P>> : never
  : LastRestOf<F, P>

export type DualOut<T extends symbol, K extends PropertyKey, F extends Operation, P, R extends ReadonlyArray<Top>> =
  [P] extends [Branded<T>] ? OutOf<F, P, IndexOf<P>, R>
    : Applied<T, K, F, readonly [P, ...R]>

export interface DataFirst<T extends symbol, K extends PropertyKey, F extends Operation> {
  <const P extends Carrying<T, K>, const R extends ParamsOf<F, P, IndexOf<P>>>(self: P, ...rest: R): OutOf<
    F,
    P,
    IndexOf<P>,
    R
  >
}

/** Both forms in one signature: the first argument decides, so nested data-first calls infer like any generic call. */
export interface Either<T extends symbol, K extends PropertyKey, F extends Operation> {
  <const P extends Branded<T> | LastFirstOf<F>, const R extends RestOf<T, K, F, P>>(first: P, ...rest: R): DualOut<
    T,
    K,
    F,
    P,
    R
  >
}

/**
 * The same-name dual of an operation. An operation whose first data-last argument is a callback typed
 * by the index declares `last` for that form.
 */
export type Dual<T extends symbol, K extends PropertyKey, F extends Operation> = F extends { readonly last: infer L }
  ? L & DataFirst<T, K, F>
  : Either<T, K, F>

type StepImpl<Spec> = (spec: Spec, ...args: never[]) => Spec

type TargetImpl<Spec> = (spec: Spec) => Top

type ArgumentsOf<F, Spec> = F extends (spec: Spec, ...args: infer A) => Spec ? A : never

type ResultOf<F> = F extends (...args: never[]) => infer A ? A : never

/** The operations a set of index-free steps and targets declares. */
export type Derived<Spec, Steps, Targets> =
  & { readonly [K in keyof Steps]: Step<ArgumentsOf<Steps[K], Spec>> }
  & { readonly [K in keyof Targets]: Get<ResultOf<Targets[K]>> }

/**
 * The runtime of one operation or target, over the receiver. Its agreement with the transition is the
 * one fact the type checker cannot see; each operation's behaviour tests carry it.
 */
export type Implementation = ((self: never, ...args: never[]) => Top) | {
  readonly run: (self: never, ...args: never[]) => Top
  readonly isDataFirst: (args: IArguments) => boolean
}

export interface Implementations<Ops> {
  readonly operations: { readonly [K in OperationKeys<Ops>]: Implementation }
  readonly targets: { readonly [K in TargetKeys<Ops>]: (self: never) => Top }
}

export interface Definition<T extends symbol, Spec, Ops, X> {
  readonly TypeId: T
  readonly is: (u: unknown) => u is Blueprint<T, Spec, Ops, X>
  /** Mints a blueprint over a spec; the identity entrypoint of the declaring module is its only caller. */
  readonly of: <I extends X = X>(spec: Spec) => Blueprint<T, Spec, Ops, I>
  readonly operations: { readonly [K in OperationKeys<Ops>]: Ops[K] extends Operation ? Dual<T, K, Ops[K]> : never }
}

export type Of<D> = D extends Definition<infer T, infer Spec, infer Ops, infer X> ? Blueprint<T, Spec, Ops, X> : never

type Callable = (...args: ReadonlyArray<Top>) => Top

function assertCallable(_f: Implementation | Callable): asserts _f is Callable {}

function assertCallableValue(_u: unknown): asserts _u is Callable {}

function assertSpecified<Spec>(_self: object): asserts _self is { readonly spec: Spec } {}

function assertBlueprint<T extends symbol, Spec, Ops, X>(_u: unknown): asserts _u is Blueprint<T, Spec, Ops, X> {}

function assertDuals<T extends symbol, Spec, Ops, X>(
  _duals: object,
): asserts _duals is Definition<T, Spec, Ops, X>['operations'] {}

const runOf = (implementation: Implementation): Callable => {
  const run = Predicate.isFunction(implementation) ? implementation : implementation.run
  assertCallable(run)
  return run
}

const installMethod = (prototype: object) => ([name, implementation]: readonly [string, Implementation]): void => {
  const run = runOf(implementation)
  Object.defineProperty(prototype, name, {
    value: function(this: object, ...args: ReadonlyArray<Top>) {
      return run(this, ...args)
    },
  })
}

const installGetter = (prototype: object) => ([name, implementation]: readonly [string, Implementation]): void => {
  const run = runOf(implementation)
  Object.defineProperty(prototype, name, {
    get(this: object) {
      return run(this)
    },
    enumerable: true,
  })
}

/** The dual calls the receiver's own method, so a variant that shares the TypeId keeps its own step. */
const callMethod = (name: string) => (self: object, ...args: ReadonlyArray<Top>): Top => {
  const method: Top = Reflect.get(self, name)
  assertCallableValue(method)
  return Reflect.apply(method, self, args)
}

const isDataFirstOf = (implementation: Implementation, is: (u: Top) => boolean) =>
  Predicate.isFunction(implementation) ? (args: IArguments) => is(args[0]) : implementation.isDataFirst

const define = <T extends symbol, Spec, Ops, X>(
  typeId: T,
  operations: Readonly<Record<string, Implementation>>,
  targets: Readonly<Record<string, Implementation>>,
): Definition<T, Spec, Ops, X> => {
  const prototype: object = { ...Prototype, [typeId]: typeId }
  Object.entries(operations).forEach(installMethod(prototype))
  Object.entries(targets).forEach(installGetter(prototype))
  const is = (u: unknown): u is Blueprint<T, Spec, Ops, X> => Predicate.hasProperty(u, typeId)
  const of = <I extends X = X>(spec: Spec): Blueprint<T, Spec, Ops, I> => {
    const self: Top = Object.freeze(Object.assign(Object.create(prototype), { spec }))
    assertBlueprint<T, Spec, Ops, I>(self)
    return self
  }
  const duals = Object.fromEntries(
    Object.entries(operations).map(([name, implementation]) => [
      name,
      dual(isDataFirstOf(implementation, is), callMethod(name)),
    ]),
  )
  assertDuals<T, Spec, Ops, X>(duals)
  return { TypeId: typeId, is, of, operations: duals }
}

function assertApplicable<Spec, A>(
  _run: (spec: Spec, ...args: never[]) => A,
): asserts _run is (spec: Spec, ...args: ReadonlyArray<Top>) => A {}

const onSpec =
  <Spec, A>(run: (spec: Spec, ...args: never[]) => A) => (self: object, ...args: ReadonlyArray<Top>): A => {
    assertSpecified<Spec>(self)
    assertApplicable(run)
    return run(self.spec, ...args)
  }

/**
 * Declares a blueprint kind over a spec. `steps` and `targets` suit a blueprint whose operations do
 * not depend on a type index; `operations` takes one transition per operation for one that does.
 */
export const make = <Spec, X = Spec>() => <T extends symbol>(typeId: T) => ({
  steps: <
    const Steps extends Readonly<Record<string, StepImpl<Spec>>>,
    const Targets extends Readonly<Record<string, TargetImpl<Spec>>>,
  >(members: {
    readonly steps: Steps
    readonly targets: Targets
  }): Definition<T, Spec, Derived<Spec, Steps, Targets>, X> => {
    const definition: Definition<T, Spec, Derived<Spec, Steps, Targets>, X> = define(
      typeId,
      Object.fromEntries(
        Object.entries(members.steps).map((
          [name, step],
        ) => [
          name,
          (self: object, ...args: ReadonlyArray<Top>) => definition.of(onSpec<Spec, Spec>(step)(self, ...args)),
        ]),
      ),
      Object.fromEntries(Object.entries(members.targets).map(([name, target]) => [name, onSpec<Spec, Top>(target)])),
    )
    return definition
  },
  operations: <Ops>() => (implementations: Implementations<Ops>): Definition<T, Spec, Ops, X> => {
    const operations: Readonly<Record<string, Implementation>> = implementations.operations
    const targets: Readonly<Record<string, Implementation>> = implementations.targets
    return define(typeId, operations, targets)
  },
})
