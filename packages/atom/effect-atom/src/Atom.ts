/**
 * Reactive state primitives for values managed by a registry.
 *
 * An `Atom` describes how to produce or update one piece of reactive state. The
 * registry runs atom reads, remembers current values, tracks dependencies
 * between atoms, starts effects and streams, and cleans up atoms that are no
 * longer used. This module includes the atom constructors and update helpers
 * used for cached values, effect-backed values, streams, browser state, stored
 * values, and server-rendered values.
 *
 * @since 4.0.0
 */
import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Context from 'effect/Context'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import type { LazyArg } from 'effect/Function'
import { constTrue, constVoid, dual, pipe } from 'effect/Function'
import type { Inspectable } from 'effect/Inspectable'
import * as Layer from 'effect/Layer'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import type { Pipeable } from 'effect/Pipeable'
import * as Predicate from 'effect/Predicate'
import * as Pull from 'effect/Pull'
import type { ReadonlyRecord } from 'effect/Record'
import * as Scheduler from 'effect/Scheduler'
import * as Schema from 'effect/Schema'
import * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import * as SubscriptionRef from 'effect/SubscriptionRef'
import type { NoInfer } from 'effect/Types'
import * as KeyValueStore from 'effect/unstable/persistence/KeyValueStore'
import * as Reactivity from 'effect/unstable/reactivity/Reactivity'
import {
  AtomProto,
  isAtom,
  isWritable,
  readable,
  removeTtl,
  transform,
  TypeId,
  type With,
  writable,
  WritableTypeId,
} from './AtomCore.js'
export {
  isAtom,
  isWritable,
  readable,
  setIdleTTL,
  transform,
  TypeId,
  type With,
  writable,
  WritableTypeId,
} from './AtomCore.js'
import * as Result from 'effect/Result'
import { Current } from './Registry.js'
import * as Registry from './Registry.js'
import * as AsyncResult from './Result.js'

/**
 * Reactive value read by a registry, with metadata controlling caching, laziness, refresh behavior, and initial value targeting.
 *
 * @since 4.0.0
 */
export interface Atom<A = unknown> extends Pipeable, Inspectable {
  readonly [TypeId]: TypeId
  readonly keepAlive: boolean
  readonly lazy: boolean
  readonly read: (get: AtomContext) => A
  equals(value: A, next: A): boolean
  readonly refresh?: ((f: <A>(atom: Atom<A>) => void) => void) | undefined
  readonly label?: readonly [name: string, stack: string]
  readonly idleTTL?: number
  readonly initialValueTarget?: Atom<A>
}
type Top<A = unknown> = A
type AnyAtom<A = unknown> = Atom<A>
type AnyAtomResultFn<Arg = unknown, A = unknown, E = unknown> = AtomResultFn<Arg, A, E>
type AnyResult<A = unknown, E = unknown> = AsyncResult.Result<A, E>
type AnyReactivityKeys<K = unknown> = readonly K[] | ReadonlyRecord<string, readonly K[]>

/**
 * Extracts the value type produced by an `Atom`.
 *
 * @since 4.0.0
 */
export type Type<T extends AnyAtom> = T extends Atom<infer A> ? A : never

/**
 * Extracts the success value type from an atom whose value is an `AsyncResult`.
 *
 * @since 4.0.0
 */
export type Success<T extends AnyAtom> = T extends Atom<AsyncResult.Result<infer A, infer _>> ? A : never

/**
 * Extracts the item type from an atom whose value is a `PullResult`.
 *
 * @since 4.0.0
 */
export type PullSuccess<T extends AnyAtom> = T extends Atom<PullResult<infer A, infer _>> ? A : never

/**
 * Extracts the failure error type from an atom whose value is an `AsyncResult`.
 *
 * @since 4.0.0
 */
export type Failure<T extends AnyAtom> = T extends Atom<AsyncResult.Result<infer _, infer E>> ? E : never

/**
 * Returns an atom type without serializable metadata, preserving `Writable` read and write types when the input atom is writable.
 *
 * @since 4.0.0
 */
export type WithoutSerializable<T extends AnyAtom> = T extends Writable<infer R, infer W> ? Writable<R, W>
  : Atom<Type<T>>

/**
 * Atom that can also be written to, using a `WriteContext` and an input value to update reactive state.
 *
 * @since 4.0.0
 */
export interface Writable<R, W = R> extends Atom<R> {
  readonly [WritableTypeId]: WritableTypeId
  readonly write: (ctx: WriteContext<R>, value: W) => void
}

/**
 * Context passed to atom read functions for reading dependencies, awaiting `AsyncResult` or `Option` values, managing subscriptions and finalizers, refreshing atoms, and updating writable atoms.
 *
 * @since 4.0.0
 */
export interface AtomContext {
  <A>(atom: Atom<A>): A
  get<A>(this: AtomContext, atom: Atom<A>): A
  result<A, E>(this: AtomContext, atom: Atom<AsyncResult.Result<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): Effect.Effect<A, E>
  resultOnce<A, E>(this: AtomContext, atom: Atom<AsyncResult.Result<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): Effect.Effect<A, E>
  once<A>(this: AtomContext, atom: Atom<A>): A
  addFinalizer(this: AtomContext, f: () => void): void
  mount<A>(this: AtomContext, atom: Atom<A>): void
  refresh<A>(this: AtomContext, atom: Atom<A>): void
  refreshSelf(this: AtomContext): void
  self<A>(this: AtomContext): Option.Option<A>
  setSelf<A>(this: AtomContext, a: A): void
  set<R, W>(this: AtomContext, atom: Writable<R, W>, value: W): void
  setResult<A, E, W>(this: AtomContext, atom: Writable<AsyncResult.Result<A, E>, W>, value: W): Effect.Effect<A, E>
  some<A>(this: AtomContext, atom: Atom<Option.Option<A>>): Effect.Effect<A>
  someOnce<A>(this: AtomContext, atom: Atom<Option.Option<A>>): Effect.Effect<A>
  stream<A>(this: AtomContext, atom: Atom<A>, options?: {
    readonly withoutInitialValue?: boolean
    readonly bufferSize?: number
  }): Stream.Stream<A>
  streamResult<A, E>(this: AtomContext, atom: Atom<AsyncResult.Result<A, E>>, options?: {
    readonly withoutInitialValue?: boolean
    readonly bufferSize?: number
  }): Stream.Stream<A, E>
  subscribe<A>(this: AtomContext, atom: Atom<A>, f: (_: A) => void, options?: {
    readonly immediate?: boolean
  }): void
  isFn?: boolean | undefined
  readonly registry: Registry.RegistryImpl
}

/**
 * Context passed to writable atom write functions for reading atoms, refreshing or setting the current atom, and writing to other writable atoms.
 *
 * @since 4.0.0
 */
export interface WriteContext<A> {
  get<T>(this: WriteContext<A>, atom: Atom<T>): T
  refreshSelf(this: WriteContext<A>): void
  setSelf(this: WriteContext<A>, a: A): void
  set<R, W>(this: WriteContext<A>, atom: Writable<R, W>, value: W): void
}

type FnOptions<Init = unknown, Key = unknown> = {
  readonly initialValue?: Init
  readonly reactivityKeys?: AnyReactivityKeys<Key> | undefined
  readonly concurrent?: boolean | undefined
}

function runtimeFn<R, ER, Arg>(
  this: AtomRuntime<R, ER>,
): {
  <E, A>(
    fn: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | R | Current | Reactivity.Reactivity>,
    options?: FnOptions,
  ): AtomResultFn<Arg, A, E | ER> | AnyAtomResultFn
  <E, A>(
    fn: (arg: Arg, get: FnContext) => Stream.Stream<A, E, Current | Reactivity.Reactivity | R>,
    options?: FnOptions,
  ): AtomResultFn<Arg, A, E | ER | Cause.NoSuchElementError> | AnyAtomResultFn
}
function runtimeFn<R, ER, E, A, Arg = void>(
  this: AtomRuntime<R, ER>,
  fn: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | R | Current | Reactivity.Reactivity>,
  options?: FnOptions,
): AtomResultFn<Arg, A, E | ER> | AnyAtomResultFn
function runtimeFn<R, ER, E, A, Arg = void>(
  this: AtomRuntime<R, ER>,
  fn: (arg: Arg, get: FnContext) => Stream.Stream<A, E, Current | Reactivity.Reactivity | R>,
  options?: FnOptions,
): AtomResultFn<Arg, A, E | ER | Cause.NoSuchElementError> | AnyAtomResultFn
function runtimeFn<R, ER, Arg, A, E>(
  this: AtomRuntime<R, ER>,
  fn?: (arg: Arg, get: FnContext) =>
    | Effect.Effect<A, E, Scope.Scope | R | Current | Reactivity.Reactivity>
    | Stream.Stream<A, E, Current | Reactivity.Reactivity | R>,
  options?: FnOptions,
): Top {
  if (fn === undefined) {
    return <Arg2, A2, E2>(
      fn2: (arg: Arg2, get: FnContext) =>
        | Effect.Effect<A2, E2, Scope.Scope | R | Current | Reactivity.Reactivity>
        | Stream.Stream<A2, E2, Current | Reactivity.Reactivity | R>,
      curriedOptions?: FnOptions,
    ) => makeFnRuntime(this, fn2, curriedOptions)
  }
  return makeFnRuntime(this, fn, options)
}

const RuntimeProto: {
  atom: {
    <R, ER, A, E>(
      this: AtomRuntime<R, ER>,
      create: (get: AtomContext) => Effect.Effect<A, E, Scope.Scope | R | Current | Reactivity.Reactivity>,
      options?: {
        readonly initialValue?: A
        readonly uninterruptible?: boolean | undefined
      },
    ): Atom<AsyncResult.Result<A, E | ER>>
    <R, ER, A, E>(
      this: AtomRuntime<R, ER>,
      effect: Effect.Effect<A, E, Scope.Scope | R | Current | Reactivity.Reactivity>,
      options?: {
        readonly initialValue?: A
        readonly uninterruptible?: boolean | undefined
      },
    ): Atom<AsyncResult.Result<A, E | ER>>
    <R, ER, A, E>(
      this: AtomRuntime<R, ER>,
      create: (get: AtomContext) => Stream.Stream<A, E, Current | Reactivity.Reactivity | R>,
      options?: {
        readonly initialValue?: A
      },
    ): Atom<AsyncResult.Result<A, E | ER | Cause.NoSuchElementError>>
    <R, ER, A, E>(
      this: AtomRuntime<R, ER>,
      stream: Stream.Stream<A, E, Current | Reactivity.Reactivity | R>,
      options?: {
        readonly initialValue?: A
      },
    ): Atom<AsyncResult.Result<A, E | ER | Cause.NoSuchElementError>>
  }
  fn: {
    <R, ER, Arg>(
      this: AtomRuntime<R, ER>,
    ): {
      <E, A>(
        fn: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | R | Current | Reactivity.Reactivity>,
        options?: FnOptions,
      ): AtomResultFn<Arg, A, E | ER> | AnyAtomResultFn
      <E, A>(
        fn: (arg: Arg, get: FnContext) => Stream.Stream<A, E, Current | Reactivity.Reactivity | R>,
        options?: FnOptions,
      ): AtomResultFn<Arg, A, E | ER | Cause.NoSuchElementError> | AnyAtomResultFn
    }
    <R, ER, E, A, Arg = void>(
      this: AtomRuntime<R, ER>,
      fn: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | R | Current | Reactivity.Reactivity>,
      options?: FnOptions,
    ): AtomResultFn<Arg, A, E | ER> | AnyAtomResultFn
    <R, ER, E, A, Arg = void>(
      this: AtomRuntime<R, ER>,
      fn: (arg: Arg, get: FnContext) => Stream.Stream<A, E, Current | Reactivity.Reactivity | R>,
      options?: FnOptions,
    ): AtomResultFn<Arg, A, E | ER | Cause.NoSuchElementError> | AnyAtomResultFn
  }
  pull: <R, ER, A, E>(
    this: AtomRuntime<R, ER>,
    create:
      | ((get: AtomContext) => Stream.Stream<A, E, R | Current | Reactivity.Reactivity>)
      | Stream.Stream<A, E, R | Current | Reactivity.Reactivity>,
    options?: {
      readonly disableAccumulation?: boolean
      readonly initialValue?: readonly A[]
    },
  ) => Writable<PullResult<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>, void>
  subscriptionRef: <R, ER, A, E>(
    this: AtomRuntime<R, ER>,
    create:
      | Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | R | Current | Reactivity.Reactivity>
      | ((get: AtomContext) => Effect.Effect<
        SubscriptionRef.SubscriptionRef<A>,
        E,
        Scope.Scope | R | Current | Reactivity.Reactivity
      >),
  ) => Writable<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>, A>
} = {
  ...AtomProto,
  atom<R, ER, A, E>(
    this: AtomRuntime<R, ER>,
    arg:
      | ((get: AtomContext) => Effect.Effect<A, E, Scope.Scope | R | Current | Reactivity.Reactivity>)
      | Effect.Effect<A, E, Scope.Scope | R | Current | Reactivity.Reactivity>
      | ((get: AtomContext) => Stream.Stream<A, E, Current | Reactivity.Reactivity | R>)
      | Stream.Stream<A, E, Current | Reactivity.Reactivity | R>,
    options?: {
      readonly initialValue?: A
      readonly uninterruptible?: boolean | undefined
    },
  ): Atom<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>> {
    return readable<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>>((get) =>
      readRuntimeAtom(get, this, arg, options)
    )
  },

  fn: runtimeFn,

  pull<R, ER, A, E>(
    this: AtomRuntime<R, ER>,
    create:
      | ((get: AtomContext) => Stream.Stream<A, E, Current | Reactivity.Reactivity | R>)
      | Stream.Stream<A, E, Current | Reactivity.Reactivity | R>,
    options?: {
      readonly disableAccumulation?: boolean
      readonly initialValue?: readonly A[]
    },
  ): Writable<PullResult<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>, void> {
    const pullSignal = removeTtl(state(0))
    const pullAtom = readable<PullResult<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>>((get) =>
      readRuntimePull(get, this, pullSignal, create, options)
    )
    return makeStreamPull(pullSignal, pullAtom)
  },

  subscriptionRef<R, ER, A, E>(
    this: AtomRuntime<R, ER>,
    create:
      | Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | R | Current | Reactivity.Reactivity>
      | ((
        get: AtomContext,
      ) => Effect.Effect<
        SubscriptionRef.SubscriptionRef<A>,
        E,
        Scope.Scope | R | Current | Reactivity.Reactivity
      >),
  ): Writable<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>, A> {
    const refAtom = removeTtl(readable<
      | SubscriptionRef.SubscriptionRef<A>
      | AsyncResult.Result<SubscriptionRef.SubscriptionRef<A> | Context.Context<R>, E | ER>
    >((get) => readRuntimeRefAtom(get, this, create)))
    return makeSubRef(
      refAtom,
      (get, ref) => readRuntimeSubRef(get, this, ref),
    )
  },
}

const makeFnRuntime = <R, ER, Arg, A, E>(
  self: AtomRuntime<R, ER>,
  fn: (arg: Arg, get: FnContext) =>
    | Effect.Effect<A, E, Scope.Scope | R | Current | Reactivity.Reactivity>
    | Stream.Stream<A, E, Current | Reactivity.Reactivity | R>,
  options?: {
    readonly initialValue?: A
    readonly reactivityKeys?: AnyReactivityKeys | undefined
  },
) => {
  const [read, write, argAtom] = makeResultFn<Arg, E, A, R | Reactivity.Reactivity | Scope.Scope>(
    wrapFnWithReactivity(fn, options),
    options,
  )
  return writable<
    AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>,
    Arg | Reset | Interrupt
  >(
    (get) => {
      const previous = get.self<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>>()
      get.get(argAtom)
      const runtimeResult = get.get(self)
      if (AsyncResult.isSuccess(runtimeResult)) {
        return read(get, runtimeResult.value)
      }
      return AsyncResult.replacePrevious(runtimeResult, previous)
    },
    write,
  )
}

function constSetSelf<A>(ctx: WriteContext<A>, value: A) {
  ctx.setSelf(value)
}

function isCreateFunction<T>(value: T | ((get: AtomContext) => T)): value is (get: AtomContext) => T {
  return typeof value === 'function'
}

function resolveCreate<T>(value: T | ((get: AtomContext) => T), get: AtomContext): T {
  if (isCreateFunction(value)) {
    return value(get)
  }
  return value
}

function resultFromInitialValue<A, E>(initialValue: A | undefined): AsyncResult.Result<A, E> {
  if (initialValue === undefined) {
    return AsyncResult.initial<A, E>()
  }
  return AsyncResult.success<A, E>(initialValue)
}

function resultFromOptions<A, E>(options?: { readonly initialValue?: A | undefined }): AsyncResult.Result<A, E> {
  if (options === undefined) {
    return AsyncResult.initial<A, E>()
  }
  return resultFromInitialValue(options.initialValue)
}

function effectOrStream<A, E, R0>(
  get: AtomContext,
  value: Effect.Effect<A, E, R0> | Stream.Stream<A, E, R0>,
  options?: {
    readonly initialValue?: A
    readonly uninterruptible?: boolean | undefined
  },
  services?: Context.Context<never>,
): AsyncResult.Result<A, E | Cause.NoSuchElementError> {
  if (Effect.isEffect(value)) {
    return effect(get, value, options, services)
  }
  return stream(get, value, options, services)
}

