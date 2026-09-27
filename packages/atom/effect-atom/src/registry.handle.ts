/**
 * Stores and runs atoms for one reactive runtime.
 *
 * A registry evaluates atoms, caches their current values, tracks
 * dependencies, applies writes and refreshes, manages subscriptions, and
 * disposes unused nodes. Each registry is independent, so the same atom can hold
 * different values in different registries. Serializable atom values can also be
 * preloaded before the first read.
 *
 * @since 4.0.0
 */
import { Handle } from '@systemfsoftware/effect-cell-types'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import { constVoid, dual, type LazyArg } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import { hasProperty } from 'effect/Predicate'
import * as Queue from 'effect/Queue'
import * as Schema from 'effect/Schema'
import * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import * as Result from './async-result.js'
import type { Failure, Success } from './async-result.js'
import type * as Atom from './atom.blueprint.js'
import {
  decodeHydrationEntry,
  type DehydratedAtomValue,
  encodeHydrationValue,
  encodeInitialMode,
  encodingCodecOf,
  type HydrationEntry,
  isInitialResult,
  isSettledResult,
  shouldAttachDeferred,
  shouldSkipInitial,
} from './hydration.schema.js'
import { RegistryImpl } from './registry-engine.js'

export { Current } from './current-registry.service.js'
export type { DehydratedAtom, DehydratedAtomValue, HydrationEntry } from './hydration.schema.js'

type AnyValue<A = unknown> = A

/**
 * The identity every registry handle carries.
 *
 * @since 4.0.0
 */
export const TypeId: unique symbol = Symbol.for('~effect-atom/atom/Registry')

/**
 * @since 4.0.0
 */
export type TypeId = typeof TypeId

const RegistryDef = Handle.make<Record<never, never>, RegistryImpl>()(TypeId)

/**
 * A handle to a running registry.
 *
 * **Details**
 *
 * The handle is a pipeable record minted by the registry kind; its data is
 * empty and its private slot holds the engine. Every operation is a `dual`
 * function in this module that forwards to the engine behind the handle. One
 * engine stores atom nodes, coordinates reads, writes, refreshes,
 * subscriptions, and disposal.
 *
 * @since 4.0.0
 */
export type Registry = Handle.Handle<TypeId, Record<never, never>, RegistryImpl>

/**
 * Returns `true` when the value is a registry handle.
 *
 * @since 4.0.0
 */
export const isRegistry = RegistryDef.is

const engineOf = (self: Registry): RegistryImpl => RegistryDef.slot(self)

const mintRegistry = (engine: RegistryImpl): Registry => RegistryDef.make({}, engine)

/**
 * A registry node for a single atom.
 *
 * **Details**
 *
 * Nodes expose the current value, parent and child dependency links, listener set,
 * and current lifecycle state.
 *
 * @since 4.0.0
 */
export interface Node<A = unknown> {
  readonly atom: Atom.Atom<A>
  readonly value: () => A
  /**
   * Read-only views of the registry's dependency graph. The registry mutates
   * these sets internally; consumers can inspect them but must not coordinate
   * through them.
   */
  readonly parents: ReadonlySet<Node>
  readonly children: ReadonlySet<Node>
  readonly listeners: ReadonlySet<() => void>
  currentState(): 'uninitialized' | 'stale' | 'valid' | 'removed'
}

type RegistryMakeOptions = {
  readonly initialValues?: Iterable<readonly [Atom.Atom, AnyValue]> | undefined
  readonly scheduleTask?: ((f: () => void) => () => void) | undefined
  readonly timeoutResolution?: number | undefined
  readonly defaultIdleTTL?: number | undefined
  readonly now?: (() => number) | undefined
  readonly scheduleTimer?: ((f: () => void, delayMillis: number) => () => void) | undefined
}

