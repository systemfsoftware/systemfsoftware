/**
 * Reactive state primitives for values managed by an `AtomRegistry`.
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
  writable,
  WritableTypeId,
} from './internal/core.js'
export {
  isAtom,
  isWritable,
  readable,
  setIdleTTL,
  transform,
  TypeId,
  writable,
  WritableTypeId,
} from './internal/core.js'
import * as Result from 'effect/Result'
import { AtomRegistry } from './Registry.js'
import * as Registry from './Registry.js'
import * as AsyncResult from './Result.js'

/**
 * Reactive value read by an `AtomRegistry`, with metadata controlling caching, laziness, refresh behavior, and initial value targeting.
 *
 * @category models
 * @since 4.0.0
 */
export interface Atom<A> extends Pipeable, Inspectable {
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

/**
 * Extracts the value type produced by an `Atom`.
 *
 * @category utility types
 * @since 4.0.0
 */
export type Type<T extends Atom<unknown>> = T extends Atom<infer A> ? A : never

/**
 * Extracts the success value type from an atom whose value is an `AsyncResult`.
 *
 * @category utility types
 * @since 4.0.0
 */
export type Success<T extends Atom<unknown>> = T extends Atom<AsyncResult.Result<infer A, infer _>> ? A : never

/**
 * Extracts the item type from an atom whose value is a `PullResult`.
 *
 * @category utility types
 * @since 4.0.0
 */
export type PullSuccess<T extends Atom<unknown>> = T extends Atom<PullResult<infer A, infer _>> ? A : never

/**
 * Extracts the failure error type from an atom whose value is an `AsyncResult`.
 *
 * @category utility types
 * @since 4.0.0
 */
export type Failure<T extends Atom<unknown>> = T extends Atom<AsyncResult.Result<infer _, infer E>> ? E : never

/**
 * Returns an atom type without serializable metadata, preserving `Writable` read and write types when the input atom is writable.
 *
 * @category utility types
 * @since 4.0.0
 */
export type WithoutSerializable<T extends Atom<unknown>> = T extends Writable<infer R, infer W> ? Writable<R, W>
  : Atom<Type<T>>

/**
 * Atom that can also be written to, using a `WriteContext` and an input value to update reactive state.
 *
 * @category models
 * @since 4.0.0
 */
export interface Writable<R, W = R> extends Atom<R> {
  readonly [WritableTypeId]: WritableTypeId
  readonly write: (ctx: WriteContext<R>, value: W) => void
}

/**
 * Context passed to atom read functions for reading dependencies, awaiting `AsyncResult` or `Option` values, managing subscriptions and finalizers, refreshing atoms, and updating writable atoms.
 *
 * @category context
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
  readonly registry: Registry.Registry
}

/**
 * Context passed to writable atom write functions for reading atoms, refreshing or setting the current atom, and writing to other writable atoms.
 *
 * @category context
 * @since 4.0.0
 */
export interface WriteContext<A> {
  get<T>(this: WriteContext<A>, atom: Atom<T>): T
  refreshSelf(this: WriteContext<A>): void
  setSelf(this: WriteContext<A>, a: A): void
  set<R, W>(this: WriteContext<A>, atom: Writable<R, W>, value: W): void
}

type FnOptions = {
  readonly initialValue?: unknown
  readonly reactivityKeys?: readonly unknown[] | ReadonlyRecord<string, readonly unknown[]> | undefined
  readonly concurrent?: boolean | undefined
}

function runtimeFn<R, ER>(
  this: AtomRuntime<R, ER>,
): (arg: unknown, options?: FnOptions) => AtomResultFn<unknown, unknown, unknown>
function runtimeFn<R, ER>(
  this: AtomRuntime<R, ER>,
  arg: unknown,
  options?: FnOptions,
): AtomResultFn<unknown, unknown, unknown>
function runtimeFn<R, ER>(
  this: AtomRuntime<R, ER>,
  arg?: unknown,
  options?: FnOptions,
): unknown {
  if (arguments.length === 0) {
    return (arg: unknown, options?: FnOptions): AtomResultFn<unknown, unknown, unknown> =>
      makeFnRuntime(this, arg, options)
  }
  return makeFnRuntime(this, arg, options)
}

const RuntimeProto: {
  atom: {
    <R, ER, A, E>(
      this: AtomRuntime<R, ER>,
      create: (get: AtomContext) => Effect.Effect<A, E, Scope.Scope | R | AtomRegistry | Reactivity.Reactivity>,
      options?: {
        readonly initialValue?: A
        readonly uninterruptible?: boolean | undefined
      },
    ): Atom<AsyncResult.Result<A, E | ER>>
    <R, ER, A, E>(
      this: AtomRuntime<R, ER>,
      effect: Effect.Effect<A, E, Scope.Scope | R | AtomRegistry | Reactivity.Reactivity>,
      options?: {
        readonly initialValue?: A
        readonly uninterruptible?: boolean | undefined
      },
    ): Atom<AsyncResult.Result<A, E | ER>>
    <R, ER, A, E>(
      this: AtomRuntime<R, ER>,
      create: (get: AtomContext) => Stream.Stream<A, E, AtomRegistry | Reactivity.Reactivity | R>,
      options?: {
        readonly initialValue?: A
      },
    ): Atom<AsyncResult.Result<A, E | ER | Cause.NoSuchElementError>>
    <R, ER, A, E>(
      this: AtomRuntime<R, ER>,
      stream: Stream.Stream<A, E, AtomRegistry | Reactivity.Reactivity | R>,
      options?: {
        readonly initialValue?: A
      },
    ): Atom<AsyncResult.Result<A, E | ER | Cause.NoSuchElementError>>
  }
  fn: {
    <R, ER, Arg>(
      this: AtomRuntime<R, ER>,
    ): (arg: Arg, options?: FnOptions) => AtomResultFn<Arg, unknown, unknown>
    <R, ER>(
      this: AtomRuntime<R, ER>,
      arg: unknown,
      options?: FnOptions,
    ): AtomResultFn<unknown, unknown, unknown>
  }
  pull: <R, ER, A, E>(
    this: AtomRuntime<R, ER>,
    create:
      | ((get: AtomContext) => Stream.Stream<A, E, R | AtomRegistry | Reactivity.Reactivity>)
      | Stream.Stream<A, E, R | AtomRegistry | Reactivity.Reactivity>,
    options?: {
      readonly disableAccumulation?: boolean
      readonly initialValue?: readonly A[]
    },
  ) => Writable<PullResult<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>, void>
  subscriptionRef: <R, ER, A, E>(
    this: AtomRuntime<R, ER>,
    create:
      | Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | R | AtomRegistry | Reactivity.Reactivity>
      | ((get: AtomContext) => Effect.Effect<
        SubscriptionRef.SubscriptionRef<A>,
        E,
        Scope.Scope | R | AtomRegistry | Reactivity.Reactivity
      >),
  ) => Writable<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>, A>
} = {
  ...AtomProto,
  atom<R, ER, A, E>(
    this: AtomRuntime<R, ER>,
    arg:
      | ((get: AtomContext) => Effect.Effect<A, E, Scope.Scope | R | AtomRegistry | Reactivity.Reactivity>)
      | Effect.Effect<A, E, Scope.Scope | R | AtomRegistry | Reactivity.Reactivity>
      | ((get: AtomContext) => Stream.Stream<A, E, AtomRegistry | Reactivity.Reactivity | R>)
      | Stream.Stream<A, E, AtomRegistry | Reactivity.Reactivity | R>,
    options?: {
      readonly initialValue?: A
      readonly uninterruptible?: boolean | undefined
    },
  ): Atom<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>> {
    return readable<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>>((get) => {
      const previous = get.self<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>>()
      const runtimeResult = get(this)
      if (AsyncResult.isSuccess(runtimeResult)) {
        const services = runtimeResult.value
        const value = typeof arg === 'function' ? arg(get) : arg
        if (Effect.isEffect(value)) {
          return effect(get, value, options, services)
        }
        return stream(get, value, options, services)
      }
      return AsyncResult.replacePrevious(runtimeResult, previous)
    })
  },

  fn: runtimeFn,

  pull<R, ER, A, E>(
    this: AtomRuntime<R, ER>,
    create:
      | ((get: AtomContext) => Stream.Stream<A, E, AtomRegistry | Reactivity.Reactivity | R>)
      | Stream.Stream<A, E, AtomRegistry | Reactivity.Reactivity | R>,
    options?: {
      readonly disableAccumulation?: boolean
      readonly initialValue?: readonly A[]
    },
  ): Writable<PullResult<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>, void> {
    const pullSignal = removeTtl(state(0))
    const pullAtom = readable<PullResult<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>>((get) => {
      const previous = get.self<PullResult<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>>()
      const runtime = get(this)
      if (AsyncResult.isSuccess(runtime)) {
        const services = runtime.value
        const value = typeof create === 'function' ? create(get) : create
        return makeEffect(
          get,
          makeStreamPullEffect(get, pullSignal, value, options),
          AsyncResult.initial(true),
          services,
          false,
        )
      }
      return AsyncResult.replacePrevious(runtime, previous)
    })
    return makeStreamPull(pullSignal, pullAtom)
  },

  subscriptionRef<R, ER, A, E>(
    this: AtomRuntime<R, ER>,
    create:
      | Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | R | AtomRegistry | Reactivity.Reactivity>
      | ((
        get: AtomContext,
      ) => Effect.Effect<
        SubscriptionRef.SubscriptionRef<A>,
        E,
        Scope.Scope | R | AtomRegistry | Reactivity.Reactivity
      >),
  ): Writable<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>, A> {
    const refAtom = removeTtl(readable<
      | SubscriptionRef.SubscriptionRef<A>
      | AsyncResult.Result<SubscriptionRef.SubscriptionRef<A> | Context.Context<R>, E | ER>
    >((get) => {
      const previous = get.self<
        AsyncResult.Result<SubscriptionRef.SubscriptionRef<A> | Context.Context<R>, E | ER>
      >()
      const runtimeResult = get(this)
      if (AsyncResult.isSuccess(runtimeResult)) {
        const services = runtimeResult.value
        const value = typeof create === 'function' ? create(get) : create
        return makeEffect(get, value, AsyncResult.initial(true), services, false)
      }
      return AsyncResult.replacePrevious(runtimeResult, previous)
    }))
    return makeSubRef(
      refAtom,
      (get, ref) => {
        if (AsyncResult.isResult(ref) && !AsyncResult.isSuccess(ref)) {
          // The runtime failed or is still starting, and `ref` already carries
          // that state. Reporting it needs no services, so they are demanded
          // below - asking for them here throws instead of answering.
          return readRefResult(get, ref)
        }
        const runtime = AsyncResult.getOrThrow(get(this))
        return AsyncResult.isResult(ref)
          ? readRefResult(get, ref, runtime)
          : AsyncResult.success(readRefDirect(get, ref, runtime))
      },
    )
  },
}

const makeFnRuntime = <R, ER>(
  self: AtomRuntime<R, ER>,
  arg: unknown,
  options?: {
    readonly initialValue?: unknown
    readonly reactivityKeys?: readonly unknown[] | ReadonlyRecord<string, readonly unknown[]> | undefined
  },
) => {
  const isFnArg = (
    u: unknown,
  ): u is (
    a: unknown,
    get: FnContext,
  ) =>
    | Effect.Effect<unknown, unknown, Scope.Scope | R | AtomRegistry | Reactivity.Reactivity>
    | Stream.Stream<unknown, unknown, AtomRegistry | Reactivity.Reactivity> => typeof u === 'function'
  const f: (
    a: unknown,
    get: FnContext,
  ) =>
    | Effect.Effect<unknown, unknown, Scope.Scope | R | AtomRegistry | Reactivity.Reactivity>
    | Stream.Stream<unknown, unknown, AtomRegistry | Reactivity.Reactivity> = (a, get) => {
      if (!isFnArg(arg)) {
        throw new Error('AtomRuntime.fn expects a function argument')
      }
      return arg(a, get)
    }
  const [read, write, argAtom] = makeResultFn<unknown, unknown, unknown, R | Reactivity.Reactivity>(
    options?.reactivityKeys
      ? (a, get) => {
        const eff = f(a, get)
        return Effect.isEffect(eff)
          ? Reactivity.mutation(eff, options.reactivityKeys ?? [])
          : Stream.ensuring(eff, Reactivity.invalidate(options.reactivityKeys ?? []))
      }
      : f,
    options,
  )
  return writable<AsyncResult.Result<unknown, unknown>, unknown>((get) => {
    const previous = get.self<AsyncResult.Result<unknown, unknown>>()
    get.get(argAtom)
    const runtimeResult = get.get(self)
    if (AsyncResult.isSuccess(runtimeResult)) {
      return read(get, runtimeResult.value)
    }
    return AsyncResult.replacePrevious(runtimeResult, previous)
  }, write)
}

function constSetSelf<A>(ctx: WriteContext<A>, value: A) {
  ctx.setSelf(value)
}

// -----------------------------------------------------------------------------
// constructors
// -----------------------------------------------------------------------------

/**
 * Creates an atom from a synchronous value or read function, or from an `Effect` or `Stream` whose state is exposed as an `AsyncResult`; plain values create writable state atoms.
 *
 * @category constructors
 * @since 4.0.0
 */
export function make<A, E>(
  create: (get: AtomContext) => Effect.Effect<A, E, Scope.Scope | AtomRegistry>,
  options?: {
    readonly initialValue?: A | undefined
    readonly uninterruptible?: boolean | undefined
  },
): Atom<AsyncResult.Result<A, E>>
export function make<A, E>(
  effect: Effect.Effect<A, E, Scope.Scope | AtomRegistry>,
  options?: {
    readonly initialValue?: A
    readonly uninterruptible?: boolean | undefined
  },
): Atom<AsyncResult.Result<A, E>>
export function make<A, E>(
  create: (get: AtomContext) => Stream.Stream<A, E, AtomRegistry>,
  options?: {
    readonly initialValue?: A
  },
): Atom<AsyncResult.Result<A, E | Cause.NoSuchElementError>>
export function make<A, E>(
  stream: Stream.Stream<A, E, AtomRegistry>,
  options?: {
    readonly initialValue?: A
  },
): Atom<AsyncResult.Result<A, E | Cause.NoSuchElementError>>
export function make<A>(create: (get: AtomContext) => A): Atom<A>
export function make<A>(initialValue: A): Writable<A>
export function make<A, E>(
  arg:
    | Effect.Effect<A, E, Scope.Scope | AtomRegistry>
    | ((get: AtomContext) => Effect.Effect<A, E, Scope.Scope | AtomRegistry>)
    | Stream.Stream<A, E, AtomRegistry>
    | ((get: AtomContext) => Stream.Stream<A, E, AtomRegistry>)
    | ((get: AtomContext) => A)
    | A,
  options?: {
    readonly initialValue?: unknown
    readonly uninterruptible?: boolean | undefined
  },
): Atom<unknown> | Writable<unknown> {
  let readOrAtom: ((get: AtomContext, services?: Context.Context<never>) => unknown) | Writable<A>
  if (Effect.isEffect(arg)) {
    readOrAtom = function(get: AtomContext, providedServices?: Context.Context<never>) {
      return effect(get, arg, options, providedServices)
    }
  } else if (Stream.isStream(arg)) {
    readOrAtom = function(get: AtomContext, providedServices?: Context.Context<never>) {
      return stream(get, arg, options, providedServices)
    }
  } else if (typeof arg === 'function') {
    readOrAtom = function(get: AtomContext, providedServices?: Context.Context<never>) {
      const value: unknown = Reflect.apply(arg, undefined, [get, providedServices])
      if (Effect.isEffect(value)) {
        return effect(get, value, options, providedServices)
      } else if (Stream.isStream(value)) {
        return stream(get, value, options, providedServices)
      }
      return value
    }
  } else {
    readOrAtom = state(arg)
  }
  if (isAtom(readOrAtom)) {
    return readOrAtom
  }
  return readable(readOrAtom)
}

// -----------------------------------------------------------------------------
// constructors - effect
// -----------------------------------------------------------------------------

export function makeRead<A, E>(
  effect: Effect.Effect<A, E, Scope.Scope | AtomRegistry>,
  options?: {
    readonly initialValue?: A
    readonly uninterruptible?: boolean | undefined
  },
): (get: AtomContext, services?: Context.Context<never>) => AsyncResult.Result<A, E>
export function makeRead<A, E>(
  create: (get: AtomContext) => Effect.Effect<A, E, Scope.Scope | AtomRegistry>,
  options?: {
    readonly initialValue?: A
    readonly uninterruptible?: boolean | undefined
  },
): (get: AtomContext, services?: Context.Context<never>) => AsyncResult.Result<A, E>
export function makeRead<A, E>(
  stream: Stream.Stream<A, E, AtomRegistry>,
  options?: {
    readonly initialValue?: A
    readonly uninterruptible?: boolean | undefined
  },
): (get: AtomContext, services?: Context.Context<never>) => AsyncResult.Result<A, E | Cause.NoSuchElementError>
export function makeRead<A, E>(
  create: (get: AtomContext) => Stream.Stream<A, E, AtomRegistry>,
  options?: {
    readonly initialValue?: A
    readonly uninterruptible?: boolean | undefined
  },
): (get: AtomContext, services?: Context.Context<never>) => AsyncResult.Result<A, E | Cause.NoSuchElementError>
export function makeRead<A>(
  create: (get: AtomContext) => A,
): (get: AtomContext, services?: Context.Context<never>) => A
export function makeRead<A>(initialValue: A): Writable<A>
export function makeRead<A, E>(
  arg:
    | Effect.Effect<A, E, Scope.Scope | AtomRegistry>
    | ((get: AtomContext) => Effect.Effect<A, E, Scope.Scope | AtomRegistry>)
    | Stream.Stream<A, E, AtomRegistry>
    | ((get: AtomContext) => Stream.Stream<A, E, AtomRegistry>)
    | ((get: AtomContext) => A)
    | A,
  options?: {
    readonly initialValue?: unknown
    readonly uninterruptible?: boolean | undefined
  },
): ((get: AtomContext, services?: Context.Context<never>) => unknown) | Writable<A> {
  if (Effect.isEffect(arg)) {
    return function(get: AtomContext, providedServices?: Context.Context<never>) {
      return effect(get, arg, options, providedServices)
    }
  } else if (Stream.isStream(arg)) {
    return function(get: AtomContext, providedServices?: Context.Context<never>) {
      return stream(get, arg, options, providedServices)
    }
  } else if (typeof arg === 'function') {
    return function(get: AtomContext, providedServices?: Context.Context<never>) {
      const value: unknown = Reflect.apply(arg, undefined, [get, providedServices])
      if (Effect.isEffect(value)) {
        return effect(get, value, options, providedServices)
      } else if (Stream.isStream(value)) {
        return stream(get, value, options, providedServices)
      }
      return value
    }
  }

  return state(arg)
}

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
): AsyncResult.Result<A, E> => {
  const initialValue = options?.initialValue !== undefined
    ? AsyncResult.success<A, E>(options.initialValue)
    : AsyncResult.initial<A, E>()
  return makeEffect(get, effect, initialValue, services, options?.uninterruptible)
}