function readRuntimeAtom<R, ER, A, E>(
  get: AtomContext,
  runtime: AtomRuntime<R, ER>,
  arg:
    | ((get: AtomContext) => Effect.Effect<A, E, Scope.Scope | R | Current | Reactivity.Reactivity>)
    | Effect.Effect<A, E, Scope.Scope | R | Current | Reactivity.Reactivity>
    | ((get: AtomContext) => Stream.Stream<A, E, Current | Reactivity.Reactivity | R>)
    | Stream.Stream<A, E, Current | Reactivity.Reactivity | R>,
  options?: {
    readonly initialValue?: A
    readonly uninterruptible?: boolean | undefined
  },
): AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError> {
  const previous = get.self<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>>()
  const runtimeResult = get(runtime)
  if (AsyncResult.isSuccess(runtimeResult)) {
    return effectOrStream(get, resolveCreate(arg, get), options, runtimeResult.value)
  }
  return AsyncResult.replacePrevious(runtimeResult, previous)
}

function readRuntimePull<R, ER, A, E>(
  get: AtomContext,
  runtime: AtomRuntime<R, ER>,
  pullSignal: Atom<number>,
  create:
    | ((get: AtomContext) => Stream.Stream<A, E, Current | Reactivity.Reactivity | R>)
    | Stream.Stream<A, E, Current | Reactivity.Reactivity | R>,
  options?: {
    readonly disableAccumulation?: boolean
    readonly initialValue?: readonly A[]
  },
): PullResult<A | Context.Context<R>, E | ER | Cause.NoSuchElementError> {
  const previous = get.self<PullResult<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>>()
  const runtimeResult = get(runtime)
  if (AsyncResult.isSuccess(runtimeResult)) {
    return makeEffect(
      get,
      makeStreamPullEffect(get, pullSignal, resolveCreate(create, get), options),
      AsyncResult.initial(true),
      runtimeResult.value,
      false,
    )
  }
  return AsyncResult.replacePrevious(runtimeResult, previous)
}

function readRuntimeRefAtom<R, ER, A, E>(
  get: AtomContext,
  runtime: AtomRuntime<R, ER>,
  create:
    | Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | R | Current | Reactivity.Reactivity>
    | ((
      get: AtomContext,
    ) => Effect.Effect<
      SubscriptionRef.SubscriptionRef<A>,
      E,
      Scope.Scope | R | Current | Reactivity.Reactivity
    >),
):
  | SubscriptionRef.SubscriptionRef<A>
  | AsyncResult.Result<SubscriptionRef.SubscriptionRef<A> | Context.Context<R>, E | ER>
{
  const previous = get.self<
    AsyncResult.Result<SubscriptionRef.SubscriptionRef<A> | Context.Context<R>, E | ER>
  >()
  const runtimeResult = get(runtime)
  if (AsyncResult.isSuccess(runtimeResult)) {
    return makeEffect(get, resolveCreate(create, get), AsyncResult.initial(true), runtimeResult.value, false)
  }
  return AsyncResult.replacePrevious(runtimeResult, previous)
}

function isUnsuccessfulResult(
  ref: unknown,
): ref is AnyResult {
  if (AsyncResult.isResult(ref) === false) {
    return false
  }
  return AsyncResult.isSuccess(ref) === false
}

function readRuntimeSubRef<R, ER, A, E>(
  get: AtomContext,
  runtime: AtomRuntime<R, ER>,
  ref:
    | SubscriptionRef.SubscriptionRef<A>
    | AsyncResult.Result<SubscriptionRef.SubscriptionRef<A> | Context.Context<R>, E | ER>,
): AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError> {
  if (isUnsuccessfulResult(ref)) {
    return readRefResult(get, ref)
  }
  return readRuntimeSubRefWithServices(get, AsyncResult.getOrThrow(get(runtime)), ref)
}

function readRuntimeSubRefWithServices<R, A, E>(
  get: AtomContext,
  runtime: Context.Context<R>,
  ref:
    | SubscriptionRef.SubscriptionRef<A>
    | AsyncResult.Result<SubscriptionRef.SubscriptionRef<A> | Context.Context<R>, E>,
): AsyncResult.Result<A | Context.Context<R>, E | Cause.NoSuchElementError> {
  if (AsyncResult.isResult(ref)) {
    return readRefResult(get, ref, runtime)
  }
  return AsyncResult.success(readRefDirect(get, ref, runtime))
}

type ReactivityKeys<K = unknown> = AnyReactivityKeys<K>

function wrapFnWithReactivity<R, Arg, A, E>(
  fn: (arg: Arg, get: FnContext) =>
    | Effect.Effect<A, E, Scope.Scope | R | Current | Reactivity.Reactivity>
    | Stream.Stream<A, E, Current | Reactivity.Reactivity | R>,
  options?: {
    readonly initialValue?: A
    readonly reactivityKeys?: ReactivityKeys | undefined
  },
) {
  if (options === undefined) {
    return fn
  }
  return wrapFnWithReactivityKeys(fn, options.reactivityKeys)
}

function wrapFnWithReactivityKeys<R, Arg, A, E>(
  fn: (arg: Arg, get: FnContext) =>
    | Effect.Effect<A, E, Scope.Scope | R | Current | Reactivity.Reactivity>
    | Stream.Stream<A, E, Current | Reactivity.Reactivity | R>,
  keys: ReactivityKeys | undefined,
) {
  if (keys === undefined) {
    return fn
  }
  return (a: Arg, get: FnContext) => wrapReactiveValue(fn(a, get), keys)
}

function wrapReactiveValue<A, E, R>(
  value: Effect.Effect<A, E, R> | Stream.Stream<A, E, R>,
  keys: ReactivityKeys,
) {
  if (Effect.isEffect(value)) {
    return Reactivity.mutation(value, keys)
  }
  return Stream.ensuring(value, Reactivity.invalidate(keys))
}

function isAtomFnArg<A, E>(
  u: unknown,
): u is (
  get: AtomContext,
  services?: Context.Context<never>,
) => Effect.Effect<A, E, Scope.Scope | Current> | Stream.Stream<A, E, Current> | A {
  return typeof u === 'function'
}

function makeReadOrAtom<A, E>(
  arg:
    | Effect.Effect<A, E, Scope.Scope | Current>
    | ((
      get: AtomContext,
      services?: Context.Context<never>,
    ) => Effect.Effect<A, E, Scope.Scope | Current>)
    | Stream.Stream<A, E, Current>
    | ((get: AtomContext, services?: Context.Context<never>) => Stream.Stream<A, E, Current>)
    | ((get: AtomContext, services?: Context.Context<never>) => A)
    | A,
  options?: {
    readonly initialValue?: Top
    readonly uninterruptible?: boolean | undefined
  },
): ((get: AtomContext, services?: Context.Context<never>) => Top) | Writable<A> {
  if (Effect.isEffect(arg)) {
    return function(get: AtomContext, providedServices?: Context.Context<never>) {
      return effect(get, arg, options, providedServices)
    }
  }
  return makeReadOrAtomNonEffect(arg, options)
}

function makeReadOrAtomNonEffect<A, E>(
  arg:
    | ((
      get: AtomContext,
      services?: Context.Context<never>,
    ) => Effect.Effect<A, E, Scope.Scope | Current>)
    | Stream.Stream<A, E, Current>
    | ((get: AtomContext, services?: Context.Context<never>) => Stream.Stream<A, E, Current>)
    | ((get: AtomContext, services?: Context.Context<never>) => A)
    | A,
  options?: {
    readonly initialValue?: Top
    readonly uninterruptible?: boolean | undefined
  },
): ((get: AtomContext, services?: Context.Context<never>) => Top) | Writable<A> {
  if (Stream.isStream(arg)) {
    return function(get: AtomContext, providedServices?: Context.Context<never>) {
      return stream(get, arg, options, providedServices)
    }
  }
  return makeReadOrAtomFnOrState(arg, options)
}

function makeReadOrAtomFnOrState<A, E>(
  arg:
    | ((
      get: AtomContext,
      services?: Context.Context<never>,
    ) => Effect.Effect<A, E, Scope.Scope | Current> | Stream.Stream<A, E, Current> | A)
    | A,
  options?: {
    readonly initialValue?: Top
    readonly uninterruptible?: boolean | undefined
  },
): ((get: AtomContext, services?: Context.Context<never>) => Top) | Writable<A> {
  if (isAtomFnArg<A, E>(arg)) {
    return function(get: AtomContext, providedServices?: Context.Context<never>) {
      return valueFromCreated(arg(get, providedServices), get, options, providedServices)
    }
  }
  return state(arg)
}

function valueFromCreated<A, E>(
  value: Effect.Effect<A, E, Scope.Scope | Current> | Stream.Stream<A, E, Current> | A,
  get: AtomContext,
  options?: {
    readonly initialValue?: Top
    readonly uninterruptible?: boolean | undefined
  },
  services?: Context.Context<never>,
): Top {
  if (Effect.isEffect(value)) {
    return effect(get, value, options, services)
  }
  return valueFromCreatedNonEffect(value, get, options, services)
}

function valueFromCreatedNonEffect<A, E>(
  value: Stream.Stream<A, E, Current> | A,
  get: AtomContext,
  options?: {
    readonly initialValue?: Top
    readonly uninterruptible?: boolean | undefined
  },
  services?: Context.Context<never>,
): Top {
  if (Stream.isStream(value)) {
    return stream(get, value, options, services)
  }
  return value
}

function asReadableAtom<A = unknown>(
  readOrAtom: ((get: AtomContext, services?: Context.Context<never>) => A) | AnyAtom<A>,
): AnyAtom<A> {
  if (isAtom(readOrAtom)) {
    return readOrAtom
  }
  return readable(readOrAtom)
}

function contextMemoMap(
  options?: { readonly memoMap: Atom<Layer.MemoMap> | Layer.MemoMap },
): Atom<Layer.MemoMap> | Layer.MemoMap {
  if (options === undefined) {
    return removeTtl(make(() => Layer.makeMemoMapUnsafe()))
  }
  return options.memoMap
}

function resolveContextMemoMap(
  get: AtomContext,
  memoMap: Atom<Layer.MemoMap> | Layer.MemoMap,
): Layer.MemoMap {
  if (isAtom(memoMap)) {
    return get(memoMap)
  }
  return memoMap
}

function runtimeLayerAtom<R, E, RIn>(
  create: Layer.Layer<R, E, RIn> | ((get: AtomContext) => Layer.Layer<R, E, RIn>),
  globalLayer: Layer.Layer<never, never, Current>,
): Atom<Layer.Layer<R, E, RIn | Current>> {
  if (typeof create === 'function') {
    return readable((get) => Layer.provideMerge(create(get), globalLayer))
  }
  return readable(() => Layer.provideMerge(create, globalLayer))
}

function mapStreamFail<E>(e: E | Cause.Done<void>): E | Cause.NoSuchElementError {
  if (Cause.isDone(e)) {
    return new Cause.NoSuchElementError()
  }
  return e
}

function readSubscriptionRefSource<A, E>(
  get: AtomContext,
  ref:
    | SubscriptionRef.SubscriptionRef<A>
    | ((get: AtomContext) => SubscriptionRef.SubscriptionRef<A>)
    | Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | Current>
    | ((
      get: AtomContext,
    ) => Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | Current>),
) {
  const value = resolveCreate(ref, get)
  if (Effect.isEffect(value)) {
    return makeEffect(get, value, AsyncResult.initial(true))
  }
  return value
}

function readSubRefSource<A, R0, E>(
  get: AtomContext,
  source: RefSource<A, R0, E>,
) {
  if (AsyncResult.isResult(source)) {
    return readRefResult(get, source)
  }
  return readRefDirect(get, source)
}

function refFromSuccessValue<A, R0>(value: SubscriptionRef.SubscriptionRef<A> | Context.Context<R0>) {
  if (Context.isContext(value)) {
    return Option.none()
  }
  return Option.some(value)
}

function readRefPending<A, R0, E>(
  source: AsyncResult.Result<SubscriptionRef.SubscriptionRef<A> | Context.Context<R0>, E>,
): AsyncResult.Result<A | Context.Context<R0>, E | Cause.NoSuchElementError> {
  if (AsyncResult.isFailure(source)) {
    return AsyncResult.failure<A | Context.Context<R0>, E>(source.cause, { waiting: source.waiting })
  }
  return AsyncResult.initial<A | Context.Context<R0>, E>(source.waiting)
}

function onStreamCause<A, E>(
  ctx: AtomContext,
  cause: Cause.Cause<E | Cause.Done<void>>,
  latest: Option.Option<A>,
  previous: Option.Option<AsyncResult.Result<A, E | Cause.NoSuchElementError>>,
): void {
  if (Pull.isDoneCause(cause)) {
    settleStreamDone(ctx, latest, previous)
    return
  }
  settleStreamFailure(ctx, cause, previous)
}

function settleStreamDone<A, E>(
  ctx: AtomContext,
  latest: Option.Option<A>,
  previous: Option.Option<AsyncResult.Result<A, E | Cause.NoSuchElementError>>,
): void {
  pipe(
    Option.orElse(
      latest,
      () => Option.flatMap<AsyncResult.Result<A, E | Cause.NoSuchElementError>, A>(previous, AsyncResult.value),
    ),
    Option.match({
      onNone: () =>
        ctx.setSelf(
          AsyncResult.failWithPrevious(new Cause.NoSuchElementError(), {
            previous,
          }),
        ),
      onSome: (a) => ctx.setSelf(AsyncResult.success(a)),
    }),
  )
}

function settleStreamFailure<A, E>(
  ctx: AtomContext,
  cause: Cause.Cause<E | Cause.Done<void>>,
  previous: Option.Option<AsyncResult.Result<A, E | Cause.NoSuchElementError>>,
): void {
  ctx.setSelf(AsyncResult.failureWithPrevious(Cause.map(cause, mapStreamFail<E>), {
    previous,
  }))
}

function readFnSync<Arg, A>(
  get: AtomContext,
  argAtom: Writable<[number, Arg | undefined]>,
  f: (arg: Arg, get: FnContext) => A,
  initialValue: A | undefined,
  hasInitialValue: boolean,
): Option.Option<A> | A {
  const [counter, arg] = get.get(argAtom)
  if (counter === 0) {
    return fnSyncIdleValue(initialValue)
  }
  return fnSyncCalledValue(get, arg, f, hasInitialValue)
}

function fnSyncIdleValue<A>(initialValue: A | undefined): Option.Option<A> | A {
  if (initialValue === undefined) {
    return Option.none()
  }
  return initialValue
}

function fnSyncOptionValue<A>(options?: { readonly initialValue?: A }): A | undefined {
  if (options === undefined) {
    return undefined
  }
  return options.initialValue
}

function fnSyncCalledValue<Arg, A>(
  get: AtomContext,
  arg: Arg | undefined,
  f: (arg: Arg, get: FnContext) => A,
  hasInitialValue: boolean,
): Option.Option<A> | A {
  const argValue = Option.getOrThrowWith(
    Option.fromUndefinedOr(arg),
    () => new Error('fnSync: function atom read without an argument'),
  )
  if (hasInitialValue) {
    return f(argValue, get)
  }
  return Option.some(f(argValue, get))
}

function resultFnConcurrent(options?: { readonly concurrent?: boolean | undefined }): boolean {
  if (options === undefined) {
    return false
  }
  return options.concurrent === true
}

function resultFnFibersAtom<A, E>(
  options?: { readonly concurrent?: boolean | undefined },
): Atom<Set<Fiber.Fiber<A, E>>> | undefined {
  if (resultFnConcurrent(options) === false) {
    return undefined
  }
  return removeTtl(readable((get) => {
    const fibers = new Set<Fiber.Fiber<A, E>>()
    get.addFinalizer(() => fibers.forEach((f) => f.interruptUnsafe()))
    return fibers
  }))
}

function readResultFn<Arg, A, E, R0>(
  get: AtomContext,
  argAtom: Atom<readonly [number, Option.Option<Arg | Interrupt>]>,
  f: (
    arg: Arg,
    get: FnContext,
  ) => Effect.Effect<A, E, Scope.Scope | Current | R0> | Stream.Stream<A, E, Current | R0>,
  initialValue: AsyncResult.Result<A, E>,
  fibersAtom: Atom<Set<Fiber.Fiber<A, E>>> | undefined,
  services?: Context.Context<never>,
): AsyncResult.Result<A, E | Cause.NoSuchElementError> {
  const [counter, arg] = get.get(argAtom)
  if (counter === 0) {
    return initialValue
  }
  return readResultFnCalled(get, arg, f, initialValue, resultFnFibers(get, fibersAtom), services)
}

function resultFnFibers<A, E>(
  get: AtomContext,
  fibersAtom: Atom<Set<Fiber.Fiber<A, E>>> | undefined,
): Set<Fiber.Fiber<A, E>> | undefined {
  if (fibersAtom === undefined) {
    return undefined
  }
  return get(fibersAtom)
}

function readResultFnCalled<Arg, A, E, R0>(
  get: AtomContext,
  arg: Option.Option<Arg | Interrupt>,
  f: (
    arg: Arg,
    get: FnContext,
  ) => Effect.Effect<A, E, Scope.Scope | Current | R0> | Stream.Stream<A, E, Current | R0>,
  initialValue: AsyncResult.Result<A, E>,
  fibers: Set<Fiber.Fiber<A, E>> | undefined,
  services?: Context.Context<never>,
): AsyncResult.Result<A, E | Cause.NoSuchElementError> {
  const argValue = Option.getOrThrow(arg)
  if (argValue === Interrupt) {
    return AsyncResult.failureWithPrevious(Cause.interrupt(), { previous: Option.none() })
  }
  return readResultFnValue(get, f(argValue, get), initialValue, fibers, services)
}