/**
 * Creates a registry handle backed by a fresh engine.
 *
 * **Details**
 *
 * Options can preload initial atom values, provide a custom task scheduler,
 * configure timeout bucket resolution, and set a default idle time-to-live for
 * unused atoms.
 *
 * @since 4.0.0
 */
export const make = (
  options?: RegistryMakeOptions,
): Registry => {
  if (options === undefined) {
    return new RegistryImpl(mintRegistry).handle
  }
  return new RegistryImpl(
    mintRegistry,
    options.initialValues,
    options.scheduleTask,
    options.timeoutResolution,
    options.defaultIdleTTL,
    options.now,
    options.scheduleTimer,
  ).handle
}

/**
 * Service tag for the registry evaluating an effect.
 *
 * **When to use**
 *
 * Use to access or provide the registry that stores atom values,
 * dependencies, subscriptions, and disposal state for a reactive lifetime.
 *
 * @since 4.0.0
 */

/**
 * A recorded serialization refusal: a value that could not be encoded while
 * dehydrating, or an external payload entry that could not be preloaded, with
 * the atom key it named (when one was legible) and the schema issue that
 * rejected it.
 *
 * @since 4.0.0
 */
export interface PreloadRefused {
  readonly key: string | undefined
  readonly issue: string
}

/**
 * Records a serialization refusal on the registry.
 *
 * @since 4.0.0
 */
export const recordRefusal: {
  (refusal: PreloadRefused): (self: Registry) => void
  (self: Registry, refusal: PreloadRefused): void
} = dual(2, (self: Registry, refusal: PreloadRefused): void => {
  engineOf(self).refusals().entries.push(refusal)
})

/**
 * Returns every serialization refusal recorded on the registry, oldest first.
 *
 * @since 4.0.0
 */
export const refusals = (self: Registry): ReadonlyArray<PreloadRefused> => {
  const engine = engineOf(self)
  return [...engine.refusals().entries]
}

/**
 * Creates a layer that provides a registry for the given service tag,
 * configured with the supplied options.
 *
 * **Details**
 *
 * The registry is disposed when the layer scope is finalized. Distinct tags
 * hold distinct registries at once; passing `Current` provides the registry
 * atom evaluations read.
 *
 * @since 4.0.0
 */
export const layer: {
  (options?: RegistryMakeOptions): <I>(tag: Context.Key<I, Registry>) => Layer.Layer<I>
  <I>(tag: Context.Key<I, Registry>, options?: RegistryMakeOptions): Layer.Layer<I>
} = dual(
  (args) => hasProperty(args[0], Context.ServiceTypeId),
  <I>(tag: Context.Key<I, Registry>, options?: RegistryMakeOptions): Layer.Layer<I> =>
    Layer.effect(
      tag,
      Effect.gen(function*() {
        const registry = make(options)
        const scope = yield* Effect.scope
        yield* Scope.addFinalizer(scope, Effect.sync(() => dispose(registry)))
        return registry
      }),
    ),
)

// -----------------------------------------------------------------------------
// operations
// -----------------------------------------------------------------------------

/**
 * The nodes currently held by a registry.
 *
 * @since 4.0.0
 */
export const getNodes = (self: Registry): ReadonlyMap<Atom.Atom | string, Node> => engineOf(self).getNodes()

/**
 * The current time according to the registry's clock.
 *
 * **Details**
 *
 * The clock is resolved once when the registry is built — from the fiber that
 * builds it, or the platform clock outside any fiber — so a registry on the
 * simulation kernel dehydrates with the kernel's time, not the wall clock.
 *
 * @since 4.0.0
 */
export const now = (self: Registry): number => engineOf(self).now()

/**
 * Reads the current value of an atom.
 *
 * @since 4.0.0
 */
export const get: {
  <A>(atom: Atom.Atom<A>): (self: Registry) => A
  <A>(self: Registry, atom: Atom.Atom<A>): A
} = dual(
  (args) => isRegistry(args[0]),
  <A>(self: Registry, atom: Atom.Atom<A>): A => engineOf(self).get(atom),
)