function makeEffect<A, E, R0>(
  ctx: AtomContext,
  effect: Effect.Effect<A, E, R0>,
  initialValue: AsyncResult.Result<A, E>,
  services: Context.Context<never> = Context.empty(),
  uninterruptible = false,
): AsyncResult.Result<A, E> {
  // The value this atom already holds. Read here rather than passed in: every
  // caller would have to thread it, and a caller that forgets silently drops
  // the previous answer instead of keeping it on screen through a failure.
  const previous = ctx.self<AsyncResult.Result<A, E>>()
  const scope = Scope.makeUnsafe()
  ctx.addFinalizer(() => {
    Effect.runForkWith(services)(Scope.close(scope, Exit.void))
  })
  const servicesMap = new Map(services.mapUnsafe)
  servicesMap.set(Scope.Scope.key, scope)
  servicesMap.set(AtomRegistry.key, ctx.registry)
  servicesMap.set(Scheduler.Scheduler.key, ctx.registry.scheduler)
  let syncResult: AsyncResult.Result<A, E> | undefined
  let isAsync = false
  const cancel = runCallbackSync<A, E, R0>(
    Context.makeUnsafe<R0>(servicesMap),
    effect,
    function(exit) {
      syncResult = AsyncResult.fromExitWithPrevious(exit, previous)
      if (isAsync) {
        ctx.setSelf(syncResult)
      }
    },
    uninterruptible,
  )
  isAsync = true
  if (cancel !== undefined) {
    ctx.addFinalizer(cancel)
  }
  if (syncResult !== undefined) {
    return syncResult
  } else if (Option.isSome(previous)) {
    return AsyncResult.waitingFrom(previous)
  }
  return AsyncResult.waiting(initialValue)
}