function readResultFnValue<A, E, R0>(
  get: AtomContext,
  value: Effect.Effect<A, E, Scope.Scope | Current | R0> | Stream.Stream<A, E, Current | R0>,
  initialValue: AsyncResult.Result<A, E>,
  fibers: Set<Fiber.Fiber<A, E>> | undefined,
  services?: Context.Context<never>,
): AsyncResult.Result<A, E | Cause.NoSuchElementError> {
  if (Effect.isEffect(value)) {
    return readResultFnEffect(get, value, initialValue, fibers, services)
  }
  return makeStream(get, value, initialValue, services)
}

function readResultFnEffect<A, E, R0>(
  get: AtomContext,
  value: Effect.Effect<A, E, Scope.Scope | Current | R0>,
  initialValue: AsyncResult.Result<A, E>,
  fibers: Set<Fiber.Fiber<A, E>> | undefined,
  services?: Context.Context<never>,
): AsyncResult.Result<A, E> {
  if (fibers === undefined) {
    return makeEffect(get, value, initialValue, services, false)
  }
  return makeEffect(get, joinResultFnFibers(value, fibers), initialValue, services, false)
}

function joinResultFnFibers<A, E, R0>(
  value: Effect.Effect<A, E, Scope.Scope | Current | R0>,
  fibers: Set<Fiber.Fiber<A, E>>,
): Effect.Effect<A, E, Scope.Scope | Current | R0> {
  return Effect.flatMap(
    Effect.forkDetach(value, { startImmediately: true }),
    (fiber) => {
      fibers.add(fiber)
      fiber.addObserver(() => fibers.delete(fiber))
      return Effect.map(Fiber.joinAll(fibers), (arr) => Option.getOrThrow(Arr.head(arr)))
    },
  )
}

function writeResultFnArg<Arg, A, E>(
  ctx: WriteContext<AsyncResult.Result<A, E | Cause.NoSuchElementError>>,
  argAtom: Writable<readonly [number, Option.Option<Arg | Interrupt>]>,
  arg: Arg | Reset | Interrupt,
): void {
  if (arg === Reset) {
    ctx.set(argAtom, [0, Option.none()])
    return
  }
  writeResultFnNonReset(ctx, argAtom, arg)
}

function writeResultFnNonReset<Arg, A, E>(
  ctx: WriteContext<AsyncResult.Result<A, E | Cause.NoSuchElementError>>,
  argAtom: Writable<readonly [number, Option.Option<Arg | Interrupt>]>,
  arg: Arg | Interrupt,
): void {
  if (arg === Interrupt) {
    ctx.set(argAtom, [ctx.get(argAtom)[0] + 1, Option.some(Interrupt)])
    return
  }
  ctx.set(argAtom, [ctx.get(argAtom)[0] + 1, Option.some(arg)])
}

function onPullFailure<A, E>(
  cause: Cause.Cause<E | Cause.Done<void>>,
  acc: readonly A[],
): Effect.Effect<{ done: boolean; items: Arr.NonEmptyReadonlyArray<A> }, Cause.NoSuchElementError | E> {
  const filtered = Pull.filterDone(cause)
  if (Result.isSuccess(filtered)) {
    return onPullDone(acc)
  }
  return Effect.failCause(filtered.failure)
}

function onPullDone<A>(
  acc: readonly A[],
): Effect.Effect<{ done: boolean; items: Arr.NonEmptyReadonlyArray<A> }, Cause.NoSuchElementError> {
  if (Arr.isReadonlyArrayNonEmpty(acc) === false) {
    return Effect.fail(new Cause.NoSuchElementError(`Atom.pull: no items`))
  }
  return Effect.succeed({ done: true, items: acc })
}

function onPullSuccess<A, E>(
  chunk: Iterable<A>,
  acc: readonly A[],
  options: { readonly disableAccumulation?: boolean | undefined } | undefined,
  setAcc: (items: readonly A[]) => void,
  pull: Effect.Effect<
    { done: boolean; items: Arr.NonEmptyReadonlyArray<A> },
    Cause.NoSuchElementError | E,
    Current
  >,
): Effect.Effect<{ done: boolean; items: Arr.NonEmptyReadonlyArray<A> }, Cause.NoSuchElementError | E, Current> {
  const items = pullAccumulatedItems(chunk, acc, options, setAcc)
  if (Arr.isReadonlyArrayNonEmpty(items) === false) {
    return pull
  }
  return Effect.succeed({ done: false, items })
}

function pullDisableAccumulation(
  options: { readonly disableAccumulation?: boolean | undefined } | undefined,
): boolean {
  if (options === undefined) {
    return false
  }
  return options.disableAccumulation === true
}

function pullAccumulatedItems<A>(
  chunk: Iterable<A>,
  acc: readonly A[],
  options: { readonly disableAccumulation?: boolean | undefined } | undefined,
  setAcc: (items: readonly A[]) => void,
): readonly A[] {
  if (pullDisableAccumulation(options)) {
    return Arr.fromIterable(chunk)
  }
  const items = Arr.appendAll(acc, chunk)
  setAcc(items)
  return items
}

function finishPullCallback<A, E>(
  get: AtomContext,
  cancels: Set<() => void>,
  cancel: (() => void) | undefined,
  exit: Exit.Exit<{ readonly done: boolean; readonly items: Arr.NonEmptyReadonlyArray<A> }, E>,
): void {
  if (cancel !== undefined) {
    cancels.delete(cancel)
  }
  const result = AsyncResult.fromExitWithPrevious(exit, Option.none())
  get.setSelf(pullCallbackResult(result, cancels.size > 0))
}

function pullCallbackResult<A, E>(
  result: AsyncResult.Result<A, E>,
  pending: boolean,
): AsyncResult.Result<A, E> {
  if (pending) {
    return AsyncResult.waiting(result)
  }
  return result
}

function addPullCancel(cancels: Set<() => void>, cancel: (() => void) | undefined): void {
  if (cancel === undefined) {
    return
  }
  cancels.add(cancel)
}

function familyUnsupported(): boolean {
  const flags = [
    typeof WeakRef === 'undefined',
    typeof FinalizationRegistry === 'undefined',
  ]
  return flags.includes(true)
}

function makeFamily(): <Arg, T extends object>(f: (arg: Arg) => T) => (arg: Arg) => T {
  if (familyUnsupported()) {
    return familyStrong
  }
  return familyWeak
}

function familyStrong<Arg, T extends object>(f: (arg: Arg) => T): (arg: Arg) => T {
  const atoms = MutableHashMap.empty<Arg, T>()
  return function(arg) {
    return familyStrongGet(atoms, arg, f)
  }
}

function familyStrongGet<Arg, T extends object>(
  atoms: MutableHashMap.MutableHashMap<Arg, T>,
  arg: Arg,
  f: (arg: Arg) => T,
): T {
  const atomEntry = MutableHashMap.get(atoms, arg)
  if (Option.isSome(atomEntry)) {
    return atomEntry.value
  }
  const newAtom = f(arg)
  MutableHashMap.set(atoms, arg, newAtom)
  return newAtom
}

function familyWeak<Arg, T extends object>(f: (arg: Arg) => T): (arg: Arg) => T {
  const atoms = MutableHashMap.empty<Arg, WeakRef<T>>()
  const registry = new FinalizationRegistry<Arg>((arg) => {
    MutableHashMap.remove(atoms, arg)
  })
  return function(arg) {
    return familyWeakGet(atoms, registry, arg, f)
  }
}

function familyWeakGet<Arg, T extends object>(
  atoms: MutableHashMap.MutableHashMap<Arg, WeakRef<T>>,
  registry: FinalizationRegistry<Arg>,
  arg: Arg,
  f: (arg: Arg) => T,
): T {
  const atomEntry = MutableHashMap.get(atoms, arg).pipe(
    Option.flatMapNullishOr((ref) => ref.deref()),
  )
  if (Option.isSome(atomEntry)) {
    return atomEntry.value
  }
  const newAtom = f(arg)
  MutableHashMap.set(atoms, arg, new WeakRef(newAtom))
  registry.register(newAtom, arg)
  return newAtom
}

function readWithFallback<A2, E2>(
  get: AtomContext,
  self: Atom<AnyResult>,
  fallback: Atom<AsyncResult.Result<A2, E2>>,
): AnyResult | AsyncResult.Result<A2, E2> {
  const result = get(self)
  if (AsyncResult.isInitial(result)) {
    return AsyncResult.waiting(get(fallback))
  }
  return result
}

function copyWithFallback<R extends Atom<AnyResult>, A2, E2>(
  self: R,
  withFallback: (get: AtomContext) => AnyResult | AsyncResult.Result<A2, E2>,
): Atom<AnyResult | AsyncResult.Result<A2, E2>> {
  const refresh = atomRefresh(self)
  if (isWritable(self)) {
    return writable(withFallback, self.write, refresh)
  }
  return readable(withFallback, refresh)
}

function atomRefresh<A>(self: Atom<A>): (refresh: <B>(atom: Atom<B>) => void) => void {
  if (self.refresh === undefined) {
    return function(refresh) {
      refresh(self)
    }
  }
  return self.refresh
}

function assignCustomPrototype(copy: object, prototype: object | null): void {
  if (hasCustomPrototype(prototype) === false) {
    return
  }
  Object.setPrototypeOf(copy, prototype)
}

function hasCustomPrototype(prototype: object | null): boolean {
  if (prototype === null) {
    return false
  }
  return prototype !== Object.prototype
}

function stackLabel(): string {
  const stack = new Error().stack
  if (stack === undefined) {
    return ''
  }
  return stackLine(stack)
}

function stackLine(stack: string): string {
  const line = stack.split('\n')[5]
  if (line === undefined) {
    return ''
  }
  return line
}

function mapResultValue(
  value: Top,
  f: (value: Top) => Top,
): AnyResult {
  if (AsyncResult.isResult(value) === false) {
    throw new TypeError('mapResult: expected an AsyncResult atom')
  }
  return mapResultMapped(value, f)
}

function mapResultMapped(
  value: AnyResult,
  f: (value: Top) => Top,
): AnyResult {
  if (AsyncResult.isSuccess(value)) {
    return AsyncResult.success(f(value.value))
  }
  return value
}

function mapResultBinary(selfOrF: Top, f: Top): Top {
  if (isAtom(selfOrF) === false) {
    throw new TypeError('mapResult expects an atom and a function argument')
  }
  return mapResultBinaryFn(selfOrF, f)
}

function mapResultBinaryFn(self: AnyAtom, f: Top): Top {
  if (isMapResultMapper(f) === false) {
    throw new TypeError('mapResult expects an atom and a function argument')
  }
  return mapResultImpl(self, f)
}

function mapResultCurried(selfOrF: Top): (self: AnyAtom) => Top {
  return (self: AnyAtom) => mapResultCurriedApply(self, selfOrF)
}

function mapResultCurriedApply(self: AnyAtom, selfOrF: Top): Top {
  if (isMapResultMapper(selfOrF) === false) {
    throw new TypeError('mapResult expects a function argument')
  }
  return mapResultImpl(self, selfOrF)
}

type SwrOptions = {
  readonly staleTime: Duration.Input
  readonly revalidateOnMount?: boolean | undefined
  readonly revalidateOnFocus?: boolean | 'always' | undefined
  readonly focusSignal?: AnyAtom | undefined
}

function revalidateOnFocusEnabled(value: boolean | 'always' | undefined): boolean {
  if (value === undefined) {
    return false
  }
  return value !== false
}

function shouldSubscribeSwrFocus(options: SwrOptions): options is SwrOptions & { readonly focusSignal: AnyAtom } {
  if (options.focusSignal === undefined) {
    return false
  }
  return revalidateOnFocusEnabled(options.revalidateOnFocus)
}

function swrFocusListener<A, E>(
  get: AtomContext,
  self: Atom<AsyncResult.Result<A, E>>,
  options: SwrOptions,
  staleTime: number,
): () => void {
  if (options.revalidateOnFocus === 'always') {
    return () => get.refresh(self)
  }
  return () => revalidateSwrIfStale(get, self, staleTime)
}

function revalidateSwrIfStale<A, E>(
  get: AtomContext,
  self: Atom<AsyncResult.Result<A, E>>,
  staleTime: number,
): void {
  const current = get.once(self)
  if (shouldRevalidateSWR(current, staleTime, get.registry.now())) {
    get.refresh(self)
  }
}

function subscribeSwrFocus<A, E>(
  get: AtomContext,
  self: Atom<AsyncResult.Result<A, E>>,
  options: SwrOptions,
  staleTime: number,
): void {
  if (shouldSubscribeSwrFocus(options) === false) {
    return
  }
  get.once(options.focusSignal)
  get.subscribe(options.focusSignal, swrFocusListener(get, self, options, staleTime))
}

function skipSwrRevalidateOnMount(options: SwrOptions, firstRead: boolean): boolean {
  if (firstRead === false) {
    return false
  }
  return options.revalidateOnMount === false
}

function readSwr<A, E>(
  get: AtomContext,
  self: Atom<AsyncResult.Result<A, E>>,
  options: SwrOptions,
  staleTime: number,
): AsyncResult.Result<A, E> {
  const current = get.once(self)
  get.subscribe(self, (value) => {
    get.setSelf(value)
  })
  subscribeSwrFocus(get, self, options, staleTime)
  return finishSwrRead(get, self, options, staleTime, current)
}

function finishSwrRead<A, E>(
  get: AtomContext,
  self: Atom<AsyncResult.Result<A, E>>,
  options: SwrOptions,
  staleTime: number,
  current: AsyncResult.Result<A, E>,
): AsyncResult.Result<A, E> {
  if (skipSwrRevalidateOnMount(options, Option.isNone(get.self()))) {
    return current
  }
  revalidateSwrIfStale(get, self, staleTime)
  return current
}

function swrFailureTimestamp<A, E>(result: AsyncResult.Result<A, E>): Option.Option<number> {
  if (AsyncResult.isFailure(result)) {
    return Option.map(result.previousSuccess, (success) => success.timestamp)
  }
  return Option.none()
}

function shouldRevalidateSettledSWR<A, E>(
  result: AsyncResult.Result<A, E>,
  staleTime: number,
  now: number,
): boolean {
  const timestamp = result.pipe(swrTimestamp, Option.getOrUndefined)
  if (timestamp === undefined) {
    return result.pipe(AsyncResult.isInitial) === false
  }
  return isFreshWithin(timestamp, staleTime, now) === false
}

type OptimisticState<A> = {
  lastValue: A
  needsRefresh: boolean
  transitions: Set<Atom<AsyncResult.Result<A, Top>>>
  cancels: Set<() => void>
}

function readOptimistic<A>(
  get: AtomContext,
  self: Atom<A>,
  writeAtom: Atom<readonly [number, Atom<AsyncResult.Result<A, Top>> | undefined]>,
): A {
  const state: OptimisticState<A> = {
    lastValue: get.once(self),
    needsRefresh: false,
    transitions: new Set(),
    cancels: new Set(),
  }
  get.subscribe(self, (value) => applyOptimisticSource(get, state, value))
  get.subscribe(writeAtom, ([, atom]) => subscribeOptimisticWrite(get, self, state, atom))
  get.addFinalizer(() => finalizeOptimistic(state))
  return state.lastValue
}

function applyOptimisticSource<A>(get: AtomContext, state: OptimisticState<A>, value: A): void {
  state.lastValue = value
  if (state.transitions.size > 0) {
    return
  }
  applyOptimisticSourceIdle(get, state, value)
}

function applyOptimisticSourceIdle<A>(get: AtomContext, state: OptimisticState<A>, value: A): void {
  state.needsRefresh = false
  if (AsyncResult.isAsyncResult(value) === false) {
    get.setSelf(value)
    return
  }
  applyOptimisticResult(get, value)
}

function applyOptimisticResult<A>(get: AtomContext, value: AsyncResult.Result<A, Top>): void {
  const current = Option.getOrUndefined(get.self())
  if (AsyncResult.isInitial(value)) {
    applyOptimisticInitial(get, current, value)
    return
  }
  applyOptimisticNonInitial(get, current, value)
}

function applyOptimisticInitial<A>(
  get: AtomContext,
  current: Top,
  value: AsyncResult.Initial<A, Top>,
): void {
  if (isInitialResult(current) === false) {
    return
  }
  get.setSelf(value)
}

function isInitialResult(current: Top): boolean {
  if (AsyncResult.isResult(current) === false) {
    return false
  }
  return AsyncResult.isInitial(current)
}

function applyOptimisticNonInitial<A>(
  get: AtomContext,
  current: Top,
  value: AsyncResult.Success<A, Top> | AsyncResult.Failure<A, Top>,
): void {
  if (AsyncResult.isSuccess(value)) {
    applyOptimisticSuccess(get, current, value)
    return
  }
  get.setSelf(value)
}

function applyOptimisticSuccess<A>(
  get: AtomContext,
  current: Top,
  value: AsyncResult.Success<A, Top>,
): void {
  if (isSuccessResult(current)) {
    applyOptimisticNewerSuccess(get, current, value)
    return
  }
  get.setSelf(value)
}

function isSuccessResult(current: unknown): current is AsyncResult.Success<Top, Top> {
  if (AsyncResult.isResult(current) === false) {
    return false
  }
  return AsyncResult.isSuccess(current)
}