/**
 * Reads an atom from a registry through its `serverValue` target when one is
 * present, and falls back to the registry's own read otherwise.
 *
 * @since 4.0.0
 */
export const getServerValue: {
  (registry: Registry): <A>(self: Atom.Atom<A>) => A
  <A>(self: Atom.Atom<A>, registry: Registry): A
} = dual(
  2,
  <A>(self: Atom.Atom<A>, registry: Registry): A => {
    const read = self.serverValue
    if (read !== undefined) {
      return read((atom) => get(registry, atom))
    }
    return get(registry, self)
  },
)

/**
 * Returns the current value of an atom when its node has been initialized, without rebuilding a stale or uninitialized node.
 *
 * @since 4.0.0
 */
export const getRaw: {
  <A>(atom: Atom.Atom<A>): (self: Registry) => Option.Option<A>
  <A>(self: Registry, atom: Atom.Atom<A>): Option.Option<A>
} = dual(
  (args) => isRegistry(args[0]),
  <A>(self: Registry, atom: Atom.Atom<A>): Option.Option<A> => engineOf(self).getRaw(atom),
)

/**
 * Writes a value to a writable atom.
 *
 * @since 4.0.0
 */
export const set: {
  <R, W>(atom: Atom.Writable<R, W>, value: W): (self: Registry) => void
  <R, W>(self: Registry, atom: Atom.Writable<R, W>, value: W): void
} = dual(
  (args) => isRegistry(args[0]),
  <R, W>(self: Registry, atom: Atom.Writable<R, W>, value: W): void => engineOf(self).set(atom, value),
)

/**
 * Stores an encoded serializable value, applying it to the matching atom now
 * or when the atom is first read.
 *
 * @since 4.0.0
 */
export const setSerializable: {
  <T = unknown>(key: string, encoded: T): (self: Registry) => void
  <T = unknown>(self: Registry, key: string, encoded: T): void
} = dual(
  (args) => isRegistry(args[0]),
  <T = unknown>(self: Registry, key: string, encoded: T): void => engineOf(self).setSerializable(key, encoded),
)

/**
 * Preloads an atom's value before the atom is first read.
 *
 * @since 4.0.0
 */
export const setInitialValue: {
  <A>(atom: Atom.Atom<A>, value: A): (self: Registry) => void
  <A>(self: Registry, atom: Atom.Atom<A>, value: A): void
} = dual(
  (args) => isRegistry(args[0]),
  <A>(self: Registry, atom: Atom.Atom<A>, value: A): void => engineOf(self).setInitialValue(atom, value),
)

/**
 * Reads a writable atom, computes a return value and next write value, and writes the next value.
 *
 * @since 4.0.0
 */
type ModifyFunction<R, W, A> = (_: R) => [returnValue: A, nextValue: W]

export const modify: {
  <R, W, A>(atom: Atom.Writable<R, W>, f: ModifyFunction<R, W, A>): (self: Registry) => A
  <R, W, A>(self: Registry, atom: Atom.Writable<R, W>, f: ModifyFunction<R, W, A>): A
} = dual(
  (args) => isRegistry(args[0]),
  <R, W, A>(
    self: Registry,
    atom: Atom.Writable<R, W>,
    f: (_: R) => [returnValue: A, nextValue: W],
  ): A => engineOf(self).modify(atom, f),
)

/**
 * Reads a writable atom and writes the next value computed from the current one.
 *
 * @since 4.0.0
 */
export const update: {
  <R, W>(atom: Atom.Writable<R, W>, f: (_: R) => W): (self: Registry) => void
  <R, W>(self: Registry, atom: Atom.Writable<R, W>, f: (_: R) => W): void
} = dual(
  (args) => isRegistry(args[0]),
  <R, W>(self: Registry, atom: Atom.Writable<R, W>, f: (_: R) => W): void => engineOf(self).update(atom, f),
)