function runCallbackSync<A, E, R0>(
  services: Context.Context<R0>,
  effect: Effect.Effect<A, E, R0> | Exit.Exit<A, E>,
  onExit: (exit: Exit.Exit<A, E>) => void,
  uninterruptible = false,
): (() => void) | undefined {
  if (Exit.isExit(effect)) {
    onExit(effect)
    return undefined
  }
  const runFork = Effect.runForkWith(services)
  const fiber = runFork(effect)
  fiber.currentDispatcher?.flush()
  const result = fiber.pollUnsafe()
  if (result) {
    onExit(result)
    return undefined
  }
  const remove = fiber.addObserver(onExit)
  function cancel() {
    remove()
    if (!uninterruptible) {
      fiber.interruptUnsafe()
    }
  }
  return cancel
}

// -----------------------------------------------------------------------------
// context
// -----------------------------------------------------------------------------

/**
 * Atom that builds a `Context` from a `Layer` and exposes constructors for atoms, functions, pulls, and subscription refs that run with that context.
 *
 * @category models
 * @since 4.0.0
 */
export interface AtomRuntime<R, ER = never> extends Atom<AsyncResult.Result<Context.Context<R>, ER>> {
  readonly factory: RuntimeFactory

  readonly layer: Atom<Layer.Layer<R, ER, unknown>>

  readonly atom: {
    <A, E>(
      create: (get: AtomContext) => Effect.Effect<A, E, Scope.Scope | R | AtomRegistry | Reactivity.Reactivity>,
      options?: {
        readonly initialValue?: A
        readonly uninterruptible?: boolean | undefined
      },
    ): Atom<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>>
    <A, E>(effect: Effect.Effect<A, E, Scope.Scope | R | AtomRegistry | Reactivity.Reactivity>, options?: {
      readonly initialValue?: A
      readonly uninterruptible?: boolean | undefined
    }): Atom<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>>
    <A, E>(create: (get: AtomContext) => Stream.Stream<A, E, AtomRegistry | Reactivity.Reactivity | R>, options?: {
      readonly initialValue?: A
    }): Atom<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>>
    <A, E>(stream: Stream.Stream<A, E, AtomRegistry | Reactivity.Reactivity | R>, options?: {
      readonly initialValue?: A
    }): Atom<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>>
  }

  readonly fn: {
    <Arg>(): {
      <E, A>(
        fn: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | AtomRegistry | Reactivity.Reactivity | R>,
        options?: {
          readonly initialValue?: A | undefined
          readonly reactivityKeys?: readonly unknown[] | ReadonlyRecord<string, readonly unknown[]> | undefined
          readonly concurrent?: boolean | undefined
        },
      ): AtomResultFn<Arg, A, E | ER> | AtomResultFn<unknown, unknown, unknown>
      <E, A>(
        fn: (arg: Arg, get: FnContext) => Stream.Stream<A, E, AtomRegistry | Reactivity.Reactivity | R>,
        options?: {
          readonly initialValue?: A | undefined
          readonly reactivityKeys?: readonly unknown[] | ReadonlyRecord<string, readonly unknown[]> | undefined
          readonly concurrent?: boolean | undefined
        },
      ): AtomResultFn<Arg, A, E | ER | Cause.NoSuchElementError> | AtomResultFn<unknown, unknown, unknown>
    }
    <E, A, Arg = void>(
      fn: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | AtomRegistry | Reactivity.Reactivity | R>,
      options?: {
        readonly initialValue?: A | undefined
        readonly reactivityKeys?: readonly unknown[] | ReadonlyRecord<string, readonly unknown[]> | undefined
        readonly concurrent?: boolean | undefined
      },
    ): AtomResultFn<Arg, A, E | ER> | AtomResultFn<unknown, unknown, unknown>
    <E, A, Arg = void>(
      fn: (arg: Arg, get: FnContext) => Stream.Stream<A, E, AtomRegistry | Reactivity.Reactivity | R>,
      options?: {
        readonly initialValue?: A | undefined
        readonly reactivityKeys?: readonly unknown[] | ReadonlyRecord<string, readonly unknown[]> | undefined
        readonly concurrent?: boolean | undefined
      },
    ): AtomResultFn<Arg, A, E | ER | Cause.NoSuchElementError> | AtomResultFn<unknown, unknown, unknown>
  }

  readonly pull: <A, E>(
    create:
      | ((get: AtomContext) => Stream.Stream<A, E, R | AtomRegistry | Reactivity.Reactivity>)
      | Stream.Stream<A, E, R | AtomRegistry | Reactivity.Reactivity>,
    options?: {
      readonly disableAccumulation?: boolean
      readonly initialValue?: readonly A[]
    },
  ) => Writable<PullResult<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>, void>

  readonly subscriptionRef: <A, E>(
    create:
      | Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | R | AtomRegistry | Reactivity.Reactivity>
      | ((
        get: AtomContext,
      ) => Effect.Effect<
        SubscriptionRef.SubscriptionRef<A>,
        E,
        Scope.Scope | R | AtomRegistry | Reactivity.Reactivity
      >),
  ) => Writable<AsyncResult.Result<A | Context.Context<R>, E | ER | Cause.NoSuchElementError>, A>
}

/**
 * Factory for `AtomRuntime` values that share a set of global layers.
 *
 * @category models
 * @since 4.0.0
 */
export interface RuntimeFactory {
  <R, E>(
    create:
      | Layer.Layer<R, E, unknown>
      | ((get: AtomContext) => Layer.Layer<R, E, unknown>),
  ): AtomRuntime<R, E>
  readonly addGlobalLayer: <A, E>(layer: Layer.Layer<A, E, AtomRegistry | Reactivity.Reactivity>) => void

  /**
   * Uses the `Reactivity` service from the runtime to refresh the atom whenever
   * the keys change.
   */
  readonly withReactivity: (
    keys: readonly unknown[] | ReadonlyRecord<string, readonly unknown[]>,
  ) => <A extends Atom<unknown>>(atom: A) => A
}

/**
 * A `RuntimeFactory` backed by an atom whose memo map is scoped to each registry.
 *
 * @category models
 * @since 4.0.0
 */
export interface RegistryRuntimeFactory extends RuntimeFactory {
  readonly memoMap: Atom<Layer.MemoMap>
}

/**
 * A `RuntimeFactory` backed by a concrete memo map shared across registries.
 *
 * @category models
 * @since 4.0.0
 */
export interface SharedRuntimeFactory extends RuntimeFactory {
  readonly memoMap: Layer.MemoMap
}

/**
 * Creates a `RuntimeFactory` backed by a registry-scoped memo map by default,
 * or by the supplied atom or concrete `Layer.MemoMap`.
 *
 * @category constructors
 * @since 4.0.0
 */