function applyOptimisticNewerSuccess<A>(
  get: AtomContext,
  current: AsyncResult.Success<Top, Top>,
  value: AsyncResult.Success<A, Top>,
): void {
  if (shouldReplaceOptimisticSuccess(current, value) === false) {
    return
  }
  get.setSelf(value)
}

function shouldReplaceOptimisticSuccess(
  current: AsyncResult.Success<Top, Top>,
  value: AsyncResult.Success<Top, Top>,
): boolean {
  if (value.waiting) {
    return false
  }
  return value.timestamp >= current.timestamp
}

function subscribeOptimisticWrite<A>(
  get: AtomContext,
  self: Atom<A>,
  state: OptimisticState<A>,
  atom: Atom<AsyncResult.Result<A, Top>> | undefined,
): void {
  if (atom === undefined) {
    return
  }
  subscribeOptimisticWriteAtom(get, self, state, atom)
}

function subscribeOptimisticWriteAtom<A>(
  get: AtomContext,
  self: Atom<A>,
  state: OptimisticState<A>,
  atom: Atom<AsyncResult.Result<A, Top>>,
): void {
  if (state.transitions.has(atom)) {
    return
  }
  startOptimisticTransition(get, self, state, atom)
}

function startOptimisticTransition<A>(
  get: AtomContext,
  self: Atom<A>,
  state: OptimisticState<A>,
  atom: Atom<AsyncResult.Result<A, Top>>,
): void {
  state.transitions.add(atom)
  let cancel: (() => void) | undefined = undefined
  cancel = get.registry.subscribe(atom, (result) => {
    onOptimisticTransition(get, self, state, atom, cancel, result)
  }, { immediate: true })
  keepOptimisticCancel(state, atom, cancel)
}

function keepOptimisticCancel<A>(
  state: OptimisticState<A>,
  atom: Atom<AsyncResult.Result<A, Top>>,
  cancel: () => void,
): void {
  if (state.transitions.has(atom)) {
    state.cancels.add(cancel)
    return
  }
  cancel()
}

function onOptimisticTransition<A>(
  get: AtomContext,
  self: Atom<A>,
  state: OptimisticState<A>,
  atom: Atom<AsyncResult.Result<A, Top>>,
  cancel: (() => void) | undefined,
  result: AsyncResult.Result<A, Top>,
): void {
  if (isWaitingSuccess(result)) {
    get.setSelf(result.value)
    return
  }
  finishOptimisticTransition(get, self, state, atom, cancel, result)
}

function isWaitingSuccess<A, E>(result: AsyncResult.Result<A, E>): result is AsyncResult.Success<A, E> {
  if (AsyncResult.isSuccess(result) === false) {
    return false
  }
  return result.waiting
}

function finishOptimisticTransition<A>(
  get: AtomContext,
  self: Atom<A>,
  state: OptimisticState<A>,
  atom: Atom<AsyncResult.Result<A, Top>>,
  cancel: (() => void) | undefined,
  result: AsyncResult.Result<A, Top>,
): void {
  state.transitions.delete(atom)
  dropOptimisticCancel(state, cancel)
  markOptimisticRefresh(state, result)
  settleOptimisticTransitions(get, self, state)
}

function dropOptimisticCancel<A>(state: OptimisticState<A>, cancel: (() => void) | undefined): void {
  if (cancel === undefined) {
    return
  }
  state.cancels.delete(cancel)
  cancel()
}

function markOptimisticRefresh<A>(state: OptimisticState<A>, result: AsyncResult.Result<A, Top>): void {
  if (shouldMarkOptimisticRefresh(state, result) === false) {
    return
  }
  state.needsRefresh = true
}

function shouldMarkOptimisticRefresh<A>(state: OptimisticState<A>, result: AsyncResult.Result<A, Top>): boolean {
  if (state.needsRefresh) {
    return false
  }
  return AsyncResult.isFailure(result) === false
}

function settleOptimisticTransitions<A>(get: AtomContext, self: Atom<A>, state: OptimisticState<A>): void {
  if (state.transitions.size !== 0) {
    return
  }
  settleOptimisticIdle(get, self, state)
}

function settleOptimisticIdle<A>(get: AtomContext, self: Atom<A>, state: OptimisticState<A>): void {
  if (state.needsRefresh) {
    state.needsRefresh = false
    get.refresh(self)
    return
  }
  get.setSelf(state.lastValue)
}

function finalizeOptimistic<A>(state: OptimisticState<A>): void {
  for (const cancel of state.cancels) cancel()
  state.transitions.clear()
  state.cancels.clear()
}

function runOptimisticFn<A, W, XA, XE, OW>(
  self: Writable<A, Atom<AsyncResult.Result<W, Top>>>,
  options: {
    readonly reducer: (current: NoInfer<A>, update: OW) => NoInfer<W>
    readonly fn: AtomResultFn<OW, XA, XE> | ((set: (result: NoInfer<W>) => void) => AtomResultFn<OW, XA, XE>)
  },
  transition: Writable<AsyncResult.Result<W, Top>>,
  arg: OW,
  get: FnContext,
): Effect.Effect<XA, XE> {
  const value = optimisticFnValue(options.reducer(get(self), arg))
  get.set(transition, AsyncResult.successWith(value, { waiting: true }))
  get.set(self, transition)
  const fnAtom = optimisticFnAtom(options.fn, transition, get)
  get.set(fnAtom, arg)
  return Effect.callback<XA, XE>((resume) => {
    get.subscribe(fnAtom, (result) => {
      if (optimisticFnPending(result)) {
        return
      }
      get.set(transition, AsyncResult.map(result, () => value))
      resumeOptimisticFn(resume, result)
    }, { immediate: true })
  })
}

function optimisticFnValue<W>(value: W): W {
  if (AsyncResult.isAsyncResult(value) === false) {
    return value
  }
  return AsyncResult.waiting(value, { touch: true })
}

function optimisticFnAtom<W, XA, XE, OW>(
  fn: AtomResultFn<OW, XA, XE> | ((set: (result: NoInfer<W>) => void) => AtomResultFn<OW, XA, XE>),
  transition: Writable<AsyncResult.Result<W, Top>>,
  get: FnContext,
): AtomResultFn<OW, XA, XE> {
  if (typeof fn === 'function') {
    return autoDispose(fn((value) => setOptimisticFnTransition(get, transition, value)))
  }
  return fn
}

function setOptimisticFnTransition<W>(
  get: FnContext,
  transition: Writable<AsyncResult.Result<W, Top>>,
  value: W,
): void {
  get.set(transition, AsyncResult.successWith(waitingIfResult(value), { waiting: true }))
}

function waitingIfResult<W>(value: W): W {
  if (AsyncResult.isAsyncResult(value) === false) {
    return value
  }
  return AsyncResult.waiting(value)
}

function resumeOptimisticFn<XA, XE>(
  resume: (effect: Effect.Effect<XA, XE>) => void,
  result: AsyncResult.Result<XA, XE>,
): void {
  if (AsyncResult.isSuccess(result)) {
    resume(Effect.succeed(result.value))
    return
  }
  resumeOptimisticFailure(resume, result)
}

function resumeOptimisticFailure<XA, XE>(
  resume: (effect: Effect.Effect<XA, XE>) => void,
  result: AsyncResult.Result<XA, XE>,
): void {
  if (AsyncResult.isFailure(result) === false) {
    return
  }
  resume(Effect.failCause(result.cause))
}

function optimisticFnPending<A, E>(result: AsyncResult.Result<A, E>): boolean {
  if (AsyncResult.isInitial(result)) {
    return true
  }
  return result.waiting
}

function readKvs<S extends Schema.ConstraintCodec<Top, Top>, Mode extends 'sync' | 'async'>(
  get: AtomContext,
  options: {
    readonly runtime: AtomRuntime<KeyValueStore.KeyValueStore, Top>
    readonly key: string
    readonly schema: S
    readonly defaultValue: LazyArg<S['Type']>
    readonly mode?: Mode | undefined
  },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  resultAtom: Atom<Top>,
  isWritten: () => boolean,
  setWritten: (written: boolean) => void,
): AsyncResult.Result<S['Type']> | S['Type'] {
  if (options.mode === 'async') {
    return readKvsAsync(get, options, setAtom, resultAtom, isWritten, setWritten)
  }
  return readKvsSync(get, options, setAtom, resultAtom, isWritten, setWritten)
}

function readKvsAsync<S extends Schema.ConstraintCodec<Top, Top>>(
  get: AtomContext,
  options: {
    readonly defaultValue: LazyArg<S['Type']>
  },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  resultAtom: Atom<Top>,
  isWritten: () => boolean,
  setWritten: (written: boolean) => void,
): AsyncResult.Result<S['Type']> {
  setWritten(false)
  get.mount(setAtom)
  get.subscribe(resultAtom, (result) => onKvsAsyncResult(get, options, setAtom, isWritten, result))
  return kvsAsyncValue(get, options, resultAtom)
}

function kvsHasStoreOption(result: unknown): result is AsyncResult.Success<Option.Option<Top>, Top> {
  if (AsyncResult.isResult(result) === false) {
    return false
  }
  return kvsSuccessHasOption(result)
}

function kvsSuccessHasOption(
  result: AsyncResult.Result<unknown, unknown>,
): result is AsyncResult.Success<Option.Option<Top>, Top> {
  if (AsyncResult.isSuccess(result) === false) {
    return false
  }
  return Option.isOption(result.value)
}

function kvsAsyncValue<S extends Schema.ConstraintCodec<Top, Top>>(
  get: AtomContext,
  options: { readonly defaultValue: LazyArg<S['Type']> },
  resultAtom: Atom<Top>,
): AsyncResult.Result<S['Type']> {
  const result = get.once(resultAtom)
  if (kvsHasStoreOption(result) === false) {
    return AsyncResult.initial<S['Type']>()
  }
  return kvsAsyncFromOption(options, result.value)
}

function kvsAsyncFromOption<S extends Schema.ConstraintCodec<Top, Top>>(
  options: { readonly defaultValue: LazyArg<S['Type']> },
  value: Option.Option<Top>,
): AsyncResult.Result<S['Type']> {
  if (Option.isSome(value)) {
    return AsyncResult.success(value.value)
  }
  return AsyncResult.success(options.defaultValue())
}

function onKvsAsyncResult<S extends Schema.ConstraintCodec<Top, Top>>(
  get: AtomContext,
  options: { readonly defaultValue: LazyArg<S['Type']> },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  isWritten: () => boolean,
  result: Top,
): void {
  if (isWritten()) {
    return
  }
  applyKvsAsyncResult(get, options, setAtom, result)
}

function applyKvsAsyncResult<S extends Schema.ConstraintCodec<Top, Top>>(
  get: AtomContext,
  options: { readonly defaultValue: LazyArg<S['Type']> },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  result: Top,
): void {
  if (kvsHasStoreOption(result) === false) {
    return
  }
  applyKvsAsyncOption(get, options, setAtom, result.value)
}

function applyKvsAsyncOption<S extends Schema.ConstraintCodec<Top, Top>>(
  get: AtomContext,
  options: { readonly defaultValue: LazyArg<S['Type']> },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  value: Option.Option<Top>,
): void {
  if (Option.isSome(value)) {
    get.setSelf(AsyncResult.success(value.value))
    return
  }
  const next = options.defaultValue()
  get.set(setAtom, next)
  get.setSelf(AsyncResult.success(next))
}

function readKvsSync<S extends Schema.ConstraintCodec<Top, Top>>(
  get: AtomContext,
  options: { readonly defaultValue: LazyArg<S['Type']> },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  resultAtom: Atom<Top>,
  isWritten: () => boolean,
  setWritten: (written: boolean) => void,
): S['Type'] {
  setWritten(false)
  get.mount(setAtom)
  get.subscribe(resultAtom, (result) => onKvsSyncResult(get, options, setAtom, isWritten, result), { immediate: true })
  return Option.getOrElse(get.self<S['Type']>(), options.defaultValue)
}

function onKvsSyncResult<S extends Schema.ConstraintCodec<Top, Top>>(
  get: AtomContext,
  options: { readonly defaultValue: LazyArg<S['Type']> },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  isWritten: () => boolean,
  result: Top,
): void {
  if (kvsHasStoreOption(result) === false) {
    return
  }
  applyKvsSyncOption(get, options, setAtom, isWritten, result.value)
}

function applyKvsSyncOption<S extends Schema.ConstraintCodec<Top, Top>>(
  get: AtomContext,
  options: { readonly defaultValue: LazyArg<S['Type']> },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  isWritten: () => boolean,
  value: Option.Option<Top>,
): void {
  if (isWritten()) {
    return
  }
  applyKvsSyncValue(get, options, setAtom, value)
}

function applyKvsSyncValue<S extends Schema.ConstraintCodec<Top, Top>>(
  get: AtomContext,
  options: { readonly defaultValue: LazyArg<S['Type']> },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  value: Option.Option<Top>,
): void {
  if (Option.isSome(value)) {
    get.setSelf(value.value)
    return
  }
  const next = Option.getOrElse(get.self<S['Type']>(), options.defaultValue)
  get.setSelf(next)
  get.set(setAtom, next)
}

function writeKvs<S extends Schema.ConstraintCodec<Top, Top>>(
  ctx: WriteContext<AsyncResult.Result<S['Type']> | S['Type']>,
  options: { readonly mode?: 'sync' | 'async' | undefined },
  setAtom: AtomResultFn<S['Type'], Top, Top>,
  value: S['Type'],
): void {
  ctx.set(setAtom, value)
  ctx.setSelf(kvsWrittenValue(options.mode, value))
}

function kvsWrittenValue<A>(mode: 'sync' | 'async' | undefined, value: A): AsyncResult.Result<A> | A {
  if (mode === 'async') {
    return AsyncResult.success(value)
  }
  return value
}

function serializableLabel(self: Atom<Top>, key: string): readonly [string, string] {
  if (self.label === undefined) {
    return [key, stackLabel()]
  }
  return self.label
}

// -----------------------------------------------------------------------------
// constructors
// -----------------------------------------------------------------------------

/**
 * Creates an atom from a synchronous value or read function, or from an `Effect` or `Stream` whose state is exposed as an `AsyncResult`; plain values create writable state atoms.
 *
 * To pass `initialValue` or `uninterruptible`, use `makeWith`.
 *
 * @since 4.0.0
 */
export function make<A, E>(
  create: (get: AtomContext) => Effect.Effect<A, E, Scope.Scope | Current>,
): Atom<AsyncResult.Result<A, E>>
export function make<A, E>(
  effect: Effect.Effect<A, E, Scope.Scope | Current>,
): Atom<AsyncResult.Result<A, E>>
export function make<A, E>(
  create: (get: AtomContext) => Stream.Stream<A, E, Current>,
): Atom<AsyncResult.Result<A, E | Cause.NoSuchElementError>>
export function make<A, E>(
  stream: Stream.Stream<A, E, Current>,
): Atom<AsyncResult.Result<A, E | Cause.NoSuchElementError>>
export function make<A>(create: (get: AtomContext) => A): Atom<A>
export function make<A>(initialValue: A): Writable<A>
export function make<A, E>(
  arg:
    | Effect.Effect<A, E, Scope.Scope | Current>
    | ((
      get: AtomContext,
      services?: Context.Context<never>,
    ) => Effect.Effect<A, E, Scope.Scope | Current>)
    | Stream.Stream<A, E, Current>
    | ((get: AtomContext, services?: Context.Context<never>) => Stream.Stream<A, E, Current>)
    | ((get: AtomContext, services?: Context.Context<never>) => A)
    | A,
): Top {
  return asReadableAtom(makeReadOrAtom(arg))
}

/**
 * `make` for the Effect, Effect-returning function, Stream, and
 * Stream-returning function forms, with required `initialValue` and
 * `uninterruptible` options.
 *
 * @since 4.0.0
 */
export const makeWith: {
  <A, E>(
    create: (get: AtomContext) => Effect.Effect<A, E, Scope.Scope | Current>,
    options: {
      readonly initialValue?: A | undefined
      readonly uninterruptible?: boolean | undefined
    },
  ): Atom<AsyncResult.Result<A, E>>
  <A, E>(
    effect: Effect.Effect<A, E, Scope.Scope | Current>,
    options: {
      readonly initialValue?: A
      readonly uninterruptible?: boolean | undefined
    },
  ): Atom<AsyncResult.Result<A, E>>
  <A, E>(
    create: (get: AtomContext) => Stream.Stream<A, E, Current>,
    options: {
      readonly initialValue?: A
    },
  ): Atom<AsyncResult.Result<A, E | Cause.NoSuchElementError>>
  <A, E>(
    stream: Stream.Stream<A, E, Current>,
    options: {
      readonly initialValue?: A
    },
  ): Atom<AsyncResult.Result<A, E | Cause.NoSuchElementError>>
  <A, E>(
    options: {
      readonly initialValue?: A | undefined
      readonly uninterruptible?: boolean | undefined
    },
  ): (create: (get: AtomContext) => Effect.Effect<A, E, Scope.Scope | Current>) => Atom<AsyncResult.Result<A, E>>
  <A, E>(
    options: {
      readonly initialValue?: A | undefined
      readonly uninterruptible?: boolean | undefined
    },
  ): (effect: Effect.Effect<A, E, Scope.Scope | Current>) => Atom<AsyncResult.Result<A, E>>
  <A, E>(
    options: {
      readonly initialValue?: A
    },
  ): (
    create: (get: AtomContext) => Stream.Stream<A, E, Current>,
  ) => Atom<AsyncResult.Result<A, E | Cause.NoSuchElementError>>
  <A, E>(
    options: {
      readonly initialValue?: A
    },
  ): (stream: Stream.Stream<A, E, Current>) => Atom<AsyncResult.Result<A, E | Cause.NoSuchElementError>>
} = dual(
  2,
  <A, E>(
    arg:
      | Effect.Effect<A, E, Scope.Scope | Current>
      | ((
        get: AtomContext,
        services?: Context.Context<never>,
      ) => Effect.Effect<A, E, Scope.Scope | Current>)
      | Stream.Stream<A, E, Current>
      | ((get: AtomContext, services?: Context.Context<never>) => Stream.Stream<A, E, Current>)
      | ((get: AtomContext, services?: Context.Context<never>) => A)
      | A,
    options: {
      readonly initialValue?: Top
      readonly uninterruptible?: boolean | undefined
    },
  ): Top => asReadableAtom(makeReadOrAtom(arg, options)),
)