/**
 * Requests a refresh of an atom.
 *
 * @since 4.0.0
 */
export const refresh: {
  <A>(atom: Atom.Atom<A>): (self: Registry) => void
  <A>(self: Registry, atom: Atom.Atom<A>): void
} = dual(
  (args) => isRegistry(args[0]),
  <A>(self: Registry, atom: Atom.Atom<A>): void => engineOf(self).refresh(atom),
)

/**
 * Subscribes to an atom's changes and returns a function that removes the
 * subscription.
 *
 * @since 4.0.0
 */
export const subscribe: {
  <A>(
    atom: Atom.Atom<A>,
    f: (_: A) => void,
    options?: { readonly immediate?: boolean },
  ): (self: Registry) => () => void
  <A>(self: Registry, atom: Atom.Atom<A>, f: (_: A) => void, options?: {
    readonly immediate?: boolean
  }): () => void
} = dual(
  (args) => isRegistry(args[0]),
  <A>(self: Registry, atom: Atom.Atom<A>, f: (_: A) => void, options?: {
    readonly immediate?: boolean
  }): () => void => engineOf(self).subscribe(atom, f, options),
)

/**
 * Schedules a delayed callback through the registry's configured timer
 * scheduler and returns a function that cancels it.
 *
 * @since 4.0.0
 */
export const scheduleTimer: {
  (f: () => void, delayMillis: number): (self: Registry) => () => void
  (self: Registry, f: () => void, delayMillis: number): () => void
} = dual(
  (args) => isRegistry(args[0]),
  (self: Registry, f: () => void, delayMillis: number): () => void => engineOf(self).scheduleTimer(f, delayMillis),
)

/**
 * Removes every node from the registry and cancels its pending timers.
 *
 * @since 4.0.0
 */
export const reset = (self: Registry): void => engineOf(self).reset()

/**
 * Disposes the registry: pending work stops and further reads fail.
 *
 * @since 4.0.0
 */
export const dispose = (self: Registry): void => engineOf(self).dispose()

/**
 * Returns the value this registry stores under `key`, creating it with `make`
 * on first use. Storage belongs to the registry and is dropped when the
 * registry is disposed, so per-registry caches never outlive their registry.
 *
 * @since 4.0.0
 */
export const storage: {
  <I, A>(key: Context.Key<I, A>, make: LazyArg<A>): (self: Registry) => A
  <I, A>(self: Registry, key: Context.Key<I, A>, make: LazyArg<A>): A
} = dual(
  3,
  <I, A>(self: Registry, key: Context.Key<I, A>, make: LazyArg<A>): A => engineOf(self).storageFor(key, make),
)

// -----------------------------------------------------------------------------
// conversions
// -----------------------------------------------------------------------------

/**
 * Converts an atom in this registry into a stream.
 *
 * **Details**
 *
 * The stream emits the current value immediately, emits subsequent changes, and
 * unsubscribes from the registry when the stream scope closes.
 *
 * @since 4.0.0
 */
export const toStream: {
  <A>(atom: Atom.Atom<A>): (self: Registry) => Stream.Stream<A>
  <A>(self: Registry, atom: Atom.Atom<A>): Stream.Stream<A>
} = dual(
  2,
  <A>(self: Registry, atom: Atom.Atom<A>) =>
    Stream.callback<A>((queue) =>
      Effect.suspend(() => {
        const fiber = Fiber.getCurrent()
        if (fiber === undefined) {
          return Effect.die(new Error('Expected a current fiber when converting an atom to a stream'))
        }
        const scope = Context.getUnsafe(fiber.context, Scope.Scope)
        const cancel = engineOf(self).subscribe(atom, (value) => Queue.offerUnsafe(queue, value), {
          immediate: true,
        })
        return Scope.addFinalizer(scope, Effect.sync(cancel))
      })
    ),
)