export function context(): RegistryRuntimeFactory
export function context(options: { readonly memoMap: Atom<Layer.MemoMap> }): RegistryRuntimeFactory
export function context(options: { readonly memoMap: Layer.MemoMap }): SharedRuntimeFactory
export function context(options?: {
  readonly memoMap: Atom<Layer.MemoMap> | Layer.MemoMap
}): RegistryRuntimeFactory | SharedRuntimeFactory {
  const memoMap = options?.memoMap ?? removeTtl(make(() => Layer.makeMemoMapUnsafe()))
  const resolveMemoMap = (get: AtomContext): Layer.MemoMap => isAtom(memoMap) ? get(memoMap) : memoMap
  // widened container: accumulates global layers across merges of heterogeneous output types.
  // ROut=never is sound: Layer is contravariant in ROut, so any accumulated layer is assignable
  // back into this slot; E=never after orDie keeps the slot closed; RIn=unknown absorbs the
  // union of requirements of the merged layers.
  let globalLayer: Layer.Layer<never, never, unknown> = Reactivity.layer
  const addGlobalLayer = <A, E>(layer: Layer.Layer<A, E, AtomRegistry | Reactivity.Reactivity>): void => {
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
    keys: readonly unknown[] | ReadonlyRecord<string, readonly unknown[]>,
  ): <A extends Atom<unknown>>(atom: A) => A =>
  <A extends Atom<unknown>>(atom: A): A => {
    const read = (get: AtomContext): unknown => {
      const store = AsyncResult.getOrThrow(get(reactivityAtom))
      get.addFinalizer(store.registerUnsafe(keys, () => {
        get.refresh(atom)
      }))
      get.subscribe(atom, (value) => get.setSelf(value))
      return atom.read(get)
    }
    return { ...atom, read }
  }
  const factoryFn = function makeRuntime<R, E>(
    create:
      | Layer.Layer<R, E, unknown>
      | ((get: AtomContext) => Layer.Layer<R, E, unknown>),
  ): AtomRuntime<R, E> {
    const layerAtom = keepAlive(
      typeof create === 'function'
        ? readable<Layer.Layer<R, E, unknown>>((get) => Layer.provideMerge(create(get), globalLayer))
        : readable<Layer.Layer<R, E, unknown>>(() => Layer.provideMerge(create, globalLayer)),
    )
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
  const factory: RegistryRuntimeFactory | SharedRuntimeFactory = isAtom(memoMap)
    ? Object.assign(factoryFn, { memoMap, addGlobalLayer, withReactivity })
    : Object.assign(factoryFn, { memoMap, addGlobalLayer, withReactivity })
  return factory
}

/**
 * Default registry-scoped `RuntimeFactory`.
 *
 * @category context
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
 * @category reactivity
 * @since 4.0.0
 */
export const withReactivity: (
  keys: readonly unknown[] | ReadonlyRecord<string, readonly unknown[]>,
) => <A extends Atom<unknown>>(atom: A) => A = runtime.withReactivity

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
): AsyncResult.Result<A, E | Cause.NoSuchElementError> => {
  const initialValue = options?.initialValue !== undefined
    ? AsyncResult.success<A, E>(options.initialValue)
    : AsyncResult.initial<A, E>()
  return makeStream(get, stream, initialValue, services)
}

function makeStream<A, E, R0>(
  ctx: AtomContext,
  stream: Stream.Stream<A, E, R0>,
  initialValue: AsyncResult.Result<A, E | Cause.NoSuchElementError>,
  services: Context.Context<never> = Context.empty(),
): AsyncResult.Result<A, E | Cause.NoSuchElementError> {
  const previous = ctx.self<AsyncResult.Result<A, E | Cause.NoSuchElementError>>()
  services = Context.add(services, AtomRegistry, ctx.registry)

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
          ctx.setSelf(AsyncResult.success(last, {
            waiting: true,
          }))
        },
      }))
  ).pipe(
    Effect.catchCause((cause) => {
      if (Pull.isDoneCause(cause)) {
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
      } else {
        const mapFail = (e: E | Cause.Done<void>): E | Cause.NoSuchElementError =>
          Cause.isDone(e) ? new Cause.NoSuchElementError() : e
        const stripped = Cause.map(cause, mapFail)
        ctx.setSelf(AsyncResult.failureWithPrevious(stripped, {
          previous,
        }))
      }
      return Effect.void
    }),
  )
  const servicesMap = new Map(services.mapUnsafe)
  servicesMap.set(AtomRegistry.key, ctx.registry)
  servicesMap.set(Scheduler.Scheduler.key, ctx.registry.scheduler)

  const cancel = runCallbackSync<void, never, R0 | AtomRegistry>(
    Context.makeUnsafe<R0 | AtomRegistry>(servicesMap),
    run,
    constVoid,
    false,
  )
  if (cancel !== undefined) {
    ctx.addFinalizer(cancel)
  }

  if (Option.isSome(previous)) {
    return AsyncResult.waitingFrom(previous)
  }
  return AsyncResult.waiting(initialValue)
}

// -----------------------------------------------------------------------------
// constructors - subscription ref
// -----------------------------------------------------------------------------

/**
 * Creates a writable atom backed by a `SubscriptionRef`, or by an effect that produces one, updating from ref changes and writing atom updates back to the ref.
 *
 * @category constructors
 * @since 4.0.0
 */
export const subscriptionRef: {
  <A>(
    ref: SubscriptionRef.SubscriptionRef<A> | ((get: AtomContext) => SubscriptionRef.SubscriptionRef<A>),
  ): Writable<A> | Writable<unknown, unknown>
  <A, E>(
    effect:
      | Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | AtomRegistry>
      | ((get: AtomContext) => Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | AtomRegistry>),
  ): Writable<AsyncResult.Result<A, E | Cause.NoSuchElementError>, A> | Writable<unknown, unknown>
} = (
  ref:
    | SubscriptionRef.SubscriptionRef<unknown>
    | ((get: AtomContext) => SubscriptionRef.SubscriptionRef<unknown>)
    | Effect.Effect<SubscriptionRef.SubscriptionRef<unknown>, unknown, Scope.Scope | AtomRegistry>
    | ((
      get: AtomContext,
    ) => Effect.Effect<SubscriptionRef.SubscriptionRef<unknown>, unknown, Scope.Scope | AtomRegistry>),
): Writable<unknown, unknown> =>
  makeSubRef(
    readable((get) => {
      const value = typeof ref === 'function' ? ref(get) : ref
      return SubscriptionRef.isSubscriptionRef(value)
        ? value
        : makeEffect(get, value, AsyncResult.initial(true))
    }),
    (get, source) => AsyncResult.isResult(source) ? readRefResult(get, source) : readRefDirect(get, source),
  )

/** What a ref-producing atom yields: a ref outright, or a result that may carry one. */
type RefSource<A, R0, E> =
  | SubscriptionRef.SubscriptionRef<A>
  | AsyncResult.Result<SubscriptionRef.SubscriptionRef<A> | Context.Context<R0>, E>

/** The ref a source carries, when it has produced one. */
const refOf = <A, R0, E>(
  source: RefSource<A, R0, E>,
): Option.Option<SubscriptionRef.SubscriptionRef<A>> => {
  if (!AsyncResult.isResult(source)) {
    return Option.some(source)
  }
  if (!AsyncResult.isSuccess(source)) {
    return Option.none()
  }
  const value = source.value
  return Context.isContext(value) ? Option.none() : Option.some(value)
}

/**
 * Reads a ref the caller already holds: subscribes to its changes for the
 * lifetime of the read and yields its current value. A ref handed over outright
 * has nothing to await, so this reports the value itself, never a result.
 */
const readRefDirect = <A>(
  get: AtomContext,
  ref: SubscriptionRef.SubscriptionRef<A>,
  services: Context.Context<never> = Context.empty(),
): A => {
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
  return Effect.runSyncWith(services)(SubscriptionRef.get(ref))
}

/**
 * Reads a ref that is still being produced, so the value reports every state the
 * producer reaches rather than only its outcome.
 */
const readRefResult = <A, R0, E>(
  get: AtomContext,
  source: AsyncResult.Result<SubscriptionRef.SubscriptionRef<A> | Context.Context<R0>, E>,
  services: Context.Context<never> = Context.empty(),
): AsyncResult.Result<A | Context.Context<R0>, E | Cause.NoSuchElementError> => {
  if (AsyncResult.isSuccess(source)) {
    const value = source.value
    if (Context.isContext(value)) {
      // Produced services rather than a ref: report them as the value.
      return AsyncResult.success<A | Context.Context<R0>, E>(value)
    }
    return makeStream(get, SubscriptionRef.changes(value), AsyncResult.initial(true), services)
  }
  // No ref yet. A pending state carries a ref-shaped value, never an `A`, so it
  // is rebuilt in the value type this atom reports instead of passed through.
  return AsyncResult.isFailure(source)
    ? AsyncResult.failure<A | Context.Context<R0>, E>(source.cause, { waiting: source.waiting })
    : AsyncResult.initial<A | Context.Context<R0>, E>(source.waiting)
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
 * @category models
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
  self(this: FnContext): Option.Option<unknown>
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
  readonly registry: Registry.Registry
}