// -----------------------------------------------------------------------------
// constructors - effect
// -----------------------------------------------------------------------------

export function makeRead<A, E>(
  effect: Effect.Effect<A, E, Scope.Scope | Current>,
): (get: AtomContext, services?: Context.Context<never>) => AsyncResult.Result<A, E>
export function makeRead<A, E>(
  create: (get: AtomContext) => Effect.Effect<A, E, Scope.Scope | Current>,
): (get: AtomContext, services?: Context.Context<never>) => AsyncResult.Result<A, E>
export function makeRead<A, E>(
  stream: Stream.Stream<A, E, Current>,
): (get: AtomContext, services?: Context.Context<never>) => AsyncResult.Result<A, E | Cause.NoSuchElementError>
export function makeRead<A, E>(
  create: (get: AtomContext) => Stream.Stream<A, E, Current>,
): (get: AtomContext, services?: Context.Context<never>) => AsyncResult.Result<A, E | Cause.NoSuchElementError>
export function makeRead<A>(
  create: (get: AtomContext) => A,
): (get: AtomContext, services?: Context.Context<never>) => A
export function makeRead<A>(initialValue: A): Writable<A>
export function makeRead<A, E>(
  arg:
    | Effect.Effect<A, E, Scope.Scope | Current>
    | ((
      get: AtomContext,
      services?: Context.Context<never>,
    ) => Effect.Effect<A, E, Scope.Scope | Current>)
    | Stream.Stream<A, E, Current>
    | ((get: AtomContext, services?: Context.Context<never>) => Stream.Stream<A, E, Current>)
    | ((get: AtomContext, services?: Context.Context<never>) => A)
    | A,
): Top {
  return makeReadOrAtom(arg)
}

/**
 * `makeRead` for the Effect, Effect-returning function, Stream, and
 * Stream-returning function forms, with required `initialValue` and
 * `uninterruptible` options.
 *
 * @since 4.0.0
 */
export const makeReadWith: {
  <A, E>(
    effect: Effect.Effect<A, E, Scope.Scope | Current>,
    options: {
      readonly initialValue?: A
      readonly uninterruptible?: boolean | undefined
    },
  ): (get: AtomContext, services?: Context.Context<never>) => AsyncResult.Result<A, E>
  <A, E>(
    create: (get: AtomContext) => Effect.Effect<A, E, Scope.Scope | Current>,
    options: {
      readonly initialValue?: A
      readonly uninterruptible?: boolean | undefined
    },
  ): (get: AtomContext, services?: Context.Context<never>) => AsyncResult.Result<A, E>
  <A, E>(
    stream: Stream.Stream<A, E, Current>,
    options: {
      readonly initialValue?: A
      readonly uninterruptible?: boolean | undefined
    },
  ): (get: AtomContext, services?: Context.Context<never>) => AsyncResult.Result<A, E | Cause.NoSuchElementError>
  <A, E>(
    create: (get: AtomContext) => Stream.Stream<A, E, Current>,
    options: {
      readonly initialValue?: A
      readonly uninterruptible?: boolean | undefined
    },
  ): (get: AtomContext, services?: Context.Context<never>) => AsyncResult.Result<A, E | Cause.NoSuchElementError>
  <A, E>(
    options: {
      readonly initialValue?: A
      readonly uninterruptible?: boolean | undefined
    },
  ): (
    effect: Effect.Effect<A, E, Scope.Scope | Current>,
  ) => (get: AtomContext, services?: Context.Context<never>) => AsyncResult.Result<A, E>
  <A, E>(
    options: {
      readonly initialValue?: A
      readonly uninterruptible?: boolean | undefined
    },
  ): (
    create: (get: AtomContext) => Effect.Effect<A, E, Scope.Scope | Current>,
  ) => (get: AtomContext, services?: Context.Context<never>) => AsyncResult.Result<A, E>
  <A, E>(
    options: {
      readonly initialValue?: A
      readonly uninterruptible?: boolean | undefined
    },
  ): (
    stream: Stream.Stream<A, E, Current>,
  ) => (get: AtomContext, services?: Context.Context<never>) => AsyncResult.Result<A, E | Cause.NoSuchElementError>
  <A, E>(
    options: {
      readonly initialValue?: A
      readonly uninterruptible?: boolean | undefined
    },
  ): (
    create: (get: AtomContext) => Stream.Stream<A, E, Current>,
  ) => (get: AtomContext, services?: Context.Context<never>) => AsyncResult.Result<A, E | Cause.NoSuchElementError>
} = dual(
  2,
  <A, E>(
    arg:
      | Effect.Effect<A, E, Scope.Scope | Current>
      | ((
        get: AtomContext,
        services?: Context.Context<never>,
      ) => Effect.Effect<A, E, Scope.Scope | Current>)
      | Stream.Stream<A, E, Current>
      | ((get: AtomContext, services?: Context.Context<never>) => Stream.Stream<A, E, Current>)
      | ((get: AtomContext, services?: Context.Context<never>) => A)
      | A,
    options: {
      readonly initialValue?: Top
      readonly uninterruptible?: boolean | undefined
    },
  ): Top => makeReadOrAtom(arg, options),
)

const state = <A>(
  initialValue: A,
): Writable<A> =>
  writable(function(_get) {
    return initialValue
  }, constSetSelf)

const effect = <A, E, R0>(
  get: AtomContext,
  effect: Effect.Effect<A, E, R0>,
  options?: {
    readonly initialValue?: A
    readonly uninterruptible?: boolean | undefined
  },
  services?: Context.Context<never>,
): AsyncResult.Result<A, E> => makeEffect(get, effect, resultFromOptions(options), services, options?.uninterruptible)

type EffectSyncState<A, E> = {
  syncResult: AsyncResult.Result<A, E> | undefined
  isAsync: boolean
}

function makeEffect<A, E, R0>(
  ctx: AtomContext,
  effect: Effect.Effect<A, E, R0>,
  initialValue: AsyncResult.Result<A, E>,
  services?: Context.Context<never>,
  uninterruptible?: boolean,
): AsyncResult.Result<A, E> {
  return runMakeEffect(ctx, effect, initialValue, contextOrEmpty(services), uninterruptible === true)
}

function contextOrEmpty(services?: Context.Context<never>): Context.Context<never> {
  if (services === undefined) {
    return Context.empty()
  }
  return services
}

function runMakeEffect<A, E, R0>(
  ctx: AtomContext,
  effect: Effect.Effect<A, E, R0>,
  initialValue: AsyncResult.Result<A, E>,
  services: Context.Context<never>,
  uninterruptible: boolean,
): AsyncResult.Result<A, E> {
  const previous = ctx.self<AsyncResult.Result<A, E>>()
  const scope = Scope.makeUnsafe()
  ctx.addFinalizer(() => {
    Effect.runForkWith(services)(Scope.close(scope, Exit.void))
  })
  const servicesMap = new Map(services.mapUnsafe)
  servicesMap.set(Scope.Scope.key, scope)
  servicesMap.set(Current.key, ctx.registry.handle)
  servicesMap.set(Scheduler.Scheduler.key, ctx.registry.scheduler)
  const state: EffectSyncState<A, E> = { syncResult: undefined, isAsync: false }
  const cancel = runCallbackSync<A, E, R0>(
    Context.makeUnsafe<R0>(servicesMap),
    effect,
    (exit) => onEffectExit(ctx, state, previous, exit),
    uninterruptible,
  )
  state.isAsync = true
  addCancelFinalizer(ctx, cancel)
  return settleEffectResult(previous, state.syncResult, initialValue)
}

function onEffectExit<A, E>(
  ctx: AtomContext,
  state: EffectSyncState<A, E>,
  previous: Option.Option<AsyncResult.Result<A, E>>,
  exit: Exit.Exit<A, E>,
): void {
  state.syncResult = AsyncResult.fromExitWithPrevious(exit, previous)
  setSelfIfAsync(ctx, state)
}

function setSelfIfAsync<A, E>(ctx: AtomContext, state: EffectSyncState<A, E>): void {
  if (state.isAsync) {
    ctx.setSelf(state.syncResult)
  }
}

function addCancelFinalizer(ctx: AtomContext, cancel: (() => void) | undefined): void {
  if (cancel === undefined) {
    return
  }
  ctx.addFinalizer(cancel)
}

function settleEffectResult<A, E>(
  previous: Option.Option<AsyncResult.Result<A, E>>,
  syncResult: AsyncResult.Result<A, E> | undefined,
  initialValue: AsyncResult.Result<A, E>,
): AsyncResult.Result<A, E> {
  if (syncResult !== undefined) {
    return syncResult
  }
  return waitingEffectResult(previous, initialValue)
}

function waitingEffectResult<A, E>(
  previous: Option.Option<AsyncResult.Result<A, E>>,
  initialValue: AsyncResult.Result<A, E>,
): AsyncResult.Result<A, E> {
  if (Option.isSome(previous)) {
    return AsyncResult.waitingFrom(previous)
  }
  return AsyncResult.waiting(initialValue)
}

function runCallbackSync<A, E, R0>(
  services: Context.Context<R0>,
  effect: Effect.Effect<A, E, R0> | Exit.Exit<A, E>,
  onExit: (exit: Exit.Exit<A, E>) => void,
  uninterruptible?: boolean,
): (() => void) | undefined {
  return runCallbackSyncFlag(services, effect, onExit, uninterruptible === true)
}

function runCallbackSyncFlag<A, E, R0>(
  services: Context.Context<R0>,
  effect: Effect.Effect<A, E, R0> | Exit.Exit<A, E>,
  onExit: (exit: Exit.Exit<A, E>) => void,
  uninterruptible: boolean,
): (() => void) | undefined {
  if (Exit.isExit(effect)) {
    onExit(effect)
    return undefined
  }
  return runForkedCallback(services, effect, onExit, uninterruptible)
}

function runForkedCallback<A, E, R0>(
  services: Context.Context<R0>,
  effect: Effect.Effect<A, E, R0>,
  onExit: (exit: Exit.Exit<A, E>) => void,
  uninterruptible: boolean,
): (() => void) | undefined {
  const runFork = Effect.runForkWith(services)
  const fiber = runFork(effect)
  fiber.currentDispatcher.flush()
  const result = fiber.pollUnsafe()
  if (result !== undefined) {
    onExit(result)
    return undefined
  }
  return observeForkedFiber(fiber, onExit, uninterruptible)
}

function observeForkedFiber<A, E>(
  fiber: Fiber.Fiber<A, E>,
  onExit: (exit: Exit.Exit<A, E>) => void,
  uninterruptible: boolean,
): () => void {
  const remove = fiber.addObserver(onExit)
  return function cancel() {
    interruptForkedFiber(remove, fiber, uninterruptible)
  }
}

function interruptForkedFiber<A, E>(
  remove: () => void,
  fiber: Fiber.Fiber<A, E>,
  uninterruptible: boolean,
): void {
  remove()
  if (uninterruptible === false) {
    fiber.interruptUnsafe()
  }
}

// -----------------------------------------------------------------------------
// context
// -----------------------------------------------------------------------------

/**
 * Atom that builds a `Context` from a `Layer` and exposes constructors for atoms, functions, pulls, and subscription refs that run with that context.
 *
 * @since 4.0.0
 */
export interface AtomRuntime<R, ER = never> extends Atom<AsyncResult.Result<Context.Context<R>, ER>> {
  readonly factory: RuntimeFactory

  readonly layer: Atom<Layer.Layer<R, ER, Top>>

  readonly atom: {
    <A, E>(
      create: (get: AtomContext) => Effect.Effect<A, E, Scope.Scope | R | Current | Reactivity.Reactivity>,
      options?: {
        readonly initialValue?: A
        readonly uninterruptible?: boolean | undefined
      },
    ): Atom<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>>
    <A, E>(effect: Effect.Effect<A, E, Scope.Scope | R | Current | Reactivity.Reactivity>, options?: {
      readonly initialValue?: A
      readonly uninterruptible?: boolean | undefined
    }): Atom<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>>
    <A, E>(create: (get: AtomContext) => Stream.Stream<A, E, Current | Reactivity.Reactivity | R>, options?: {
      readonly initialValue?: A
    }): Atom<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>>
    <A, E>(stream: Stream.Stream<A, E, Current | Reactivity.Reactivity | R>, options?: {
      readonly initialValue?: A
    }): Atom<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>>
  }

  readonly fn: {
    <Arg>(): {
      <E, A>(
        fn: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | Current | Reactivity.Reactivity | R>,
        options?: {
          readonly initialValue?: A | undefined
          readonly reactivityKeys?: readonly Top[] | ReadonlyRecord<string, readonly Top[]> | undefined
          readonly concurrent?: boolean | undefined
        },
      ): AtomResultFn<Arg, A, E | ER> | AnyAtomResultFn
      <E, A>(
        fn: (arg: Arg, get: FnContext) => Stream.Stream<A, E, Current | Reactivity.Reactivity | R>,
        options?: {
          readonly initialValue?: A | undefined
          readonly reactivityKeys?: readonly Top[] | ReadonlyRecord<string, readonly Top[]> | undefined
          readonly concurrent?: boolean | undefined
        },
      ): AtomResultFn<Arg, A, E | ER | Cause.NoSuchElementError> | AnyAtomResultFn
    }
    <E, A, Arg = void>(
      fn: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | Current | Reactivity.Reactivity | R>,
      options?: {
        readonly initialValue?: A | undefined
        readonly reactivityKeys?: readonly Top[] | ReadonlyRecord<string, readonly Top[]> | undefined
        readonly concurrent?: boolean | undefined
      },
    ): AtomResultFn<Arg, A, E | ER> | AnyAtomResultFn
    <E, A, Arg = void>(
      fn: (arg: Arg, get: FnContext) => Stream.Stream<A, E, Current | Reactivity.Reactivity | R>,
      options?: {
        readonly initialValue?: A | undefined
        readonly reactivityKeys?: readonly Top[] | ReadonlyRecord<string, readonly Top[]> | undefined
        readonly concurrent?: boolean | undefined
      },
    ): AtomResultFn<Arg, A, E | ER | Cause.NoSuchElementError> | AnyAtomResultFn
  }

  readonly pull: <A, E>(
    create:
      | ((get: AtomContext) => Stream.Stream<A, E, R | Current | Reactivity.Reactivity>)
      | Stream.Stream<A, E, R | Current | Reactivity.Reactivity>,
    options?: {
      readonly disableAccumulation?: boolean
      readonly initialValue?: readonly A[]
    },
  ) => Writable<PullResult<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>, void>

  readonly subscriptionRef: <A, E>(
    create:
      | Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | R | Current | Reactivity.Reactivity>
      | ((
        get: AtomContext,
      ) => Effect.Effect<
        SubscriptionRef.SubscriptionRef<A>,
        E,
        Scope.Scope | R | Current | Reactivity.Reactivity
      >),
  ) => Writable<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>, A>
}

/**
 * Factory for `AtomRuntime` values that share a set of global layers.
 *
 * @since 4.0.0
 */
export interface RuntimeFactory {
  <R, E>(
    create:
      | Layer.Layer<R, E, Top>
      | ((get: AtomContext) => Layer.Layer<R, E, Top>),
  ): AtomRuntime<R, E>
  readonly addGlobalLayer: <A, E>(layer: Layer.Layer<A, E, Current | Reactivity.Reactivity>) => void

  /**
   * Uses the `Reactivity` service from the runtime to refresh the atom whenever
   * the keys change.
   */
  readonly withReactivity: (
    keys: readonly Top[] | ReadonlyRecord<string, readonly Top[]>,
  ) => <A extends Atom<Top>>(atom: A) => A
}

/**
 * A `RuntimeFactory` backed by an atom whose memo map is scoped to each registry.
 *
 * @since 4.0.0
 */
export interface RegistryRuntimeFactory extends RuntimeFactory {
  readonly memoMap: Atom<Layer.MemoMap>
}

/**
 * A `RuntimeFactory` backed by a concrete memo map shared across registries.
 *
 * @since 4.0.0
 */
export interface SharedRuntimeFactory extends RuntimeFactory {
  readonly memoMap: Layer.MemoMap
}

/**
 * Creates a `RuntimeFactory` backed by a registry-scoped memo map by default,
 * or by the supplied atom or concrete `Layer.MemoMap`.
 *
 * @since 4.0.0
 */