function resultToEffect<A, E>(result: Success<A, E> | Failure<A, E>): Effect.Effect<A, E> {
  if (Result.isSuccess(result)) {
    return Effect.succeed(result.value)
  }
  return Effect.failCause(result.cause)
}

/**
 * Converts an `AsyncResult` atom in this registry into a stream of successful
 * values.
 *
 * **Details**
 *
 * Initial results are skipped, failures fail the stream with their cause, and
 * duplicate stream values are dropped with `Stream.changes`.
 *
 * @since 4.0.0
 */
export const toStreamResult: {
  <A, E>(atom: Atom.Atom<Result.Result<A, E>>): (self: Registry) => Stream.Stream<A, E>
  <A, E>(self: Registry, atom: Atom.Atom<Result.Result<A, E>>): Stream.Stream<A, E>
} = dual(
  2,
  <A, E>(self: Registry, atom: Atom.Atom<Result.Result<A, E>>): Stream.Stream<A, E> =>
    toStream(self, atom).pipe(
      Stream.filter(Result.isNotInitial),
      Stream.mapEffect(resultToEffect),
      Stream.changes,
    ),
)

function suspendOnWaitingFrom(options?: {
  readonly suspendOnWaiting?: boolean | undefined
}): boolean {
  if (options === undefined) {
    return false
  }
  return booleanOrFalse(options.suspendOnWaiting)
}

function booleanOrFalse(value: boolean | undefined): boolean {
  if (value === undefined) {
    return false
  }
  return value
}

function shouldWaitForNonInitial<A, E>(
  result: Success<A, E> | Failure<A, E>,
  suspendOnWaiting: boolean,
): boolean {
  if (suspendOnWaiting === false) {
    return false
  }
  return result.waiting
}

function resumeNonInitialIfSettled<A, E>(
  value: Success<A, E> | Failure<A, E>,
  suspendOnWaiting: boolean,
  resume: (effect: Effect.Effect<A, E>) => void,
  cancel: () => void,
): void {
  if (shouldWaitForNonInitial(value, suspendOnWaiting)) {
    return
  }
  resume(Result.toExit(value))
  cancel()
}

function onSubscribedResult<A, E>(
  value: Result.Result<A, E>,
  suspendOnWaiting: boolean,
  resume: (effect: Effect.Effect<A, E>) => void,
  cancel: () => void,
): void {
  if (Result.isInitial(value)) {
    return
  }
  resumeNonInitialIfSettled(value, suspendOnWaiting, resume, cancel)
}

function subscribeUntilSettled<A, E>(
  self: Registry,
  atom: Atom.Atom<Result.Result<A, E>>,
  suspendOnWaiting: boolean,
  resume: (effect: Effect.Effect<A, E>) => void,
): Effect.Effect<void> {
  const cancel = engineOf(self).subscribe(atom, (value) => {
    onSubscribedResult(value, suspendOnWaiting, resume, cancel)
  })
  return Effect.sync(cancel)
}

function resumeSettledOrSubscribe<A, E>(
  self: Registry,
  atom: Atom.Atom<Result.Result<A, E>>,
  result: Success<A, E> | Failure<A, E>,
  suspendOnWaiting: boolean,
  resume: (effect: Effect.Effect<A, E>) => void,
): void | Effect.Effect<void> {
  if (shouldWaitForNonInitial(result, suspendOnWaiting)) {
    return subscribeUntilSettled(self, atom, suspendOnWaiting, resume)
  }
  return resume(Result.toExit(result))
}

function getResultCallback<A, E>(
  self: Registry,
  atom: Atom.Atom<Result.Result<A, E>>,
  suspendOnWaiting: boolean,
  resume: (effect: Effect.Effect<A, E>) => void,
): void | Effect.Effect<void> {
  const result = engineOf(self).get(atom)
  if (Result.isInitial(result)) {
    return subscribeUntilSettled(self, atom, suspendOnWaiting, resume)
  }
  return resumeSettledOrSubscribe(self, atom, result, suspendOnWaiting, resume)
}