/**
 * Creates a writable atom for a synchronous function; writing an argument re-runs the function, returning `Option.none` before the first call unless an initial value is supplied.
 *
 * @category constructors
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
export function fnSync(
  ...args: readonly [f?: (arg: unknown, get: FnContext) => unknown, options?: { readonly initialValue?: unknown }]
): unknown {
  if (args.length === 0) {
    return makeFnSync
  }
  const f = args[0]
  if (f === undefined) {
    throw new TypeError('fnSync expects a function argument')
  }
  return makeFnSync(f, args[1])
}

const makeFnSync = <Arg, A>(f: (arg: Arg, get: FnContext) => A, options?: {
  readonly initialValue?: A
}): Writable<Option.Option<A> | A, Arg> => {
  const argAtom = removeTtl(state<[number, Arg | undefined]>([0, undefined]))
  const hasInitialValue = options?.initialValue !== undefined
  return writable(function(get) {
    get.isFn = true
    const [counter, arg] = get.get(argAtom)
    if (counter === 0) {
      return hasInitialValue ? options.initialValue : Option.none()
    }
    const argValue = Option.getOrThrowWith(
      Option.fromUndefinedOr(arg),
      () => new Error('fnSync: function atom read without an argument'),
    )
    return hasInitialValue ? f(argValue, get) : Option.some(f(argValue, get))
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
 * @category models
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
 * @category symbols
 * @since 4.0.0
 */
export const Reset = Symbol.for('effect/reactivity/atom/Atom/Reset')

/**
 * Type of the `Reset` control symbol accepted by `AtomResultFn` writes.
 *
 * @category symbols
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
 * @category symbols
 * @since 4.0.0
 */
export const Interrupt = Symbol.for('effect/reactivity/atom/Atom/Interrupt')

/**
 * Type of the `Interrupt` control symbol accepted by `AtomResultFn` writes.
 *
 * @category symbols
 * @since 4.0.0
 */
export type Interrupt = typeof Interrupt

/**
 * Creates a writable atom for an `Effect` or `Stream` function; writing an argument starts the computation and exposes its state as an `AsyncResult`.
 *
 * @category constructors
 * @since 4.0.0
 */
export function fn<Arg>(): <E, A>(
  fn: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | AtomRegistry>,
  options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  },
) => AtomResultFn<Arg, A, E>
export function fn<E, A, Arg = void>(
  fn: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | AtomRegistry>,
  options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  },
): AtomResultFn<Arg, A, E>
export function fn<Arg>(): <E, A>(
  fn: (arg: Arg, get: FnContext) => Stream.Stream<A, E, AtomRegistry>,
  options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  },
) => AtomResultFn<Arg, A, E | Cause.NoSuchElementError>
export function fn<E, A, Arg = void>(
  fn: (arg: Arg, get: FnContext) => Stream.Stream<A, E, AtomRegistry>,
  options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  },
): AtomResultFn<Arg, A, E | Cause.NoSuchElementError>
export function fn(
  ...args: readonly [
    fn?: (arg: unknown, get: FnContext) =>
      | Effect.Effect<unknown, unknown, Scope.Scope | AtomRegistry>
      | Stream.Stream<unknown, unknown, AtomRegistry>,
    options?: {
      readonly initialValue?: unknown
      readonly concurrent?: boolean | undefined
    },
  ]
): unknown {
  if (args.length === 0) {
    return makeFn
  }
  const f = args[0]
  if (f === undefined) {
    throw new TypeError('fn expects a function argument')
  }
  return makeFn(f, args[1])
}

function makeFn<Arg, E, A>(
  f: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | AtomRegistry>,
  options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  },
): AtomResultFn<Arg, A, E>
function makeFn<Arg, E, A>(
  f: (arg: Arg, get: FnContext) => Stream.Stream<A, E, AtomRegistry>,
  options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  },
): AtomResultFn<Arg, A, E | Cause.NoSuchElementError>
function makeFn(
  f: (arg: unknown, get: FnContext) =>
    | Effect.Effect<unknown, unknown, Scope.Scope | AtomRegistry>
    | Stream.Stream<unknown, unknown, AtomRegistry>,
  options?: {
    readonly initialValue?: unknown
    readonly concurrent?: boolean | undefined
  },
): AtomResultFn<unknown, unknown, unknown>
function makeFn<Arg, E, A>(
  f: (arg: Arg, get: FnContext) => Stream.Stream<A, E, AtomRegistry> | Effect.Effect<A, E, Scope.Scope | AtomRegistry>,
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
  ) => Effect.Effect<A, E, Scope.Scope | AtomRegistry | R0> | Stream.Stream<A, E, AtomRegistry | R0>,
  options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  },
) {
  const argAtom = removeTtl(state<readonly [number, Option.Option<Arg | Interrupt>]>([0, Option.none()]))
  const initialValue = options?.initialValue !== undefined
    ? AsyncResult.success<A, E>(options.initialValue)
    : AsyncResult.initial<A, E>()
  const fibersAtom = options?.concurrent
    ? removeTtl(readable((get) => {
      const fibers = new Set<Fiber.Fiber<A, E>>()
      get.addFinalizer(() => fibers.forEach((f) => f.interruptUnsafe()))
      return fibers
    }))
    : undefined

  function read(
    get: AtomContext,
    services?: Context.Context<never>,
  ): AsyncResult.Result<A, E | Cause.NoSuchElementError> {
    const fibers = fibersAtom ? get(fibersAtom) : undefined
    get.isFn = true
    const [counter, arg] = get.get(argAtom)
    if (counter === 0) {
      return initialValue
    } else {
      const argValue = Option.getOrThrow(arg)
      if (argValue === Interrupt) {
        return AsyncResult.failureWithPrevious(Cause.interrupt(), { previous: Option.none() })
      }
      const value = f(argValue, get)
      if (Effect.isEffect(value)) {
        if (fibers) {
          const eff = value
          const effect = Effect.flatMap(
            Effect.forkDetach(eff, { startImmediately: true }),
            (fiber) => {
              fibers.add(fiber)
              fiber.addObserver(() => fibers.delete(fiber))
              return Effect.map(Fiber.joinAll(fibers), (arr) => Option.getOrThrow(Arr.head(arr)))
            },
          )
          return makeEffect(get, effect, initialValue, services, false)
        }
        return makeEffect(get, value, initialValue, services, false)
      }
      return makeStream(get, value, initialValue, services)
    }
  }
  function write(
    ctx: WriteContext<AsyncResult.Result<A, E | Cause.NoSuchElementError>>,
    arg: Arg | Reset | Interrupt,
  ) {
    batch(() => {
      if (arg === Reset) {
        ctx.set(argAtom, [0, Option.none()])
      } else if (arg === Interrupt) {
        ctx.set(argAtom, [ctx.get(argAtom)[0] + 1, Option.some(Interrupt)])
      } else {
        ctx.set(argAtom, [ctx.get(argAtom)[0] + 1, Option.some(arg)])
      }
      ctx.refreshSelf()
    })
  }
  return [read, write, argAtom] as const
}

/**
 * `AsyncResult` produced by `pull`, containing a non-empty batch of pulled items and a `done` flag, or `NoSuchElementError` when the stream completes without items.
 *
 * @category models
 * @since 4.0.0
 */
export type PullResult<A, E = never> = AsyncResult.Result<{
  readonly done: boolean
  readonly items: Arr.NonEmptyReadonlyArray<A>
}, E | Cause.NoSuchElementError>

/**
 * Creates a writable atom that pulls an initial chunk from a stream and then pulls the next chunk whenever it is written to, accumulating items unless `disableAccumulation` is enabled.
 *
 * @category constructors
 * @since 4.0.0
 */
export const pull = <A, E>(
  create: ((get: AtomContext) => Stream.Stream<A, E, AtomRegistry>) | Stream.Stream<A, E, AtomRegistry>,
  options?: {
    readonly disableAccumulation?: boolean | undefined
  },
): Writable<PullResult<A, E>, void> => {
  const pullSignal = removeTtl(state(0))
  const pullAtom = readable(makeRead((get) => makeStreamPullEffect(get, pullSignal, create, options)))
  return makeStreamPull(pullSignal, pullAtom)
}

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
  R0 | Scope.Scope | AtomRegistry