export function context(): RegistryRuntimeFactory
export function context(options: { readonly memoMap: Atom<Layer.MemoMap> }): RegistryRuntimeFactory
export function context(options: { readonly memoMap: Layer.MemoMap }): SharedRuntimeFactory
export function context(options?: {
  readonly memoMap: Atom<Layer.MemoMap> | Layer.MemoMap
}): RegistryRuntimeFactory | SharedRuntimeFactory {
  const memoMap = contextMemoMap(options)
  const resolveMemoMap = (get: AtomContext): Layer.MemoMap => resolveContextMemoMap(get, memoMap)
  // widened container: accumulates global layers across merges of heterogeneous output types.
  // ROut=never is sound: Layer is contravariant in ROut, so any accumulated layer is assignable
  // back into this slot; E=never after orDie keeps the slot closed; RIn=Current is the one
  // requirement every merged layer shares after Reactivity is provided.
  let globalLayer: Layer.Layer<never, never, Current> = Reactivity.layer
  const addGlobalLayer = <A, E>(layer: Layer.Layer<A, E, Current | Reactivity.Reactivity>): void => {
    globalLayer = Layer.provideMerge(globalLayer, Layer.orDie(Layer.provide(layer, Reactivity.layer)))
  }
  const reactivityAtom = removeTtl(
    make((get) =>
      Effect.contextWith((services: Context.Context<Scope.Scope>) =>
        Layer.buildWithMemoMap(Reactivity.layer, resolveMemoMap(get), Context.get(services, Scope.Scope))
      ).pipe(
        Effect.map(Context.get(Reactivity.Reactivity)),
      )
    ),
  )
  const withReactivity = (
    keys: readonly Top[] | ReadonlyRecord<string, readonly Top[]>,
  ): <A extends Atom<Top>>(atom: A) => A =>
  <A extends Atom<Top>>(atom: A): A => {
    const read = (get: AtomContext): Top => {
      const store = AsyncResult.getOrThrow(get(reactivityAtom))
      get.addFinalizer(store.registerUnsafe(keys, () => {
        get.refresh(atom)
      }))
      get.subscribe(atom, (value) => get.setSelf(value))
      return atom.read(get)
    }
    return { ...atom, read }
  }
  const factoryFn = function makeRuntime<R, E, RIn = never>(
    create:
      | Layer.Layer<R, E, RIn>
      | ((get: AtomContext) => Layer.Layer<R, E, RIn>),
  ): AtomRuntime<R, E> {
    const layerAtom = keepAlive(runtimeLayerAtom(create, globalLayer))
    const self: AtomRuntime<R, E> = {
      ...AtomProto,
      ...RuntimeProto,
      keepAlive: false,
      lazy: true,
      refresh: undefined,
      factory,
      layer: layerAtom,
      read(get: AtomContext) {
        const layer = get(layerAtom)
        const built = Effect.flatMap(
          Effect.scope,
          (scope) => Layer.buildWithMemoMap(layer, resolveMemoMap(get), scope),
        )
        return effect(get, built, { uninterruptible: true })
      },
    }
    return self
  }
  const factory = assignRuntimeFactory(factoryFn, memoMap, addGlobalLayer, withReactivity)
  return factory
}

function assignRuntimeFactory(
  factoryFn: <R, E, RIn = never>(
    create: Layer.Layer<R, E, RIn> | ((get: AtomContext) => Layer.Layer<R, E, RIn>),
  ) => AtomRuntime<R, E>,
  memoMap: Atom<Layer.MemoMap> | Layer.MemoMap,
  addGlobalLayer: <A, E>(layer: Layer.Layer<A, E, Current | Reactivity.Reactivity>) => void,
  withReactivity: (
    keys: readonly Top[] | ReadonlyRecord<string, readonly Top[]>,
  ) => <A extends Atom<Top>>(atom: A) => A,
): RegistryRuntimeFactory | SharedRuntimeFactory {
  if (isAtom(memoMap)) {
    return Object.assign(factoryFn, { memoMap, addGlobalLayer, withReactivity })
  }
  return Object.assign(factoryFn, { memoMap, addGlobalLayer, withReactivity })
}

/**
 * Default registry-scoped `RuntimeFactory`.
 *
 * @since 4.0.0
 */
export const runtime: RegistryRuntimeFactory = context()

/**
 * Returns `Rx.runtime.withReactivity` for refreshing an atom whenever the
 * keys change in the `Reactivity` service.
 *
 * **When to use**
 *
 * Use to refresh an atom whenever one or more invalidation keys change in the
 * default reactivity runtime.
 *
 * @since 4.0.0
 */
export const withReactivity: (
  keys: readonly Top[] | ReadonlyRecord<string, readonly Top[]>,
) => <A extends Atom<Top>>(atom: A) => A = runtime.withReactivity

// -----------------------------------------------------------------------------
// constructors - stream
// -----------------------------------------------------------------------------

const stream = <A, E, R0>(
  get: AtomContext,
  stream: Stream.Stream<A, E, R0>,
  options?: {
    readonly initialValue?: A
  },
  services?: Context.Context<never>,
): AsyncResult.Result<A, E | Cause.NoSuchElementError> => makeStream(get, stream, resultFromOptions(options), services)

function makeStream<A, E, R0>(
  ctx: AtomContext,
  stream: Stream.Stream<A, E, R0>,
  initialValue: AsyncResult.Result<A, E | Cause.NoSuchElementError>,
  services?: Context.Context<never>,
): AsyncResult.Result<A, E | Cause.NoSuchElementError> {
  return runMakeStream(ctx, stream, initialValue, contextOrEmpty(services))
}

function runMakeStream<A, E, R0>(
  ctx: AtomContext,
  stream: Stream.Stream<A, E, R0>,
  initialValue: AsyncResult.Result<A, E | Cause.NoSuchElementError>,
  services: Context.Context<never>,
): AsyncResult.Result<A, E | Cause.NoSuchElementError> {
  const previous = ctx.self<AsyncResult.Result<A, E | Cause.NoSuchElementError>>()
  services = Context.add(services, Current, ctx.registry.handle)

  // What this run emitted. The done branch settles from it: `previous` is the
  // state from BEFORE the run, so consulting it alone discards the value the
  // loop just wrote and reports an empty stream for a stream that produced one.
  let latest: Option.Option<A> = Option.none()

  const run = Effect.scopedWith((scope) =>
    Effect.flatMap(Channel.toPullScoped(stream.channel, scope), (pull) =>
      Effect.whileLoop({
        while: constTrue,
        body: () => pull,
        step(arr) {
          const last = Arr.lastNonEmpty(arr)
          latest = Option.some(last)
          ctx.setSelf(AsyncResult.successWith(last, {
            waiting: true,
          }))
        },
      }))
  ).pipe(
    Effect.catchCause((cause) => {
      onStreamCause(ctx, cause, latest, previous)
      return Effect.void
    }),
  )
  const servicesMap = new Map(services.mapUnsafe)
  servicesMap.set(Current.key, ctx.registry.handle)
  servicesMap.set(Scheduler.Scheduler.key, ctx.registry.scheduler)

  const cancel = runCallbackSync<void, never, R0 | Current>(
    Context.makeUnsafe<R0 | Current>(servicesMap),
    run,
    constVoid,
    false,
  )
  addCancelFinalizer(ctx, cancel)
  return waitingEffectResult(previous, initialValue)
}

// -----------------------------------------------------------------------------
// constructors - subscription ref
// -----------------------------------------------------------------------------

/**
 * Creates a writable atom backed by a `SubscriptionRef`, or by an effect that produces one, updating from ref changes and writing atom updates back to the ref.
 *
 * @since 4.0.0
 */
export const subscriptionRef: {
  <A>(
    ref: SubscriptionRef.SubscriptionRef<A> | ((get: AtomContext) => SubscriptionRef.SubscriptionRef<A>),
  ): Writable<A> | Writable<Top, Top>
  <A, E>(
    effect:
      | Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | Current>
      | ((get: AtomContext) => Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | Current>),
  ): Writable<AsyncResult.Result<A, E | Cause.NoSuchElementError>, A> | Writable<Top, Top>
} = <A, E = never>(
  ref:
    | SubscriptionRef.SubscriptionRef<A>
    | ((get: AtomContext) => SubscriptionRef.SubscriptionRef<A>)
    | Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | Current>
    | ((
      get: AtomContext,
    ) => Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | Current>),
): Writable<
  A | AsyncResult.Result<A | Context.Context<Top>, E | Cause.NoSuchElementError>,
  A
> =>
  makeSubRef(
    readable((get) => readSubscriptionRefSource(get, ref)),
    (get, source) => readSubRefSource(get, source),
  )

/** What a ref-producing atom yields: a ref outright, or a result that may carry one. */
type RefSource<A, R0, E> =
  | SubscriptionRef.SubscriptionRef<A>
  | AsyncResult.Result<SubscriptionRef.SubscriptionRef<A> | Context.Context<R0>, E>

/** The ref a source carries, when it has produced one. */
const refOf = <A, R0, E>(
  source: RefSource<A, R0, E>,
): Option.Option<SubscriptionRef.SubscriptionRef<A>> => {
  if (AsyncResult.isResult(source) === false) {
    return Option.some(source)
  }
  return refOfResult(source)
}

function refOfResult<A, R0, E>(
  source: AsyncResult.Result<SubscriptionRef.SubscriptionRef<A> | Context.Context<R0>, E>,
): Option.Option<SubscriptionRef.SubscriptionRef<A>> {
  if (AsyncResult.isSuccess(source) === false) {
    return Option.none()
  }
  return refFromSuccessValue(source.value)
}

/**
 * Reads a ref the caller already holds: subscribes to its changes for the
 * lifetime of the read and yields its current value. A ref handed over outright
 * has nothing to await, so this reports the value itself, never a result.
 */
const readRefDirect = <A>(
  get: AtomContext,
  ref: SubscriptionRef.SubscriptionRef<A>,
  services?: Context.Context<never>,
): A => runReadRefDirect(get, ref, contextOrEmpty(services))

function runReadRefDirect<A>(
  get: AtomContext,
  ref: SubscriptionRef.SubscriptionRef<A>,
  services: Context.Context<never>,
): A {
  get.addFinalizer(
    SubscriptionRef.changes(ref).pipe(
      Stream.runForEachArray((arr) => {
        for (let i = 0; i < arr.length; i++) {
          get.setSelf(arr[i])
        }
        return Effect.void
      }),
      Effect.runCallbackWith(services),
    ),
  )
  return Effect.runSyncWith(services)(ref.pipe(SubscriptionRef.get))
}

/**
 * Reads a ref that is still being produced, so the value reports every state the
 * producer reaches rather than only its outcome.
 */
const readRefResult = <A, R0, E>(
  get: AtomContext,
  source: AsyncResult.Result<SubscriptionRef.SubscriptionRef<A> | Context.Context<R0>, E>,
  services?: Context.Context<never>,
): AsyncResult.Result<A | Context.Context<R0>, E | Cause.NoSuchElementError> => {
  if (AsyncResult.isSuccess(source)) {
    return readRefSuccess(get, source.value, contextOrEmpty(services))
  }
  return readRefPending(source)
}

function readRefSuccess<A, R0, E>(
  get: AtomContext,
  value: SubscriptionRef.SubscriptionRef<A> | Context.Context<R0>,
  services: Context.Context<never>,
): AsyncResult.Result<A | Context.Context<R0>, E | Cause.NoSuchElementError> {
  if (Context.isContext(value)) {
    return AsyncResult.success<A | Context.Context<R0>, E>(value)
  }
  return makeStream(get, SubscriptionRef.changes(value), AsyncResult.initial(true), services)
}

const makeSubRef = <A, R0, E, Out>(
  refAtom: Atom<RefSource<A, R0, E>>,
  read: (get: AtomContext, source: RefSource<A, R0, E>) => Out,
): Writable<Out, A> => {
  function write(ctx: WriteContext<Out>, value: A) {
    const ref = refOf<A, R0, E>(ctx.get(refAtom))
    if (Option.isSome(ref)) {
      Effect.runSync(SubscriptionRef.set(ref.value, value))
    }
  }
  return writable<Out, A>((get) => read(get, get(refAtom)), write)
}

// -----------------------------------------------------------------------------
// constructors - functions
// -----------------------------------------------------------------------------

/**
 * Context passed to `fn` and `fnSync` computations for reading atoms, awaiting results, registering finalizers, refreshing atoms, subscribing to changes, and writing updates.
 *
 * @since 4.0.0
 */
export interface FnContext {
  <A>(atom: Atom<A>): A
  result<A, E>(this: FnContext, atom: Atom<AsyncResult.Result<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): Effect.Effect<A, E>
  addFinalizer(this: FnContext, f: () => void): void
  mount<A>(this: FnContext, atom: Atom<A>): void
  refresh<A>(this: FnContext, atom: Atom<A>): void
  self(this: FnContext): Option.Option<Top>
  setSelf<A>(this: FnContext, a: A): void
  set<R, W>(this: FnContext, atom: Writable<R, W>, value: W): void
  setResult<A, E, W>(this: FnContext, atom: Writable<AsyncResult.Result<A, E>, W>, value: W): Effect.Effect<A, E>
  some<A>(this: FnContext, atom: Atom<Option.Option<A>>): Effect.Effect<A>
  stream<A>(this: FnContext, atom: Atom<A>, options?: {
    readonly withoutInitialValue?: boolean
    readonly bufferSize?: number
  }): Stream.Stream<A>
  streamResult<A, E>(this: FnContext, atom: Atom<AsyncResult.Result<A, E>>, options?: {
    readonly withoutInitialValue?: boolean
    readonly bufferSize?: number
  }): Stream.Stream<A, E>
  subscribe<A>(this: FnContext, atom: Atom<A>, f: (_: A) => void, options?: {
    readonly immediate?: boolean
  }): void
  readonly registry: Registry.RegistryImpl
}

/**
 * Creates a writable atom for a synchronous function; writing an argument re-runs the function, returning `Option.none` before the first call unless an initial value is supplied.
 *
 * @since 4.0.0
 */
export function fnSync<Arg>(): {
  <A>(
    f: (arg: Arg, get: FnContext) => A,
  ): Writable<Option.Option<A>, Arg>
  <A>(
    f: (arg: Arg, get: FnContext) => A,
    options: { readonly initialValue: A },
  ): Writable<A, Arg>
}
export function fnSync<A, Arg = void>(
  f: (arg: Arg, get: FnContext) => A,
): Writable<Option.Option<A>, Arg>
export function fnSync<A, Arg = void>(
  f: (arg: Arg, get: FnContext) => A,
  options: { readonly initialValue: A },
): Writable<A, Arg>
export function fnSync<A, Arg = void>(
  options: { readonly initialValue: A },
): (f: (arg: Arg, get: FnContext) => A) => Writable<A, Arg>
export function fnSync(
  ...args: readonly [
    fOrOptions?: ((arg: Top, get: FnContext) => Top) | { readonly initialValue?: Top },
    options?: { readonly initialValue?: Top },
  ]
): Top {
  const [fOrOptions, options] = args
  return fnSyncFromArgs(fOrOptions, options, args.length)
}

function fnSyncFromArgs(
  fOrOptions: ((arg: Top, get: FnContext) => Top) | { readonly initialValue?: Top } | undefined,
  options: { readonly initialValue?: Top } | undefined,
  argCount: number,
): Top {
  if (argCount === 0) {
    return makeFnSync
  }
  return applyFnSync(fOrOptions, options)
}

function applyFnSync(
  fOrOptions: ((arg: Top, get: FnContext) => Top) | { readonly initialValue?: Top } | undefined,
  options: { readonly initialValue?: Top } | undefined,
): Top {
  return typeof fOrOptions === 'function'
    ? makeFnSync(fOrOptions, options)
    : (f: (arg: Top, get: FnContext) => Top) => makeFnSync(f, fOrOptions)
}

const makeFnSync = <Arg, A>(f: (arg: Arg, get: FnContext) => A, options?: {
  readonly initialValue?: A
}): Writable<Option.Option<A> | A, Arg> => {
  const argAtom = removeTtl(state<[number, Arg | undefined]>([0, undefined]))
  const hasInitialValue = options?.initialValue !== undefined
  return writable(function(get) {
    get.isFn = true
    return readFnSync(get, argAtom, f, fnSyncOptionValue(options), hasInitialValue)
  }, function(ctx, arg: Arg) {
    batch(() => {
      ctx.set(argAtom, [ctx.get(argAtom)[0] + 1, arg])
      ctx.refreshSelf()
    })
  })
}

/**
 * Writable async function atom whose value is an `AsyncResult` and whose writes accept function arguments plus `Reset` and `Interrupt` controls.
 *
 * @since 4.0.0
 */
export interface AtomResultFn<Arg, A, E = never> extends Writable<AsyncResult.Result<A, E>, Arg | Reset | Interrupt> {}

/**
 * Defines the control symbol that can be written to an `AtomResultFn` to reset it to its initial state.
 *
 * **When to use**
 *
 * Use when you need an `AtomResultFn` write value that clears the current async
 * result and returns it to the initial state.
 *
 * @since 4.0.0
 */
export const Reset = Symbol.for('effect/reactivity/atom/Atom/Reset')

/**
 * Type of the `Reset` control symbol accepted by `AtomResultFn` writes.
 *
 * @since 4.0.0
 */
export type Reset = typeof Reset

/**
 * Defines the control symbol that can be written to an `AtomResultFn` to interrupt the current asynchronous computation.
 *
 * **When to use**
 *
 * Use when you need an `AtomResultFn` write value that interrupts the currently
 * running async computation.
 *
 * @since 4.0.0
 */
export const Interrupt = Symbol.for('effect/reactivity/atom/Atom/Interrupt')

/**
 * Type of the `Interrupt` control symbol accepted by `AtomResultFn` writes.
 *
 * @since 4.0.0
 */