/**
 * Reads an `AsyncResult` atom from this registry as an effect.
 *
 * **Details**
 *
 * The effect waits for the result to leave `Initial`, and also waits through
 * waiting results when `suspendOnWaiting` is enabled.
 *
 * @since 4.0.0
 */
export const getResult: {
  <A, E>(atom: Atom.Atom<Result.Result<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): (self: Registry) => Effect.Effect<A, E>
  <A, E>(self: Registry, atom: Atom.Atom<Result.Result<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): Effect.Effect<A, E>
} = dual(
  (args) => isRegistry(args[0]),
  <A, E>(self: Registry, atom: Atom.Atom<Result.Result<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): Effect.Effect<A, E> => {
    const suspendOnWaiting = suspendOnWaitingFrom(options)
    return Effect.callback((resume) => getResultCallback(self, atom, suspendOnWaiting, resume))
  },
)

/**
 * Mounts an atom in this registry for the lifetime of the current scope.
 *
 * **Details**
 *
 * The atom is subscribed with a no-op listener and the subscription is released
 * when the scope finalizer runs.
 *
 * @since 4.0.0
 */
export const mount: {
  <A>(atom: Atom.Atom<A>): (self: Registry) => Effect.Effect<void, never, Scope.Scope>
  <A>(self: Registry, atom: Atom.Atom<A>): Effect.Effect<void, never, Scope.Scope>
} = dual(
  2,
  <A>(self: Registry, atom: Atom.Atom<A>) =>
    Effect.acquireRelease(
      Effect.sync(() => engineOf(self).mount(atom)),
      (release) => Effect.sync(release),
    ),
)

/**
 * Runs synchronous atom updates as a batch on one registry.
 *
 * **Details**
 *
 * Stale nodes are rebuilt and listeners are notified after the callback completes,
 * so dependent updates observe the final batched state.
 *
 * @since 4.0.0
 */
export const batch: {
  (f: () => void): (self: Registry) => void
  (self: Registry, f: () => void): void
} = dual(
  (args) => isRegistry(args[0]),
  (self: Registry, f: () => void): void => {
    engineOf(self).batchOn(f)
  },
)

// -----------------------------------------------------------------------------
// dehydrate / hydrate
// -----------------------------------------------------------------------------

type AnyAtom<A = unknown> = Atom.Atom<A>

const pendingResultKey = '~effect-atom/Hydration/pendingResult'

const readPendingResult = (entry: HydrationEntry): Option.Option<Deferred.Deferred<AnyValue>> =>
  Option.some(entry).pipe(
    Option.filter(hasProperty(pendingResultKey)),
    Option.map((withSlot) => withSlot[pendingResultKey]),
    Option.filter(Deferred.isDeferred<AnyValue, never>),
  )

const writePendingResult = (entry: DehydratedAtomValue, deferred: Deferred.Deferred<AnyValue>): void => {
  Object.defineProperty(entry, pendingResultKey, {
    value: deferred,
    enumerable: false,
    configurable: true,
    writable: false,
  })
}

/**
 * Encodes the serializable atoms currently stored in a registry into dehydrated
 * state.
 *
 * **Details**
 *
 * Only atoms marked with `Atom.serializable` are included. `encodeInitialAs`
 * controls whether `Result.Initial` values are ignored, encoded as values,
 * or carried as a pending update that completes when the atom leaves the
 * initial state.
 *
 * @since 4.0.0
 */