> =>
  Effect.flatMap(
    Stream.toPull(typeof create === 'function' ? create(get) : create),
    (pullChunk) => {
      const fiber = Fiber.getCurrent()
      if (fiber === undefined) {
        return Effect.die(new Error('Atom.pull: no fiber in scope'))
      }
      const services = Context.empty().pipe(
        Context.add(Scope.Scope, Context.getUnsafe(fiber.context, Scope.Scope)),
        Context.add(AtomRegistry, Context.getUnsafe(fiber.context, AtomRegistry)),
      )
      let acc: readonly A[] = Arr.empty<A>()
      const pull: Effect.Effect<
        {
          done: boolean
          items: Arr.NonEmptyReadonlyArray<A>
        },
        Cause.NoSuchElementError | E,
        AtomRegistry
      > = Effect.matchCauseEffect(pullChunk, {
        onFailure(cause): Effect.Effect<
          { done: boolean; items: Arr.NonEmptyReadonlyArray<A> },
          Cause.NoSuchElementError | E
        > {
          const filtered = Pull.filterDone(cause)
          if (Result.isSuccess(filtered)) {
            if (!Arr.isReadonlyArrayNonEmpty(acc)) {
              return Effect.fail(new Cause.NoSuchElementError(`Atom.pull: no items`))
            }
            return Effect.succeed({ done: true, items: acc })
          }
          return Effect.failCause(filtered.failure)
        },
        onSuccess(chunk) {
          let items: Arr.NonEmptyReadonlyArray<A> | readonly A[]
          if (options?.disableAccumulation) {
            items = Arr.fromIterable(chunk)
          } else {
            items = Arr.appendAll(acc, chunk)
            acc = items
          }
          if (!Arr.isReadonlyArrayNonEmpty(items)) return pull
          return Effect.succeed({ done: false, items })
        },
      })

      const cancels = new Set<() => void>()
      get.addFinalizer(() => {
        for (const cancel of cancels) cancel()
      })
      get.once(pullSignal)
      get.subscribe(pullSignal, () => {
        get.setSelf(AsyncResult.waitingFrom(Option.none()))
        let cancel: (() => void) | undefined
        // eslint-disable-next-line prefer-const
        cancel = runCallbackSync(services, pull, (exit) => {
          if (cancel) cancels.delete(cancel)
          const result = AsyncResult.fromExitWithPrevious(exit, Option.none())
          const pending = cancels.size > 0
          get.setSelf(pending ? AsyncResult.waiting(result) : result)
        })
        if (cancel) cancels.add(cancel)
      })

      return pull
    },
  )

const makeStreamPull = <A, E>(
  pullSignal: Writable<number>,
  pullAtom: Atom<PullResult<A, E>>,
): Writable<PullResult<A, E>, void> =>
  writable(pullAtom.read, function(ctx, _) {
    ctx.set(pullSignal, ctx.get(pullSignal) + 1)
  })

/**
 * Creates a memoized atom factory that returns the same object for the same argument, using weak references for cached values when the platform supports them.
 *
 * @category constructors
 * @since 4.0.0
 */