export type Interrupt = typeof Interrupt

/**
 * Creates a writable atom for an `Effect` or `Stream` function; writing an argument starts the computation and exposes its state as an `AsyncResult`.
 *
 * @since 4.0.0
 */
export function fn<Arg>(): <E, A>(
  fn: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | Current>,
  options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  },
) => AtomResultFn<Arg, A, E>
export function fn<E, A, Arg = void>(
  fn: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | Current>,
  options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  },
): AtomResultFn<Arg, A, E>
export function fn<Arg>(): <E, A>(
  fn: (arg: Arg, get: FnContext) => Stream.Stream<A, E, Current>,
  options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  },
) => AtomResultFn<Arg, A, E | Cause.NoSuchElementError>
export function fn<E, A, Arg = void>(
  fn: (arg: Arg, get: FnContext) => Stream.Stream<A, E, Current>,
  options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  },
): AtomResultFn<Arg, A, E | Cause.NoSuchElementError>
export function fn<E, A, Arg = void>(
  options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  },
): (fn: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | Current>) => AtomResultFn<Arg, A, E>
export function fn<E, A, Arg = void>(
  options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  },
): (
  fn: (arg: Arg, get: FnContext) => Stream.Stream<A, E, Current>,
) => AtomResultFn<Arg, A, E | Cause.NoSuchElementError>
export function fn(
  ...args: readonly [
    fnOrOptions?:
      | ((
        arg: Top,
        get: FnContext,
      ) => Effect.Effect<Top, Top, Scope.Scope | Current> | Stream.Stream<Top, Top, Current>)
      | {
        readonly initialValue?: Top
        readonly concurrent?: boolean | undefined
      },
    options?: {
      readonly initialValue?: Top
      readonly concurrent?: boolean | undefined
    },
  ]
): Top {
  const [fnOrOptions, options] = args
  return fnFromArgs(fnOrOptions, options, args.length)
}

function fnFromArgs(
  fnOrOptions:
    | ((
      arg: Top,
      get: FnContext,
    ) => Effect.Effect<Top, Top, Scope.Scope | Current> | Stream.Stream<Top, Top, Current>)
    | {
      readonly initialValue?: Top
      readonly concurrent?: boolean | undefined
    }
    | undefined,
  options:
    | {
      readonly initialValue?: Top
      readonly concurrent?: boolean | undefined
    }
    | undefined,
  argCount: number,
): Top {
  if (argCount === 0) {
    return makeFn
  }
  return applyFn(fnOrOptions, options)
}

function applyFn(
  fnOrOptions:
    | ((
      arg: Top,
      get: FnContext,
    ) => Effect.Effect<Top, Top, Scope.Scope | Current> | Stream.Stream<Top, Top, Current>)
    | {
      readonly initialValue?: Top
      readonly concurrent?: boolean | undefined
    }
    | undefined,
  options:
    | {
      readonly initialValue?: Top
      readonly concurrent?: boolean | undefined
    }
    | undefined,
): Top {
  return typeof fnOrOptions === 'function'
    ? makeFn(fnOrOptions, options)
    : (
      f: (
        arg: Top,
        get: FnContext,
      ) => Effect.Effect<Top, Top, Scope.Scope | Current> | Stream.Stream<Top, Top, Current>,
    ) => makeFn(f, fnOrOptions)
}

function makeFn<Arg, E, A>(
  f: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | Current>,
  options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  },
): AtomResultFn<Arg, A, E>
function makeFn<Arg, E, A>(
  f: (arg: Arg, get: FnContext) => Stream.Stream<A, E, Current>,
  options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  },
): AtomResultFn<Arg, A, E | Cause.NoSuchElementError>
function makeFn(
  f: (arg: Top, get: FnContext) =>
    | Effect.Effect<Top, Top, Scope.Scope | Current>
    | Stream.Stream<Top, Top, Current>,
  options?: {
    readonly initialValue?: Top
    readonly concurrent?: boolean | undefined
  },
): AtomResultFn<Top, Top, Top>
function makeFn<Arg, E, A>(
  f: (arg: Arg, get: FnContext) => Stream.Stream<A, E, Current> | Effect.Effect<A, E, Scope.Scope | Current>,
  options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  },
): AtomResultFn<Arg, A, E | Cause.NoSuchElementError> {
  const [read, write] = makeResultFn<Arg, E, A>(f, options)
  return writable<AsyncResult.Result<A, E | Cause.NoSuchElementError>, Arg | Reset | Interrupt>(read, write)
}

function makeResultFn<Arg, E, A, R0 = never>(
  f: (
    arg: Arg,
    get: FnContext,
  ) => Effect.Effect<A, E, Scope.Scope | Current | R0> | Stream.Stream<A, E, Current | R0>,
  options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  },
) {
  const argAtom = removeTtl(state<readonly [number, Option.Option<Arg | Interrupt>]>([0, Option.none()]))
  const initialValue = resultFromOptions<A, E>(options)
  const fibersAtom = resultFnFibersAtom<A, E>(options)

  function read(
    get: AtomContext,
    services?: Context.Context<never>,
  ): AsyncResult.Result<A, E | Cause.NoSuchElementError> {
    get.isFn = true
    return readResultFn(get, argAtom, f, initialValue, fibersAtom, services)
  }
  function write(
    ctx: WriteContext<AsyncResult.Result<A, E | Cause.NoSuchElementError>>,
    arg: Arg | Reset | Interrupt,
  ) {
    batch(() => {
      writeResultFnArg(ctx, argAtom, arg)
      ctx.refreshSelf()
    })
  }
  return [read, write, argAtom] as const
}

/**
 * `AsyncResult` produced by `pull`, containing a non-empty batch of pulled items and a `done` flag, or `NoSuchElementError` when the stream completes without items.
 *
 * @since 4.0.0
 */
export type PullResult<A, E = never> = AsyncResult.Result<{
  readonly done: boolean
  readonly items: Arr.NonEmptyReadonlyArray<A>
}, E | Cause.NoSuchElementError>

/**
 * Creates a writable atom that pulls an initial chunk from a stream and then pulls the next chunk whenever it is written to, accumulating items unless `disableAccumulation` is enabled.
 *
 * @since 4.0.0
 */
export const pull: {
  <A, E>(
    options?: {
      readonly disableAccumulation?: boolean | undefined
    },
  ): (
    create: ((get: AtomContext) => Stream.Stream<A, E, Current>) | Stream.Stream<A, E, Current>,
  ) => Writable<PullResult<A, E>, void>
  <A, E>(
    create: ((get: AtomContext) => Stream.Stream<A, E, Current>) | Stream.Stream<A, E, Current>,
    options?: {
      readonly disableAccumulation?: boolean | undefined
    },
  ): Writable<PullResult<A, E>, void>
} = dual(
  (args) => Stream.isStream(args[0]) || Predicate.isFunction(args[0]),
  <A, E>(
    create: ((get: AtomContext) => Stream.Stream<A, E, Current>) | Stream.Stream<A, E, Current>,
    options?: {
      readonly disableAccumulation?: boolean | undefined
    },
  ): Writable<PullResult<A, E>, void> => {
    const pullSignal = removeTtl(state(0))
    const pullAtom = readable(makeRead((get) => makeStreamPullEffect(get, pullSignal, create, options)))
    return makeStreamPull(pullSignal, pullAtom)
  },
)

const makeStreamPullEffect = <A, E, R0>(
  get: AtomContext,
  pullSignal: Atom<number>,
  create: Stream.Stream<A, E, R0> | ((get: AtomContext) => Stream.Stream<A, E, R0>),
  options?: {
    readonly disableAccumulation?: boolean | undefined
  },
): Effect.Effect<
  { readonly done: boolean; readonly items: Arr.NonEmptyReadonlyArray<A> },
  E | Cause.NoSuchElementError,
  R0 | Scope.Scope | Current
> =>
  Effect.flatMap(
    Stream.toPull(resolveCreate(create, get)),
    (pullChunk) => {
      const fiber = Fiber.getCurrent()
      if (fiber === undefined) {
        return Effect.die(new Error('Atom.pull: no fiber in scope'))
      }
      const services = Context.empty().pipe(
        Context.add(Scope.Scope, Context.getUnsafe(fiber.context, Scope.Scope)),
        Context.add(Current, Context.getUnsafe(fiber.context, Current)),
      )
      let acc: readonly A[] = Arr.empty<A>()
      const pull: Effect.Effect<
        {
          done: boolean
          items: Arr.NonEmptyReadonlyArray<A>
        },
        Cause.NoSuchElementError | E,
        Current
      > = Effect.matchCauseEffect(pullChunk, {
        onFailure(cause): Effect.Effect<
          { done: boolean; items: Arr.NonEmptyReadonlyArray<A> },
          Cause.NoSuchElementError | E
        > {
          return onPullFailure(cause, acc)
        },
        onSuccess(chunk) {
          return onPullSuccess(chunk, acc, options, (next) => {
            acc = next
          }, pull)
        },
      })

      const cancels = new Set<() => void>()
      get.addFinalizer(() => {
        for (const cancel of cancels) cancel()
      })
      get.once(pullSignal)
      get.subscribe(pullSignal, () => {
        get.setSelf(AsyncResult.waitingFrom(Option.none()))
        let cancel: (() => void) | undefined = undefined
        cancel = runCallbackSync(services, pull, (exit) => {
          finishPullCallback(get, cancels, cancel, exit)
        })
        addPullCancel(cancels, cancel)
      })

      return pull
    },
  )

const makeStreamPull = <A, E>(
  pullSignal: Writable<number>,
  pullAtom: Atom<PullResult<A, E>>,
): Writable<PullResult<A, E>, void> =>
  writable(pullAtom.read, function(ctx) {
    ctx.set(pullSignal, ctx.get(pullSignal) + 1)
  })

/**
 * Creates a memoized atom factory that returns the same object for the same argument, using weak references for cached values when the platform supports them.
 *
 * @since 4.0.0
 */
export const family = makeFamily()

/**
 * Uses a fallback `AsyncResult` atom while the primary atom is `Initial`, marking the fallback result as waiting until the primary atom produces a non-initial result.
 *
 * @since 4.0.0
 */
export const withFallback: {
  <E2, A2>(
    fallback: Atom<AsyncResult.Result<A2, E2>>,
  ): <R extends Atom<AsyncResult.Result<Top, Top>>>(
    self: R,
  ) => With<R, AsyncResult.Result<Top, Top> | AsyncResult.Result<A2, E2>>
  <R extends Atom<AsyncResult.Result<Top, Top>>, A2, E2>(
    self: R,
    fallback: Atom<AsyncResult.Result<A2, E2>>,
  ): With<R, AsyncResult.Result<Top, Top> | AsyncResult.Result<A2, E2>>
} = dual(2, <R extends Atom<AsyncResult.Result<Top, Top>>, A2, E2>(
  self: R,
  fallback: Atom<AsyncResult.Result<A2, E2>>,
): Atom<
  AsyncResult.Result<Top, Top> | AsyncResult.Result<A2, E2>
> => {
  function withFallback(get: AtomContext): AsyncResult.Result<Top, Top> | AsyncResult.Result<A2, E2> {
    return readWithFallback(get, self, fallback)
  }
  return copyWithFallback(self, withFallback)
})

const copyAtomWithProto = <A extends object, P extends object>(self: A, patch: P): A & P => {
  const copy = Object.assign({}, self, patch)
  assignCustomPrototype(copy, Reflect.getPrototypeOf(self))
  return copy
}

/**
 * Returns a copy of an atom that remains cached and mounted even when no subscribers are using it.
 *
 * @since 4.0.0
 */
export const keepAlive = <A extends Atom<Top>>(self: A): A =>
  copyAtomWithProto(self, {
    keepAlive: true,
  })

/**
 * Allows a reactive value to be disposed of when it is not in use.
 *
 * **Details**
 *
 * Atoms have this behavior by default, so use this to undo `keepAlive` on a copied atom.
 *
 * @since 4.0.0
 */
export const autoDispose = <A extends Atom<Top>>(self: A): A =>
  copyAtomWithProto(self, {
    keepAlive: false,
  })

/**
 * Sets whether an atom should be lazy.
 *
 * **Details**
 *
 * Lazy atoms defer recomputation while they have no active listeners or active
 * non-lazy dependents, rebuilding the next time their value is observed.
 *
 * @since 4.0.0
 */
export const setLazy: {
  (lazy: boolean): <A extends Atom<Top>>(self: A) => A
  <A extends Atom<Top>>(self: A, lazy: boolean): A
} = dual(2, <A extends Atom<Top>>(self: A, lazy: boolean) =>
  copyAtomWithProto(self, {
    lazy,
  }))

/**
 * Returns a copy of an atom that uses a custom equality function to detect
 * value changes.
 *
 * **Details**
 *
 * When an atom's value is rebuilt or written, the registry compares the new
 * value against the current one to decide whether dependents and listeners
 * should be notified. By default the comparison uses `Object.is`, so a
 * structurally equal but referentially distinct value still triggers
 * notifications. Providing an equality function lets the atom skip updates
 * when the new value is equal to the current one.
 *
 * **Example** (Comparing values structurally)
 *
 * ```ts import.meta.vitest
 * import { Atom } from "effect/unstable/reactivity"
 *
 * const point = Atom.make({ x: 0, y: 0 }).pipe(
 *   Atom.withEquality<{ x: number; y: number }>((a, b) => a.x === b.x && a.y === b.y)
 * )
 * point.equals({ x: 1, y: 2 }, { x: 1, y: 2 }) // => true
 * ```
 *
 * @since 4.0.0
 */
export const withEquality: {
  <T extends Atom<Top>>(equals: (value: Type<T>, next: Type<T>) => boolean): (self: T) => T
  <T extends Atom<Top>>(self: T, equals: (value: Type<T>, next: Type<T>) => boolean): T
} = dual(
  2,
  <T extends Atom<Top>>(self: T, equals: (value: Type<T>, next: Type<T>) => boolean): T =>
    copyAtomWithProto(self, {
      equals,
    }),
)

/**
 * Attaches a diagnostic label to an atom.
 *
 * **Details**
 *
 * The label is used for inspection and debugging metadata and does not change the
 * atom's read or write behavior.
 *
 * @since 4.0.0
 */
export const withLabel: {
  (name: string): <A extends Atom<Top>>(self: A) => A
  <A extends Atom<Top>>(self: A, name: string): A
} = dual<
  (name: string) => <A extends Atom<Top>>(self: A) => A,
  <A extends Atom<Top>>(self: A, name: string) => A
>(2, (self, name) =>
  copyAtomWithProto(self, {
    label: [name, stackLabel()],
  }))

/**
 * Pairs an atom with an initial value for registry initialization.
 *
 * **When to use**
 *
 * Use to preload an atom value when constructing or seeding a registry.
 *
 * **Details**
 *
 * The returned tuple can be supplied to registry initial values so the atom
 * starts with the provided value before it is first rebuilt.
 *
 * @since 4.0.0
 */
export const initialValue: {
  <A>(initialValue: A): (self: Atom<A>) => readonly [Atom<A>, A]
  <A>(self: Atom<A>, initialValue: A): readonly [Atom<A>, A]
} = dual<
  <A>(initialValue: A) => (self: Atom<A>) => readonly [Atom<A>, A],
  <A>(self: Atom<A>, initialValue: A) => readonly [Atom<A>, A]
>(2, (self, initialValue) => [self, initialValue])

/**
 * Maps the value of an atom by reading the source atom, applying the function,
 *
 * **Details**
 *
 * When the source atom is writable, the returned atom remains writable and keeps
 * the source atom's write input type.
 *
 * @since 4.0.0
 */
export const map: {
  <R extends Atom<Top>, B>(
    f: (_: Type<R>) => B,
  ): (self: R) => With<R, B>
  <R extends Atom<Top>, B>(
    self: R,
    f: (_: Type<R>) => B,
  ): With<R, B>
} = dual(
  2,
  <A, B>(self: Atom<A>, f: (_: A) => B): Atom<B> => transform(self, (get) => f(get(self))),
)

/**
 * Maps the successful value inside an `AsyncResult` atom.
 *
 * **Details**
 *
 * Initial and failure states are preserved, and writable source atoms keep their
 * original write input type.
 *
 * @since 4.0.0
 */
const mapResultImpl = (
  self: Atom<Top>,
  f: (value: Top) => Top,
): Atom<AsyncResult.Result<Top, Top>> =>
  transform(self, (get): AsyncResult.Result<Top, Top> => mapResultValue(get(self), f))

type MapResultMapper = (s: Top) => Top
const isMapResultMapper = (arg: unknown): arg is MapResultMapper => typeof arg === 'function'

export function mapResult<R extends Atom<AsyncResult.Result<Top, Top>>, B>(
  f: (_: AsyncResult.Result.Success<Type<R>>) => B,
): (
  self: R,
) => With<R, AsyncResult.Result<B, AsyncResult.Result.Failure<Type<R>>>>
export function mapResult<R extends Atom<AsyncResult.Result<Top, Top>>, B>(
  self: R,
  f: (_: AsyncResult.Result.Success<Type<R>>) => B,
): With<R, AsyncResult.Result<B, AsyncResult.Result.Failure<Type<R>>>>
export function mapResult(
  selfOrF: Top,
  f?: Top,
): Top {
  if (arguments.length >= 2) {
    return mapResultBinary(selfOrF, f)
  }
  return mapResultCurried(selfOrF)
}