export const dehydrate: {
  (options?: {
    /**
     * How to encode `Result.Initial` values. Default is "ignore".
     */
    readonly encodeInitialAs?: 'ignore' | 'deferred' | 'value-only' | undefined
  }): (registry: Registry) => DehydratedAtomValue[]
  (
    registry: Registry,
    options?: {
      /**
       * How to encode `Result.Initial` values. Default is "ignore".
       */
      readonly encodeInitialAs?: 'ignore' | 'deferred' | 'value-only' | undefined
    },
  ): DehydratedAtomValue[]
} = dual(
  (args) => isRegistry(args[0]),
  (
    registry: Registry,
    options?: {
      readonly encodeInitialAs?: 'ignore' | 'deferred' | 'value-only' | undefined
    },
  ): DehydratedAtomValue[] => {
    const encodeInitialResultMode = encodeInitialMode(options)
    const arr: DehydratedAtomValue[] = []
    const dehydratedAt = now(registry)
    getNodes(registry).forEach((node, key) => {
      dehydrateNode(registry, node, key, encodeInitialResultMode, dehydratedAt, arr)
    })
    return arr
  },
)

const dehydrateNode = (
  registry: Registry,
  node: { readonly atom: AnyAtom; readonly value: () => AnyValue },
  key: AnyValue,
  encodeInitialResultMode: 'ignore' | 'deferred' | 'value-only',
  now: number,
  arr: DehydratedAtomValue[],
): void => {
  const serializer = node.atom.spec.serializable
  if (serializer === undefined) {
    return
  }
  dehydrateSerializable(
    registry,
    node.atom,
    serializer,
    node.value(),
    key,
    encodeInitialResultMode,
    now,
    arr,
  )
}

type Serializer = Atom.SerializableSpec

const dehydrateSerializable = (
  registry: Registry,
  atom: AnyAtom,
  serializer: Serializer,
  value: AnyValue,
  key: AnyValue,
  encodeInitialResultMode: 'ignore' | 'deferred' | 'value-only',
  now: number,
  arr: DehydratedAtomValue[],
): void => {
  const isInitial = isInitialResult(value)
  if (shouldSkipInitial(encodeInitialResultMode, isInitial)) {
    return
  }
  dehydrateKeyed(registry, atom, serializer, value, key, encodeInitialResultMode, isInitial, now, arr)
}

const encodeOrRefuse = (
  registry: Registry,
  serializer: Serializer,
  value: AnyValue,
): Option.Option<AnyValue> => {
  const codec = encodingCodecOf(serializer)
  if (codec === undefined) {
    return Option.none()
  }
  return encodeWithCodec(registry, serializer.key, codec, value)
}

const encodeWithCodec = (
  registry: Registry,
  key: string,
  codec: Schema.ConstraintEncoder<AnyValue>,
  value: AnyValue,
): Option.Option<AnyValue> => {
  const exit = encodeHydrationValue(codec, value)
  if (Exit.isSuccess(exit)) {
    return Option.some(exit.value)
  }
  refuseEncode(registry, key, exit.cause)
  return Option.none()
}

const refuseEncode = (registry: Registry, key: string, cause: Cause.Cause<Schema.SchemaError>): void => {
  const issue = Option.match(Cause.findErrorOption(cause), {
    onNone: () => 'value could not be encoded',
    onSome: (error) => error.message,
  })
  recordRefusal(registry, { key, issue })
}

const dehydrateKeyed = (
  registry: Registry,
  atom: AnyAtom,
  serializer: Serializer,
  value: AnyValue,
  key: AnyValue,
  encodeInitialResultMode: 'ignore' | 'deferred' | 'value-only',
  isInitial: boolean,
  now: number,
  arr: DehydratedAtomValue[],
): void => {
  if (typeof key !== 'string') {
    return
  }
  Option.match(encodeOrRefuse(registry, serializer, value), {
    onNone: constVoid,
    onSome: (encoded) => {
      const entry: DehydratedAtomValue = {
        '~effect/reactivity/DehydratedAtom': true,
        key,
        value: encoded,
        dehydratedAt: now,
      }
      attachDeferred(registry, atom, serializer, entry, encodeInitialResultMode, isInitial)
      arr.push(entry)
    },
  })
}