export const family = typeof WeakRef === 'undefined' || typeof FinalizationRegistry === 'undefined'
  ? <Arg, T extends object>(
    f: (arg: Arg) => T,
  ): (arg: Arg) => T => {
    const atoms = MutableHashMap.empty<Arg, T>()
    return function(arg) {
      const atomEntry = MutableHashMap.get(atoms, arg)
      if (Option.isSome(atomEntry)) {
        return atomEntry.value
      }
      const newAtom = f(arg)
      MutableHashMap.set(atoms, arg, newAtom)
      return newAtom
    }
  }
  : <Arg, T extends object>(
    f: (arg: Arg) => T,
  ): (arg: Arg) => T => {
    const atoms = MutableHashMap.empty<Arg, WeakRef<T>>()
    const registry = new FinalizationRegistry<Arg>((arg) => {
      MutableHashMap.remove(atoms, arg)
    })
    return function(arg) {
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
  }

/**
 * Uses a fallback `AsyncResult` atom while the primary atom is `Initial`, marking the fallback result as waiting until the primary atom produces a non-initial result.
 *
 * @category combinators
 * @since 4.0.0
 */
export const withFallback: {
  <E2, A2>(
    fallback: Atom<AsyncResult.Result<A2, E2>>,
  ): <R extends Atom<AsyncResult.Result<unknown, unknown>>>(
    self: R,
  ) => [R] extends [Writable<infer _, infer RW>] ? Writable<
      AsyncResult.Result<unknown, unknown> | AsyncResult.Result<A2, E2>,
      RW
    >
    : Atom<
      AsyncResult.Result<unknown, unknown> | AsyncResult.Result<A2, E2>
    >
  <R extends Atom<AsyncResult.Result<unknown, unknown>>, A2, E2>(
    self: R,
    fallback: Atom<AsyncResult.Result<A2, E2>>,
  ): [R] extends [Writable<infer _, infer RW>] ? Writable<
      AsyncResult.Result<unknown, unknown> | AsyncResult.Result<A2, E2>,
      RW
    >
    : Atom<
      AsyncResult.Result<unknown, unknown> | AsyncResult.Result<A2, E2>
    >
} = dual(2, <R extends Atom<AsyncResult.Result<unknown, unknown>>, A2, E2>(
  self: R,
  fallback: Atom<AsyncResult.Result<A2, E2>>,
): Atom<
  AsyncResult.Result<unknown, unknown> | AsyncResult.Result<A2, E2>
> => {
  function withFallback(get: AtomContext): AsyncResult.Result<unknown, unknown> | AsyncResult.Result<A2, E2> {
    const result = get(self)
    return AsyncResult.isInitial(result)
      ? AsyncResult.waiting(get(fallback))
      : result
  }
  return isWritable(self)
    ? writable(
      withFallback,
      self.write,
      self.refresh ?? function(refresh) {
        refresh(self)
      },
    )
    : readable(
      withFallback,
      self.refresh ?? function(refresh) {
        refresh(self)
      },
    )
})

const copyAtomWithProto = <A extends object, P extends object>(self: A, patch: P): A & P => {
  const copy = Object.assign({}, self, patch)
  const prototype = Reflect.getPrototypeOf(self)
  if (prototype !== null && prototype !== Object.prototype) {
    Object.setPrototypeOf(copy, prototype)
  }
  return copy
}

/**
 * Returns a copy of an atom that remains cached and mounted even when no subscribers are using it.
 *
 * @category combinators
 * @since 4.0.0
 */
export const keepAlive = <A extends Atom<unknown>>(self: A): A =>
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
 * @category combinators
 * @since 4.0.0
 */
export const autoDispose = <A extends Atom<unknown>>(self: A): A =>
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
 * @category combinators
 * @since 4.0.0
 */
export const setLazy: {
  (lazy: boolean): <A extends Atom<unknown>>(self: A) => A
  <A extends Atom<unknown>>(self: A, lazy: boolean): A
} = dual(2, <A extends Atom<unknown>>(self: A, lazy: boolean) =>
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
 * @category combinators
 * @since 4.0.0
 */
export const withEquality: {
  <A>(equals: (value: A, next: A) => boolean): <T extends Atom<A>>(self: T) => T
  <T extends Atom<unknown>>(self: T, equals: (value: Type<T>, next: Type<T>) => boolean): T
} = dual(
  2,
  <T extends Atom<unknown>>(self: T, equals: (value: Type<T>, next: Type<T>) => boolean): T =>
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
 * @category combinators
 * @since 4.0.0
 */
export const withLabel: {
  (name: string): <A extends Atom<unknown>>(self: A) => A
  <A extends Atom<unknown>>(self: A, name: string): A
} = dual<
  (name: string) => <A extends Atom<unknown>>(self: A) => A,
  <A extends Atom<unknown>>(self: A, name: string) => A
>(2, (self, name) =>
  copyAtomWithProto(self, {
    label: [name, new Error().stack?.split('\n')[5] ?? ''],
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
 * The returned tuple can be supplied to `AtomRegistry` initial values so the atom
 * starts with the provided value before it is first rebuilt.
 *
 * @category combinators
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
 * @category combinators
 * @since 4.0.0
 */
export const map: {
  <R extends Atom<unknown>, B>(
    f: (_: Type<R>) => B,
  ): (self: R) => [R] extends [Writable<infer _, infer RW>] ? Writable<B, RW> : Atom<B>
  <R extends Atom<unknown>, B>(
    self: R,
    f: (_: Type<R>) => B,
  ): [R] extends [Writable<infer _, infer RW>] ? Writable<B, RW> : Atom<B>
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
 * @category combinators
 * @since 4.0.0
 */
const mapResultImpl = (
  self: Atom<unknown>,
  f: (value: unknown) => unknown,
): Atom<AsyncResult.Result<unknown, unknown>> =>
  transform(self, (get): AsyncResult.Result<unknown, unknown> => {
    const value = get(self)
    if (!AsyncResult.isResult(value)) {
      throw new TypeError('mapResult: expected an AsyncResult atom')
    }
    if (AsyncResult.isSuccess(value)) {
      return AsyncResult.success(f(value.value))
    }
    return value
  })

type MapResultMapper = (s: unknown) => unknown
const isMapResultMapper = (arg: unknown): arg is MapResultMapper => typeof arg === 'function'

export function mapResult<R extends Atom<AsyncResult.Result<unknown, unknown>>, B>(
  f: (_: AsyncResult.Result.Success<Type<R>>) => B,
): (
  self: R,
) => [R] extends [Writable<infer _, infer RW>]
  ? Writable<AsyncResult.Result<B, unknown> | AsyncResult.Result<unknown, unknown>, RW>
  : Atom<AsyncResult.Result<B, unknown> | AsyncResult.Result<unknown, unknown>>
export function mapResult<R extends Atom<AsyncResult.Result<unknown, unknown>>, B>(
  self: R,
  f: (_: AsyncResult.Result.Success<Type<R>>) => B,
): [R] extends [Writable<infer _, infer RW>]
  ? Writable<AsyncResult.Result<B, unknown> | AsyncResult.Result<unknown, unknown>, RW>
  : Atom<AsyncResult.Result<B, unknown> | AsyncResult.Result<unknown, unknown>>
export function mapResult(
  selfOrF: unknown,
  f?: unknown,
): unknown {
  if (arguments.length >= 2) {
    if (!isAtom(selfOrF) || !isMapResultMapper(f)) {
      throw new TypeError('mapResult expects an atom and a function argument')
    }
    return mapResultImpl(selfOrF, f)
  }
  return (self: Atom<unknown>) => {
    if (!isMapResultMapper(selfOrF)) {
      throw new TypeError('mapResult expects a function argument')
    }
    return mapResultImpl(self, selfOrF)
  }
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
 * @category combinators
 * @since 4.0.0
 */
export const debounce: {
  (duration: Duration.Input): <A extends Atom<unknown>>(self: A) => WithoutSerializable<A>
  <A extends Atom<unknown>>(self: A, duration: Duration.Input): WithoutSerializable<A>
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
        if (timeout) timeout()
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
 * @category combinators
 * @since 4.0.0
 */
export const withRefresh: {
  (duration: Duration.Input): <A extends Atom<unknown>>(self: A) => WithoutSerializable<A>
  <A extends Atom<unknown>>(self: A, duration: Duration.Input): WithoutSerializable<A>
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
 * @category combinators
 * @since 4.0.0
 */
export const swr: {
  (
    options: {
      readonly staleTime: Duration.Input
      readonly revalidateOnMount?: boolean | undefined
      readonly revalidateOnFocus?: boolean | 'always' | undefined
      readonly focusSignal?: Atom<unknown> | undefined
    },
  ): <R extends Atom<AsyncResult.Result<unknown, unknown>>>(self: R) => WithoutSerializable<R>
  <R extends Atom<AsyncResult.Result<unknown, unknown>>>(
    self: R,
    options: {
      readonly staleTime: Duration.Input
      readonly revalidateOnMount?: boolean | undefined
      readonly revalidateOnFocus?: boolean | 'always' | undefined
      readonly focusSignal?: Atom<unknown> | undefined
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
      readonly focusSignal?: Atom<unknown> | undefined
    },
  ): Atom<AsyncResult.Result<A, E>> => {
    const staleTime = Duration.toMillis(Duration.fromInputUnsafe(options.staleTime))
    return transform(self, (get) => {
      const current = get.once(self)
      get.subscribe(self, (value) => {
        get.setSelf(value)
      })
      if (options.revalidateOnFocus && options.focusSignal) {
        get.once(options.focusSignal)
        get.subscribe(
          options.focusSignal,
          options.revalidateOnFocus === 'always' ? () => get.refresh(self) : () => {
            const current = get.once(self)
            if (shouldRevalidateSWR(current, staleTime, get.registry.now())) {
              get.refresh(self)
            }
          },
        )
      }
      const firstRead = Option.isNone(get.self())
      if (firstRead && options.revalidateOnMount === false) {
        return current
      }
      if (shouldRevalidateSWR(current, staleTime, get.registry.now())) {
        get.refresh(self)
      }
      return current
    }, { initialValueTarget: self })
  },
)

const swrTimestamp = <A, E>(result: AsyncResult.Result<A, E>): Option.Option<number> => {
  if (AsyncResult.isSuccess(result)) {
    return Option.some(result.timestamp)
  }
  if (AsyncResult.isFailure(result)) {
    return Option.map(result.previousSuccess, (success) => success.timestamp)
  }
  return Option.none()
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
  const timestamp = Option.getOrUndefined(swrTimestamp(result))
  if (timestamp === undefined) {
    return !AsyncResult.isInitial(result)
  }
  return !isFreshWithin(timestamp, staleTime, now)
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
 * @category constructors
 * @since 4.0.0
 */
export const optimistic = <A>(self: Atom<A>): Writable<A, Atom<AsyncResult.Result<A, unknown>>> => {
  let counter = 0
  const writeAtom = removeTtl(state<readonly [number, Atom<AsyncResult.Result<A, unknown>> | undefined]>(
    [counter, undefined] as const,
  ))
  return writable(
    (get) => {
      let lastValue = get.once(self)
      let needsRefresh = false
      get.subscribe(self, (value) => {
        lastValue = value
        if (transitions.size > 0) {
          return
        }
        needsRefresh = false
        if (!AsyncResult.isAsyncResult(value)) {
          return get.setSelf(value)
        }
        const current = Option.getOrUndefined(get.self())
        if (AsyncResult.isInitial(value)) {
          if (AsyncResult.isResult(current) && AsyncResult.isInitial(current)) {
            get.setSelf(value)
          }
          return
        }
        if (AsyncResult.isSuccess(value)) {
          if (AsyncResult.isResult(current) && AsyncResult.isSuccess(current)) {
            if (!value.waiting && value.timestamp >= current.timestamp) {
              get.setSelf(value)
            }
          } else {
            get.setSelf(value)
          }
          return
        }
        get.setSelf(value)
      })
      const transitions = new Set<Atom<AsyncResult.Result<A, unknown>>>()
      const cancels = new Set<() => void>()
      get.subscribe(writeAtom, ([, atom]) => {
        if (atom === undefined) return
        if (transitions.has(atom)) return
        transitions.add(atom)
        let cancel: (() => void) | undefined
        // eslint-disable-next-line prefer-const
        cancel = get.registry.subscribe(atom, (result) => {
          if (AsyncResult.isSuccess(result) && result.waiting) {
            return get.setSelf(result.value)
          }
          transitions.delete(atom)
          if (cancel) {
            cancels.delete(cancel)
            cancel()
          }
          if (!needsRefresh && !AsyncResult.isFailure(result)) {
            needsRefresh = true
          }
          if (transitions.size === 0) {
            if (needsRefresh) {
              needsRefresh = false
              get.refresh(self)
            } else {
              get.setSelf(lastValue)
            }
          }
        }, { immediate: true })
        if (transitions.has(atom)) {
          cancels.add(cancel)
        } else {
          cancel()
        }
      })
      get.addFinalizer(() => {
        for (const cancel of cancels) cancel()
        transitions.clear()
        cancels.clear()
      })
      return lastValue
    },
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
 * @category combinators
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
    self: Writable<A, Atom<AsyncResult.Result<W, unknown>>>,
  ) => AtomResultFn<OW, XA, XE>
  <A, W, XA, XE, OW = void>(
    self: Writable<A, Atom<AsyncResult.Result<W, unknown>>>,
    options: {
      readonly reducer: (current: NoInfer<A>, update: OW) => NoInfer<W>
      readonly fn:
        | AtomResultFn<OW, XA, XE>
        | ((set: (result: NoInfer<W>) => void) => AtomResultFn<OW, XA, XE>)
    },
  ): AtomResultFn<OW, XA, XE>
} = dual(2, <A, W, XA, XE, OW = void>(
  self: Writable<A, Atom<AsyncResult.Result<W, unknown>>>,
  options: {
    readonly reducer: (current: NoInfer<A>, update: OW) => NoInfer<W>
    readonly fn:
      | AtomResultFn<OW, XA, XE>
      | ((set: (result: NoInfer<W>) => void) => AtomResultFn<OW, XA, XE>)
  },
): AtomResultFn<OW, XA, XE> => {
  const transition = removeTtl(state<AsyncResult.Result<W, unknown>>(AsyncResult.initial()))
  return fn((arg: OW, get) => {
    let value = options.reducer(get(self), arg)
    if (AsyncResult.isAsyncResult(value)) {
      value = AsyncResult.waiting(value, { touch: true })
    }
    get.set(transition, AsyncResult.success(value, { waiting: true }))
    get.set(self, transition)
    const fn = typeof options.fn === 'function'
      ? autoDispose(options.fn((value) =>
        get.set(
          transition,
          AsyncResult.success(AsyncResult.isAsyncResult(value) ? AsyncResult.waiting(value) : value, { waiting: true }),
        )
      ))
      : options.fn
    get.set(fn, arg)
    return Effect.callback<XA, XE>((resume) => {
      get.subscribe(fn, (result) => {
        if (AsyncResult.isInitial(result) || result.waiting) return
        get.set(transition, AsyncResult.map(result, () => value))
        resume(AsyncResult.toExit(result))
      }, { immediate: true })
    })
  })
})

/**
 * Runs synchronous atom updates as a batch.
 *
 * **Details**
 *
 * Stale nodes are rebuilt and listeners are notified after the callback completes,
 * so dependent updates observe the final batched state.
 *
 * @category batching
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
 * @category constructors
 * @since 4.0.0
 */
export function kvs<S extends Schema.ConstraintCodec<unknown, unknown>, const Mode extends 'sync' | 'async' = never>(
  options: {
    readonly runtime: AtomRuntime<KeyValueStore.KeyValueStore, unknown>
    readonly key: string
    readonly schema: S
    readonly defaultValue: LazyArg<S['Type']>
    readonly mode?: Mode | undefined
  },
): Writable<'async' extends Mode ? AsyncResult.Result<S['Type']> : S['Type'], S['Type']>
export function kvs<S extends Schema.ConstraintCodec<unknown, unknown>, const Mode extends 'sync' | 'async' = never>(
  options: {
    readonly runtime: AtomRuntime<KeyValueStore.KeyValueStore, unknown>
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
    (get): AsyncResult.Result<S['Type']> | S['Type'] => {
      if (options.mode === 'async') {
        written = false
        get.mount(setAtom)
        const readValue = (): AsyncResult.Result<S['Type']> => {
          const result = get.once(resultAtom)
          if (!AsyncResult.isSuccess(result) || !Option.isOption(result.value)) {
            return AsyncResult.initial<S['Type']>()
          }
          return Option.isSome(result.value)
            ? AsyncResult.success(result.value.value)
            : AsyncResult.success(options.defaultValue())
        }
        get.subscribe(resultAtom, (result) => {
          if (written) return
          if (!AsyncResult.isSuccess(result) || !Option.isOption(result.value)) return
          if (Option.isSome(result.value)) {
            get.setSelf(AsyncResult.success(result.value.value))
          } else {
            const value = options.defaultValue()
            get.set(setAtom, value)
            get.setSelf(AsyncResult.success(value))
          }
        })
        return readValue()
      }
      written = false
      get.mount(setAtom)
      get.subscribe(resultAtom, (result) => {
        if (!AsyncResult.isSuccess(result) || !Option.isOption(result.value)) return
        if (written) return
        if (Option.isSome(result.value)) {
          get.setSelf(result.value.value)
        } else {
          // The store answered "absent", so the fallback becomes the stored
          // value. A value already on screen wins: it came from a write.
          const value = Option.getOrElse(get.self<S['Type']>(), options.defaultValue)
          get.setSelf(value)
          get.set(setAtom, value)
        }
      }, { immediate: true })
      // Whatever that settled, else the fallback. Never written back here:
      // until the store answers, writing would overwrite the value it holds.
      return Option.getOrElse(get.self<S['Type']>(), options.defaultValue)
    },
    (ctx, value: S['Type']) => {
      written = true
      ctx.set(setAtom, value)
      const next: AsyncResult.Result<S['Type']> | S['Type'] = options.mode === 'async'
        ? AsyncResult.success(value)
        : value
      ctx.setSelf(next)
    },
  )
}

// -----------------------------------------------------------------------------
// conversions
// -----------------------------------------------------------------------------

/**
 * Converts an atom into a stream using the `AtomRegistry` service.
 *
 * **Details**
 *
 * The stream emits the atom's current value immediately and then emits subsequent
 * changes until the stream scope is closed.
 *
 * @category converting
 * @since 4.0.0
 */
export const toStream = <A>(self: Atom<A>): Stream.Stream<A, never, AtomRegistry> =>
  Stream.unwrap(AtomRegistry.use((r) => Effect.succeed(Registry.toStream(r, self))))

/**
 * Converts an `AsyncResult` atom into a stream using the `AtomRegistry` service.
 *
 * **Details**
 *
 * Initial results are skipped, successes are emitted as stream values, and
 * failures fail the stream with the result cause.
 *
 * @category converting
 * @since 4.0.0
 */
export const toStreamResult = <A, E>(self: Atom<AsyncResult.Result<A, E>>): Stream.Stream<A, E, AtomRegistry> =>
  Stream.unwrap(AtomRegistry.use((r) => Effect.succeed(Registry.toStreamResult(r, self))))

/**
 * Reads an atom's current value from the `AtomRegistry` service.
 *
 * @category converting
 * @since 4.0.0
 */
export const get = <A>(self: Atom<A>): Effect.Effect<A, never, AtomRegistry> =>
  AtomRegistry.use((r) => Effect.succeed(r.get(self)))

/**
 * Reads a writable atom, computes a return value and next write value, writes the
 * next value, and returns the computed result.
 *
 * @category converting
 * @since 4.0.0
 */
export const modify: {
  <R, W, A>(
    f: (_: R) => [returnValue: A, nextValue: W],
  ): (self: Writable<R, W>) => Effect.Effect<A, never, AtomRegistry>
  <R, W, A>(self: Writable<R, W>, f: (_: R) => [returnValue: A, nextValue: W]): Effect.Effect<A, never, AtomRegistry>
} = dual(
  2,
  <R, W, A>(self: Writable<R, W>, f: (_: R) => [returnValue: A, nextValue: W]): Effect.Effect<A, never, AtomRegistry> =>
    Effect.map(AtomRegistry, (_) => _.modify(self, f)),
)

/**
 * Writes a value to a writable atom through the `AtomRegistry` service.
 *
 * @category converting
 * @since 4.0.0
 */
export const set: {
  <W>(value: W): <R>(self: Writable<R, W>) => Effect.Effect<void, never, AtomRegistry>
  <R, W>(self: Writable<R, W>, value: W): Effect.Effect<void, never, AtomRegistry>
} = dual(
  2,
  <R, W>(self: Writable<R, W>, value: W): Effect.Effect<void, never, AtomRegistry> =>
    Effect.map(AtomRegistry, (_) => _.set(self, value)),
)

/**
 * Updates a writable atom by reading its current value from the registry and
 * writing the value returned by the update function.
 *
 * @category converting
 * @since 4.0.0
 */
export const update: {
  <R, W>(f: (_: R) => W): (self: Writable<R, W>) => Effect.Effect<void, never, AtomRegistry>
  <R, W>(self: Writable<R, W>, f: (_: R) => W): Effect.Effect<void, never, AtomRegistry>
} = dual(
  2,
  <R, W>(self: Writable<R, W>, f: (_: R) => W): Effect.Effect<void, never, AtomRegistry> =>
    Effect.map(AtomRegistry, (_) => _.update(self, f)),
)

/**
 * Reads an `AsyncResult` atom as an effect through the `AtomRegistry` service.
 *
 * **Details**
 *
 * The effect waits while the result is `Initial`, and also while it is waiting
 * when `suspendOnWaiting` is enabled. Successes succeed with the value and
 * failures fail with the result cause.
 *
 * @category converting
 * @since 4.0.0
 */
export const getResult = <A, E>(
  self: Atom<AsyncResult.Result<A, E>>,
  options?: { readonly suspendOnWaiting?: boolean | undefined },
): Effect.Effect<A, E, AtomRegistry> => AtomRegistry.use(Registry.getResult(self, options))

/**
 * Runs a refresh request for an atom through the `AtomRegistry` service.
 *
 * **When to use**
 *
 * Use to invalidate and recompute an atom from an Effect that has access to the
 * active registry.
 *
 * @category converting
 * @since 4.0.0
 */
export const refresh = <A>(self: Atom<A>): Effect.Effect<void, never, AtomRegistry> =>
  Effect.map(AtomRegistry, (_) => _.refresh(self))

/**
 * Mounts an atom in the `AtomRegistry` for the lifetime of the current scope.
 *
 * **Details**
 *
 * Mounting keeps the atom subscribed with a no-op listener until the scope
 * finalizer releases it.
 *
 * @category converting
 * @since 4.0.0
 */
export const mount = <A>(self: Atom<A>): Effect.Effect<void, never, AtomRegistry | Scope.Scope> =>
  AtomRegistry.use((r) => Registry.mount(r, self))

// -----------------------------------------------------------------------------
// Serializable
// -----------------------------------------------------------------------------

/**
 * The type id used to mark atoms that carry serialization metadata.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const SerializableTypeId: SerializableTypeId = '~effect-atom/atom/Atom/Serializable'

/**
 * The literal type of the serializable atom marker.
 *
 * @category type IDs
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
 * @category models
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
    readonly encode: (value: S['Type']) => SerializableJson
    readonly decode: (value: SerializableJson) => S['Type']
  }
}

/**
 * Returns `true` when an atom carries `Serializable` metadata.
 *
 * @category guards
 * @since 4.0.0
 */
export const isSerializable = (self: Atom<unknown>): self is Atom<unknown> & Serializable<Schema.Unknown> =>
  SerializableTypeId in self

/**
 * Attaches serialization metadata to an atom using a schema and stable key.
 *
 * **Details**
 *
 * The schema is converted to a JSON codec for synchronous encode/decode, and the
 * key is also used as the atom label when the atom does not already have one.
 *
 * @category combinators
 * @since 4.0.0
 */
export const serializable: {
  <R extends Atom<unknown>, S extends Schema.Constraint>(options: {
    readonly key: string
    readonly schema: S
  }): (self: R) => R & Serializable<S>
  <R extends Atom<unknown>, S extends Schema.Constraint>(self: R, options: {
    readonly key: string
    readonly schema: S
  }): R & Serializable<S>
} = dual(2, <R extends Atom<unknown>, A, I>(self: R, options: {
  readonly key: string
  readonly schema: Schema.ConstraintCodec<A, I>
}): R & Serializable<Schema.ConstraintCodec<A, I>> => {
  const codecJson = Schema.toCodecJson(options.schema)
  return copyAtomWithProto(self, {
    label: self.label ?? [options.key, new Error().stack?.split('\n')[5] ?? ''],
    [SerializableTypeId]: {
      key: options.key,
      encode: Schema.encodeSync(codecJson),
      decode: Schema.decodeSync(codecJson),
    },
  })
})

export { makeRefreshOnSignal, refreshOnWindowFocus, searchParam, windowFocusSignal } from './browser.js'
export { getServerValue, ServerValueTypeId, withServerValue, withServerValueInitial } from './server.js'
export type { ServerValue } from './server.js'