/**
 * Creates an atom that publishes source changes only after the source has stopped
 * changing for the specified duration.
 *
 * **Details**
 *
 * The current source value is used immediately, and any pending debounce timer is
 * cleared when the derived atom is disposed.
 *
 * @since 4.0.0
 */
export const debounce: {
  (duration: Duration.Input): <A extends Atom<Top>>(self: A) => WithoutSerializable<A>
  <A extends Atom<Top>>(self: A, duration: Duration.Input): WithoutSerializable<A>
} = dual(
  2,
  <A>(self: Atom<A>, duration: Duration.Input): Atom<A> => {
    const millis = Duration.toMillis(Duration.fromInputUnsafe(duration))
    return transform(self, function(get) {
      let timeout: (() => void) | undefined
      let value = get.once(self)
      function update() {
        timeout = undefined
        get.setSelf(value)
      }
      get.addFinalizer(function() {
        if (timeout !== undefined) timeout()
      })
      get.subscribe(self, function(val) {
        value = val
        timeout?.()
        timeout = get.registry.scheduleTimer(update, millis)
      })
      return value
    }, { initialValueTarget: self })
  },
)

/**
 * Creates a derived atom that reads the source and schedules a refresh after the
 * specified duration.
 *
 * **Details**
 *
 * The scheduled refresh is canceled when the derived atom's lifetime is disposed.
 *
 * @since 4.0.0
 */
export const withRefresh: {
  (duration: Duration.Input): <A extends Atom<Top>>(self: A) => WithoutSerializable<A>
  <A extends Atom<Top>>(self: A, duration: Duration.Input): WithoutSerializable<A>
} = dual(
  2,
  <A>(self: Atom<A>, duration: Duration.Input): Atom<A> => {
    const millis = Duration.toMillis(Duration.fromInputUnsafe(duration))
    return transform(self, function(get) {
      const fiber = Effect.runFork(Effect.sleep(millis).pipe(Effect.andThen(Effect.sync(() => get.refresh(self)))))
      get.addFinalizer(() => fiber.interruptUnsafe())
      return get(self)
    }, { initialValueTarget: self })
  },
)

/**
 * Adds stale-while-revalidate refresh behavior to an async result atom.
 *
 * **Details**
 *
 * Automatic revalidation during reads is skipped while the current value is
 * fresh within `staleTime`. Manual `refresh` calls remain forceful and always
 * forward to the wrapped atom. Use `revalidateOnMount` to control whether stale data should trigger a
 * background refresh on first mount. Use `revalidateOnFocus` to control
 * focus behavior. `true` respects `staleTime` and `"always"` forces refetch.
 *
 * @since 4.0.0
 */
export const swr: {
  (
    options: {
      readonly staleTime: Duration.Input
      readonly revalidateOnMount?: boolean | undefined
      readonly revalidateOnFocus?: boolean | 'always' | undefined
      readonly focusSignal?: Atom<Top> | undefined
    },
  ): <R extends Atom<AsyncResult.Result<Top, Top>>>(self: R) => WithoutSerializable<R>
  <R extends Atom<AsyncResult.Result<Top, Top>>>(
    self: R,
    options: {
      readonly staleTime: Duration.Input
      readonly revalidateOnMount?: boolean | undefined
      readonly revalidateOnFocus?: boolean | 'always' | undefined
      readonly focusSignal?: Atom<Top> | undefined
    },
  ): WithoutSerializable<R>
} = dual(
  2,
  <A, E>(
    self: Atom<AsyncResult.Result<A, E>>,
    options: {
      readonly staleTime: Duration.Input
      readonly revalidateOnMount?: boolean | undefined
      readonly revalidateOnFocus?: boolean | 'always' | undefined
      readonly focusSignal?: Atom<Top> | undefined
    },
  ): Atom<AsyncResult.Result<A, E>> => {
    const staleTime = Duration.toMillis(Duration.fromInputUnsafe(options.staleTime))
    return transform(self, (get) => readSwr(get, self, options, staleTime), { initialValueTarget: self })
  },
)

const swrTimestamp = <A, E>(result: AsyncResult.Result<A, E>): Option.Option<number> => {
  if (AsyncResult.isSuccess(result)) {
    return Option.some(result.timestamp)
  }
  return swrFailureTimestamp(result)
}

const isFreshWithin = (timestamp: number, staleTime: number, now: number): boolean => now - timestamp < staleTime

const shouldRevalidateSWR = <A, E>(
  result: AsyncResult.Result<A, E>,
  staleTime: number,
  now: number,
): boolean => {
  if (result.waiting) {
    return false
  }
  return shouldRevalidateSettledSWR(result, staleTime, now)
}

/**
 * Wraps an atom in a writable optimistic atom.
 *
 * **Details**
 *
 * Writes accept transition atoms containing `AsyncResult` values. Waiting
 * successes are shown optimistically while transitions run; when successful
 * transitions finish, the source atom is refreshed, and failures roll the value
 * back to the latest source value.
 *
 * @since 4.0.0
 */
export const optimistic = <A>(self: Atom<A>): Writable<A, Atom<AsyncResult.Result<A, Top>>> => {
  let counter = 0
  const writeAtom = removeTtl(state<readonly [number, Atom<AsyncResult.Result<A, Top>> | undefined]>(
    [counter, undefined] as const,
  ))
  return writable(
    (get) => readOptimistic(get, self, writeAtom),
    (ctx, atom) => ctx.set(writeAtom, [++counter, atom]),
    (refresh) => refresh(self),
  )
}

/**
 * Creates an `AtomResultFn` that applies an optimistic update before running the
 * underlying mutation.
 *
 * **Details**
 *
 * The reducer computes the provisional value from the current value and mutation
 * input. The wrapped function result then completes the transition or updates the
 * optimistic value through the provided setter callback.
 *
 * @since 4.0.0
 */
export const optimisticFn: {
  <A, W, XA, XE, OW = void>(
    options: {
      readonly reducer: (current: NoInfer<A>, update: OW) => NoInfer<W>
      readonly fn:
        | AtomResultFn<OW, XA, XE>
        | ((set: (result: NoInfer<W>) => void) => AtomResultFn<OW, XA, XE>)
    },
  ): (
    self: Writable<A, Atom<AsyncResult.Result<W, Top>>>,
  ) => AtomResultFn<OW, XA, XE>
  <A, W, XA, XE, OW = void>(
    self: Writable<A, Atom<AsyncResult.Result<W, Top>>>,
    options: {
      readonly reducer: (current: NoInfer<A>, update: OW) => NoInfer<W>
      readonly fn:
        | AtomResultFn<OW, XA, XE>
        | ((set: (result: NoInfer<W>) => void) => AtomResultFn<OW, XA, XE>)
    },
  ): AtomResultFn<OW, XA, XE>
} = dual(2, <A, W, XA, XE, OW = void>(
  self: Writable<A, Atom<AsyncResult.Result<W, Top>>>,
  options: {
    readonly reducer: (current: NoInfer<A>, update: OW) => NoInfer<W>
    readonly fn:
      | AtomResultFn<OW, XA, XE>
      | ((set: (result: NoInfer<W>) => void) => AtomResultFn<OW, XA, XE>)
  },
): AtomResultFn<OW, XA, XE> => {
  const transition = removeTtl(AsyncResult.initial<W, Top>().pipe(state<AsyncResult.Result<W, Top>>))
  return fn((arg: OW, get) => runOptimisticFn(self, options, transition, arg, get))
})

/**
 * Runs synchronous atom updates as a batch.
 *
 * **Details**
 *
 * Stale nodes are rebuilt and listeners are notified after the callback completes,
 * so dependent updates observe the final batched state.
 *
 * @since 4.0.0
 */
export const batch: (f: () => void) => void = Registry.batch

// -----------------------------------------------------------------------------
// KeyValueStore
// -----------------------------------------------------------------------------
/**
 * Creates a writable atom backed by a `KeyValueStore` entry.
 *
 * **Details**
 *
 * Values are encoded and decoded with the supplied schema. In sync mode the atom
 * exposes the decoded value and writes the default value when the key is missing;
 * in async mode it exposes an `AsyncResult` of the decoded value.
 *
 * **Gotchas**
 *
 * Error surfacing differs by mode. Async mode reports a failed store read as an
 * `AsyncResult.failure`; sync mode has no error channel on its bare value, so a
 * failed read renders the default value instead. Writes are optimistic in both
 * modes: the value is shown immediately and the store write is fired in the
 * background, so a write the store later refuses is not reflected in the atom.
 * Use async mode when store failures must be observable.
 *
 * @since 4.0.0
 */
export function kvs<S extends Schema.ConstraintCodec<Top, Top>, const Mode extends 'sync' | 'async' = never>(
  options: {
    readonly runtime: AtomRuntime<KeyValueStore.KeyValueStore, Top>
    readonly key: string
    readonly schema: S
    readonly defaultValue: LazyArg<S['Type']>
    readonly mode?: Mode | undefined
  },
): Writable<'async' extends Mode ? AsyncResult.Result<S['Type']> : S['Type'], S['Type']>
export function kvs<S extends Schema.ConstraintCodec<Top, Top>, const Mode extends 'sync' | 'async' = never>(
  options: {
    readonly runtime: AtomRuntime<KeyValueStore.KeyValueStore, Top>
    readonly key: string
    readonly schema: S
    readonly defaultValue: LazyArg<S['Type']>
    readonly mode?: Mode | undefined
  },
): Writable<AsyncResult.Result<S['Type']> | S['Type'], S['Type']> {
  const setAtom = options.runtime.fn(
    (value: S['Type']) =>
      KeyValueStore.KeyValueStore.use((store) =>
        KeyValueStore.toSchemaStore(store, options.schema).set(options.key, value)
      ),
  )
  const resultAtom = options.runtime.atom(
    KeyValueStore.KeyValueStore.use((store) => KeyValueStore.toSchemaStore(store, options.schema).get(options.key)),
  )
  let written = false
  return writable(
    (get): AsyncResult.Result<S['Type']> | S['Type'] =>
      readKvs(get, options, setAtom, resultAtom, () => written, (next) => {
        written = next
      }),
    (ctx, value: S['Type']) => {
      written = true
      writeKvs(ctx, options, setAtom, value)
    },
  )
}

// -----------------------------------------------------------------------------
// conversions
// -----------------------------------------------------------------------------

/**
 * Converts an atom into a stream using the `Current` service.
 *
 * **Details**
 *
 * The stream emits the atom's current value immediately and then emits subsequent
 * changes until the stream scope is closed.
 *
 * @since 4.0.0
 */
export const toStream = <A>(self: Atom<A>): Stream.Stream<A, never, Current> =>
  Stream.unwrap(Current.use((r) => Effect.succeed(Registry.toStream(r, self))))

/**
 * Converts an `AsyncResult` atom into a stream using the `Current` service.
 *
 * **Details**
 *
 * Initial results are skipped, successes are emitted as stream values, and
 * failures fail the stream with the result cause.
 *
 * @since 4.0.0
 */
export const toStreamResult = <A, E>(self: Atom<AsyncResult.Result<A, E>>): Stream.Stream<A, E, Current> =>
  Stream.unwrap(Current.use((r) => Effect.succeed(Registry.toStreamResult(r, self))))

/**
 * Reads an atom's current value from the `Current` service.
 *
 * @since 4.0.0
 */
export const get = <A>(self: Atom<A>): Effect.Effect<A, never, Current> =>
  Current.use((r) => Effect.succeed(Registry.get(r, self)))

/**
 * Reads a writable atom, computes a return value and next write value, writes the
 * next value, and returns the computed result.
 *
 * @since 4.0.0
 */
export const modify: {
  <R, W, A>(
    f: (_: R) => [A, W],
  ): (self: Writable<R, W>) => Effect.Effect<A, never, Current>
  <R, W, A>(self: Writable<R, W>, f: (_: R) => [A, W]): Effect.Effect<A, never, Current>
} = dual(
  2,
  <R, W, A>(self: Writable<R, W>, f: (_: R) => [returnValue: A, nextValue: W]): Effect.Effect<A, never, Current> =>
    Effect.map(Current, (r) => Registry.modify(r, self, f)),
)

/**
 * Writes a value to a writable atom through the `Current` service.
 *
 * @since 4.0.0
 */
export const set: {
  <W>(value: W): <R>(self: Writable<R, W>) => Effect.Effect<void, never, Current>
  <R, W>(self: Writable<R, W>, value: W): Effect.Effect<void, never, Current>
} = dual(
  2,
  <R, W>(self: Writable<R, W>, value: W): Effect.Effect<void, never, Current> =>
    Effect.map(Current, (r) => Registry.set(r, self, value)),
)

/**
 * Updates a writable atom by reading its current value from the registry and
 * writing the value returned by the update function.
 *
 * @since 4.0.0
 */
export const update: {
  <R, W>(f: (_: R) => W): (self: Writable<R, W>) => Effect.Effect<void, never, Current>
  <R, W>(self: Writable<R, W>, f: (_: R) => W): Effect.Effect<void, never, Current>
} = dual(
  2,
  <R, W>(self: Writable<R, W>, f: (_: R) => W): Effect.Effect<void, never, Current> =>
    Effect.map(Current, (r) => Registry.update(r, self, f)),
)

/**
 * Reads an `AsyncResult` atom as an effect through the `Current` service.
 *
 * **Details**
 *
 * The effect waits while the result is `Initial`, and also while it is waiting
 * when `suspendOnWaiting` is enabled. Successes succeed with the value and
 * failures fail with the result cause.
 *
 * @since 4.0.0
 */
export const getResult: {
  <A, E>(
    self: Atom<AsyncResult.Result<A, E>>,
    options?: { readonly suspendOnWaiting?: boolean | undefined },
  ): Effect.Effect<A, E, Current>
  <A, E>(
    options?: { readonly suspendOnWaiting?: boolean | undefined },
  ): (self: Atom<AsyncResult.Result<A, E>>) => Effect.Effect<A, E, Current>
} = dual(
  (args) => isAtom(args[0]),
  <A, E>(
    self: Atom<AsyncResult.Result<A, E>>,
    options?: { readonly suspendOnWaiting?: boolean | undefined },
  ): Effect.Effect<A, E, Current> => Current.use(Registry.getResult(self, options)),
)

/**
 * Runs a refresh request for an atom through the `Current` service.
 *
 * **When to use**
 *
 * Use to invalidate and recompute an atom from an Effect that has access to the
 * active registry.
 *
 * @since 4.0.0
 */
export const refresh = <A>(self: Atom<A>): Effect.Effect<void, never, Current> =>
  Effect.map(Current, (r) => Registry.refresh(r, self))

/**
 * Mounts an atom in the registry for the lifetime of the current scope.
 *
 * **Details**
 *
 * Mounting keeps the atom subscribed with a no-op listener until the scope
 * finalizer releases it.
 *
 * @since 4.0.0
 */
export const mount = <A>(self: Atom<A>): Effect.Effect<void, never, Current | Scope.Scope> =>
  Current.use((r) => Registry.mount(r, self))

// -----------------------------------------------------------------------------
// Serializable
// -----------------------------------------------------------------------------

/**
 * The type id used to mark atoms that carry serialization metadata.
 *
 * @since 4.0.0
 */
export const SerializableTypeId: SerializableTypeId = '~effect-atom/atom/Atom/Serializable'

/**
 * The literal type of the serializable atom marker.
 *
 * @since 4.0.0
 */
export type SerializableTypeId = '~effect-atom/atom/Atom/Serializable'

/**
 * Serialization metadata attached to an atom.
 *
 * **Details**
 *
 * The key identifies the atom in dehydrated state, and the encode/decode
 * functions convert between the atom value and the schema encoded value.
 *
 * @since 4.0.0
 */
export type SerializableJson =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<SerializableJson>
  | { readonly [key: string]: SerializableJson }

export interface Serializable<S extends Schema.Constraint> {
  readonly [SerializableTypeId]: {
    readonly key: string
    readonly codecJson: Schema.toCodecJson<S>
  }
}

/**
 * Returns `true` when an atom carries `Serializable` metadata.
 *
 * @since 4.0.0
 */
export const isSerializable = (self: Atom<unknown>): self is Atom<Top> & Serializable<Schema.Unknown> =>
  SerializableTypeId in self

/**
 * Attaches serialization metadata to an atom using a schema and stable key.
 *
 * **Details**
 *
 * The schema is converted to a JSON codec used to encode values when a
 * registry is dehydrated and to decode them when one is hydrated; values that
 * fail either direction are recorded as refusals on the registry.
 *
 * @since 4.0.0
 */
export const serializable: {
  <R extends Atom<Top>, S extends Schema.Constraint>(options: {
    readonly key: string
    readonly schema: S
  }): (self: R) => R & Serializable<S>
  <R extends Atom<Top>, S extends Schema.Constraint>(self: R, options: {
    readonly key: string
    readonly schema: S
  }): R & Serializable<S>
} = dual(2, <R extends Atom<Top>, A, I>(self: R, options: {
  readonly key: string
  readonly schema: Schema.ConstraintCodec<A, I>
}): R & Serializable<Schema.ConstraintCodec<A, I>> => {
  const codecJson = Schema.toCodecJson(options.schema)
  return copyAtomWithProto(self, {
    label: serializableLabel(self, options.key),
    [SerializableTypeId]: {
      key: options.key,
      codecJson,
    },
  })
})

export { makeRefreshOnSignal, refreshOnWindowFocus, searchParam, windowFocusSignal } from './Browser.js'
export { getServerValue, ServerValueTypeId, withServerValue, withServerValueInitial } from './Server.js'
export type { ServerValue } from './Server.js'