const attachDeferred = (
  registry: Registry,
  atom: AnyAtom,
  serializer: Serializer,
  entry: DehydratedAtomValue,
  encodeInitialResultMode: 'ignore' | 'deferred' | 'value-only',
  isInitial: boolean,
): void => {
  if (!shouldAttachDeferred(encodeInitialResultMode, isInitial)) {
    return
  }
  const deferred = Deferred.makeUnsafe<AnyValue>()
  const unsubscribe = subscribe(registry, atom, (newValue) => {
    completeDeferred(registry, deferred, unsubscribe, serializer, newValue)
  })
  writePendingResult(entry, deferred)
}

const completeDeferred = (
  registry: Registry,
  deferred: Deferred.Deferred<AnyValue>,
  unsubscribe: () => void,
  serializer: Serializer,
  newValue: AnyValue,
): void => {
  if (!isSettledResult(newValue)) {
    return
  }
  unsubscribe()
  Deferred.doneUnsafe(
    deferred,
    Option.match(encodeOrRefuse(registry, serializer, newValue), {
      onNone: () => Effect.interrupt,
      onSome: Effect.succeed,
    }),
  )
}

/**
 * Applies dehydrated atom state to a registry.
 *
 * **When to use**
 *
 * Use to preload serialized atom values into a target registry before those
 * atoms are read.
 *
 * **Details**
 *
 * Encoded values are preloaded by serialization key. Entries whose initial
 * state was carried as pending (see `dehydrate`'s `encodeInitialAs`) update the
 * matching registry node, or preload the resolved value, when that pending
 * value completes.
 *
 * Returns a fiber that completes once every pending update has been applied to
 * the registry. Callers that need the state fully settled — tests, SSR flushes
 * — can join it; fire-and-forget callers can ignore it.
 *
 * @since 4.0.0
 */

export const hydrate: {
  (dehydratedState: Iterable<HydrationEntry>): (registry: Registry) => Fiber.Fiber<void, never>
  (registry: Registry, dehydratedState: Iterable<HydrationEntry>): Fiber.Fiber<void, never>
} = dual(
  2,
  (registry: Registry, dehydratedState: Iterable<HydrationEntry>): Fiber.Fiber<void, never> => {
    const pending: Effect.Effect<void>[] = []
    for (const entry of dehydratedState) {
      hydrateOne(registry, pending, entry)
    }
    return Effect.runFork(Effect.forEach(pending, (effect) => effect, { discard: true }))
  },
)

const refuseMalformedEntry = (
  registry: Registry,
  cause: Cause.Cause<Schema.SchemaError>,
): void => {
  const found = Cause.findErrorOption(cause)
  const issue = Option.match(found, {
    onNone: () => 'entry is not a dehydrated atom value',
    onSome: (error) => error.message,
  })
  recordRefusal(registry, { key: undefined, issue })
}

const queuePendingResult = (
  registry: Registry,
  pending: Effect.Effect<void>[],
  datom: DehydratedAtomValue,
  result: Deferred.Deferred<AnyValue>,
): void => {
  pending.push(
    Deferred.await(result).pipe(
      Effect.exit,
      Effect.map(Exit.match({
        onFailure: constVoid,
        onSuccess: (resolvedValue) => setSerializable(registry, datom.key, resolvedValue),
      })),
    ),
  )
}

const applyDecodedEntry = (
  registry: Registry,
  pending: Effect.Effect<void>[],
  datom: DehydratedAtomValue,
  entry: HydrationEntry,
): void => {
  setSerializable(registry, datom.key, datom.value)
  Option.match(readPendingResult(entry), {
    onNone: constVoid,
    onSome: (result) => queuePendingResult(registry, pending, datom, result),
  })
}

const hydrateOne = (
  registry: Registry,
  pending: Effect.Effect<void>[],
  entry: HydrationEntry,
): void => {
  const exit = decodeHydrationEntry(entry)
  if (Exit.isSuccess(exit)) {
    applyDecodedEntry(registry, pending, exit.value, entry)
    return
  }
  refuseMalformedEntry(registry, exit.cause)
}
