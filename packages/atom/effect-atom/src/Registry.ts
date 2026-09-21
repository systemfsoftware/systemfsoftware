/**
 * Stores and runs atoms for one reactive runtime.
 *
 * An `AtomRegistry` evaluates atoms, caches their current values, tracks
 * dependencies, applies writes and refreshes, manages subscriptions, and
 * disposes unused nodes. Each registry is independent, so the same atom can hold
 * different values in different registries. Serializable atom values can also be
 * preloaded before the first read.
 *
 * @since 4.0.0
 */
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import { constVoid, dual } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Pipeable from 'effect/Pipeable'
import { hasProperty } from 'effect/Predicate'
import * as Queue from 'effect/Queue'
import type { Scheduler, SchedulerDispatcher } from 'effect/Scheduler'
import { MixedScheduler } from 'effect/Scheduler'
import * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import type * as Atom from './Atom.js'
import { NodeImpl, runInternalBatch } from './AtomNode.js'
import { hostNow, hostScheduleTimer } from './internal/HostTimer.js'
import * as Result from './Result.js'
import type { Failure, Success } from './Result.js'

/**
 * The literal type used to identify `AtomRegistry` services and values.
 *
 * @since 4.0.0
 */
export type TypeId = '~effect-atom/atom/Registry'

/**
 * The runtime type id used to identify `AtomRegistry` services and values.
 *
 * @since 4.0.0
 */
export const TypeId: TypeId = '~effect-atom/atom/Registry'

/**
 * Returns `true` when the value has the `AtomRegistry` type id.
 *
 * @since 4.0.0
 */
export const isAtomRegistry = (u: unknown): u is Registry => hasProperty(u, TypeId)

/**
 * The runtime registry that stores atom nodes and coordinates reads, writes,
 * refreshes, subscriptions, and disposal.
 *
 * **Details**
 *
 * It also manages scheduler configuration, serializable preloaded values, and node
 * addition/removal callbacks.
 *
 * @since 4.0.0
 */
export interface Registry {
  readonly [TypeId]: TypeId
  readonly scheduler: Scheduler
  readonly schedulerAsync: Scheduler
  /**
   * The clock and delayed-callback scheduler every time-dependent atom on this
   * registry reads. Supplied to `make`, so one substitution drives idle-TTL
   * eviction, `Atom.debounce` and `Atom.swr` staleness together.
   */
  readonly now: () => number
  readonly scheduleTimer: (f: () => void, delayMillis: number) => () => void
  readonly getNodes: () => ReadonlyMap<Atom.Atom<unknown> | string, Node<unknown>>
  readonly get: <A>(atom: Atom.Atom<A>) => A
  /**
   * Returns the current value of an atom when its node has been initialized, without rebuilding a stale or uninitialized node.
   *
   * @since 4.0.0
   */
  readonly getRaw: <A>(atom: Atom.Atom<A>) => Option.Option<A>
  readonly mount: <A>(atom: Atom.Atom<A>) => () => void
  readonly refresh: <A>(atom: Atom.Atom<A>) => void
  readonly set: <R, W>(atom: Atom.Writable<R, W>, value: W) => void
  readonly setSerializable: (key: string, encoded: unknown) => void
  readonly setInitialValue: <A>(atom: Atom.Atom<A>, value: A) => void
  readonly modify: <R, W, A>(atom: Atom.Writable<R, W>, f: (_: R) => [returnValue: A, nextValue: W]) => A
  readonly update: <R, W>(atom: Atom.Writable<R, W>, f: (_: R) => W) => void
  readonly subscribe: <A>(atom: Atom.Atom<A>, f: (_: A) => void, options?: {
    readonly immediate?: boolean
  }) => () => void
  readonly reset: () => void
  readonly dispose: () => void
  onNodeAdded?: ((node: Node<unknown>) => void) | undefined
  onNodeRemoved?: ((node: Node<unknown>) => void) | undefined
}

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
export interface Node<A> {
  readonly atom: Atom.Atom<A>
  readonly value: () => A
  /**
   * Read-only views of the registry's dependency graph. The registry mutates
   * these sets internally; consumers can inspect them but must not coordinate
   * through them.
   */
  readonly parents: ReadonlySet<Node<unknown>>
  readonly children: ReadonlySet<Node<unknown>>
  readonly listeners: ReadonlySet<() => void>
  currentState(): 'uninitialized' | 'stale' | 'valid' | 'removed'
}

type RegistryMakeOptions = {
  readonly initialValues?: Iterable<readonly [Atom.Atom<unknown>, unknown]> | undefined
  readonly scheduleTask?: ((f: () => void) => () => void) | undefined
  readonly timeoutResolution?: number | undefined
  readonly defaultIdleTTL?: number | undefined
  readonly now?: (() => number) | undefined
  readonly scheduleTimer?: ((f: () => void, delayMillis: number) => () => void) | undefined
}

/**
 * Creates an `AtomRegistry`.
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
    return new RegistryImpl()
  }
  return new RegistryImpl(
    options.initialValues,
    options.scheduleTask,
    options.timeoutResolution,
    options.defaultIdleTTL,
    options.now,
    options.scheduleTimer,
  )
}

/**
 * Service tag for the active atom runtime cache.
 *
 * **When to use**
 *
 * Use to access or provide the registry that stores atom values,
 * dependencies, subscriptions, and disposal state for a reactive lifetime.
 *
 * @since 4.0.0
 */
export class AtomRegistry extends Context.Service<AtomRegistry, Registry>()(TypeId) {}

/**
 * Creates a layer that provides an `AtomRegistry` configured with the supplied
 * options.
 *
 * **Details**
 *
 * The registry is disposed when the layer scope is finalized.
 *
 * @since 4.0.0
 */
export const layerOptions = (options?: RegistryMakeOptions): Layer.Layer<AtomRegistry> =>
  Layer.effect(
    AtomRegistry,
    Effect.gen(function*() {
      const scope = yield* Effect.scope
      const registry = make(options)
      yield* Scope.addFinalizer(scope, Effect.sync(() => registry.dispose()))
      return registry
    }),
  )

/**
 * The default layer that provides a fresh `AtomRegistry`.
 *
 * @since 4.0.0
 */
export const layer: Layer.Layer<AtomRegistry> = layerOptions()

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
        const cancel = self.subscribe(atom, (value) => Queue.offerUnsafe(queue, value), {
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
  const cancel = self.subscribe(atom, (value) => {
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
  const result = self.get(atom)
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
  (args) => isAtomRegistry(args[0]),
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
      Effect.sync(() => self.mount(atom)),
      (release) => Effect.sync(release),
    ),
)

// -----------------------------------------------------------------------------
// internal
// -----------------------------------------------------------------------------

const constImmediate = { immediate: true }

const SerializableTypeId: Atom.SerializableTypeId = '~effect-atom/atom/Atom/Serializable'

/**
 * The serializable-atom shape this module reads. `Atom` is imported type-only
 * here (a value import would cycle back through the registry), so the
 * `Atom.isSerializable` discriminant is re-stated as a local guard.
 */
interface SerializableAtom {
  readonly [SerializableTypeId]: {
    readonly key: string
    readonly decode: (encoded: unknown) => unknown
  }
}

const isSerializableAtom = (atom: Atom.Atom<unknown>): atom is Atom.Atom<unknown> & SerializableAtom =>
  SerializableTypeId in atom

function atomKey<A>(atom: Atom.Atom<A>): Atom.Atom<A> | string {
  if (isSerializableAtom(atom)) {
    return atom[SerializableTypeId].key
  }
  return atom
}

/**
 * Nodes are stored in one heterogeneous map keyed by `atomKey`. A node found
 * under an atom's key is that atom's own node, so key equality re-establishes
 * the erased `A` type across the map boundary.
 */
const isNodeImplFor = <A>(atom: Atom.Atom<A>, node: NodeImpl<unknown>): node is NodeImpl<A> =>
  atomKey(node.atom) === atomKey(atom)

type TimeoutBucket = readonly [nodes: Set<NodeImpl<unknown>>, cancel: () => void]

function nowOrHost(now: (() => number) | undefined): () => number {
  if (now === undefined) {
    return hostNow
  }
  return now
}

function scheduleTimerOrHost(
  scheduleTimer: ((f: () => void, delayMillis: number) => () => void) | undefined,
): (f: () => void, delayMillis: number) => () => void {
  if (scheduleTimer === undefined) {
    return hostScheduleTimer
  }
  return scheduleTimer
}

function timeoutResolutionFromIdleTTL(defaultIdleTTL: number | undefined): number {
  if (defaultIdleTTL === undefined) {
    return 1000
  }
  return Math.round(defaultIdleTTL / 2)
}

function resolveTimeoutResolution(
  timeoutResolution: number | undefined,
  defaultIdleTTL: number | undefined,
): number {
  if (timeoutResolution === undefined) {
    return timeoutResolutionFromIdleTTL(defaultIdleTTL)
  }
  return timeoutResolution
}

function applyInitialValues(
  registry: RegistryImpl,
  initialValues: Iterable<readonly [Atom.Atom<unknown>, unknown]> | undefined,
): void {
  if (initialValues === undefined) {
    return
  }
  setEachInitialValue(registry, initialValues)
}

function setEachInitialValue(
  registry: RegistryImpl,
  initialValues: Iterable<readonly [Atom.Atom<unknown>, unknown]>,
): void {
  for (const [atom, value] of initialValues) {
    registry.setInitialValue(atom, value)
  }
}

function resolveInitialValueTarget<A>(atom: Atom.Atom<A>): Atom.Atom<A> {
  let target = atom
  while (target.initialValueTarget !== undefined) {
    target = target.initialValueTarget
  }
  return target
}

function valueOptionIfForAtom<A>(atom: Atom.Atom<A>, node: NodeImpl<unknown>): Option.Option<A> {
  if (isNodeImplFor(atom, node) === false) {
    return Option.none()
  }
  return node.valueOption()
}

function applyDecodedSerializable(
  registry: RegistryImpl,
  node: NodeImpl<unknown>,
  atom: Atom.Atom<unknown> & SerializableAtom,
  encoded: unknown,
): void {
  let decoded: unknown
  try {
    decoded = atom[SerializableTypeId].decode(encoded)
  } catch {
    return
  }
  assignDecodedSerializable(registry, node, atom, decoded)
}

function assignDecodedSerializable(
  registry: RegistryImpl,
  node: NodeImpl<unknown>,
  atom: Atom.Atom<unknown>,
  decoded: unknown,
): void {
  const target = resolveInitialValueTarget(atom)
  if (target === atom) {
    node.setValue(decoded)
    return
  }
  registry.ensureNode(target).setInitialValue(decoded)
}

function applySerializableValue(
  registry: RegistryImpl,
  node: NodeImpl<unknown>,
  encoded: unknown,
): void {
  const atom = node.atom
  if (isSerializableAtom(atom) === false) {
    return
  }
  applyDecodedSerializable(registry, node, atom, encoded)
}

function notifyIfImmediate<A>(
  node: NodeImpl<A>,
  f: (_: A) => void,
  options: { readonly immediate?: boolean } | undefined,
): void {
  if (options === undefined) {
    return
  }
  notifyIfImmediateFlag(node, f, options.immediate)
}

function notifyIfImmediateFlag<A>(
  node: NodeImpl<A>,
  f: (_: A) => void,
  immediate: boolean | undefined,
): void {
  if (immediate === true) {
    f(node.value())
  }
}

function atomIdleTtlIsActive(registry: RegistryImpl, atom: Atom.Atom<unknown>): boolean {
  if (atom.idleTTL === 0) {
    return false
  }
  return hasIdleTtl(registry, atom)
}

function hasIdleTtl(registry: RegistryImpl, atom: Atom.Atom<unknown>): boolean {
  if (atom.idleTTL !== undefined) {
    return true
  }
  return registry.defaultIdleTTL !== undefined
}

function notifyNodeAdded(registry: RegistryImpl, node: NodeImpl<unknown>): void {
  if (registry.onNodeAdded === undefined) {
    return
  }
  registry.onNodeAdded(node)
}

function notifyNodeRemoved(registry: RegistryImpl, node: NodeImpl<unknown>): void {
  if (registry.onNodeRemoved === undefined) {
    return
  }
  registry.onNodeRemoved(node)
}

function createAndStoreNode<A>(
  registry: RegistryImpl,
  atom: Atom.Atom<A>,
  key: Atom.Atom<A> | string,
): NodeImpl<A> {
  const node = registry.createNode(atom)
  registry.nodes.set(key, node)
  notifyNodeAdded(registry, node)
  return node
}

function existingOrCreateNode<A>(
  registry: RegistryImpl,
  atom: Atom.Atom<A>,
  key: Atom.Atom<A> | string,
  existing: NodeImpl<unknown>,
): NodeImpl<A> {
  if (isNodeImplFor(atom, existing)) {
    return reuseExistingNode(registry, atom, existing)
  }
  return createAndStoreNode(registry, atom, key)
}

function reuseExistingNode<A>(
  registry: RegistryImpl,
  atom: Atom.Atom<A>,
  existing: NodeImpl<A>,
): NodeImpl<A> {
  if (registry.atomHasTtl(atom)) {
    registry.removeNodeTimeout(existing)
  }
  return existing
}

function nodeForKey<A>(
  registry: RegistryImpl,
  atom: Atom.Atom<A>,
  key: Atom.Atom<A> | string,
): NodeImpl<A> {
  const existing = registry.nodes.get(key)
  if (existing === undefined) {
    return createAndStoreNode(registry, atom, key)
  }
  return existingOrCreateNode(registry, atom, key, existing)
}

function applyPreloadedIfStringKey<A>(
  registry: RegistryImpl,
  node: NodeImpl<A>,
  key: Atom.Atom<A> | string,
): void {
  if (typeof key !== 'string') {
    return
  }
  applyPreloadedSerializable(registry, node, key)
}

function applyPreloadedSerializable(
  registry: RegistryImpl,
  node: NodeImpl<unknown>,
  key: string,
): void {
  if (registry.preloadedSerializable.has(key) === false) {
    return
  }
  const encoded = registry.preloadedSerializable.get(key)
  registry.preloadedSerializable.delete(key)
  applySerializableValue(registry, node, encoded)
}

function atomLabel<A>(atom: Atom.Atom<A>): string {
  if (atom.label === undefined) {
    return 'unknown'
  }
  return atom.label[0]
}

function throwIfDisposed<A>(registry: RegistryImpl, atom: Atom.Atom<A>): void {
  if (registry.disposed) {
    throw new Error(`Cannot access Atom ${atomLabel(atom)}: registry is disposed`)
  }
}

function scheduleRemovalUnlessKeepAlive<A>(registry: RegistryImpl, atom: Atom.Atom<A>): void {
  if (atom.keepAlive) {
    return
  }
  registry.scheduleAtomRemoval(atom)
}

function removeNodeIfCanBeRemoved(registry: RegistryImpl, node: NodeImpl<unknown>): void {
  if (node.canBeRemoved) {
    registry.removeNode(node)
  }
}

function removeAtomIfIdle(registry: RegistryImpl, atom: Atom.Atom<unknown>): void {
  const node = registry.nodes.get(atomKey(atom))
  if (node === undefined) {
    return
  }
  removeNodeIfCanBeRemoved(registry, node)
}

function evictNode(registry: RegistryImpl, node: NodeImpl<unknown>): void {
  registry.nodes.delete(atomKey(node.atom))
  node.remove()
  notifyNodeRemoved(registry, node)
}

function evictNodeIfIdle(registry: RegistryImpl, node: NodeImpl<unknown>): void {
  if (node.canBeRemoved) {
    evictNode(registry, node)
  }
}

function idleTtlOf(atom: Atom.Atom<unknown>, defaultIdleTTL: number | undefined): number | undefined {
  if (atom.idleTTL === undefined) {
    return defaultIdleTTL
  }
  return atom.idleTTL
}

function remainingAfterSweep(
  registry: RegistryImpl,
  node: NodeImpl<unknown>,
  nodeIdleTTL: number,
  currentSweepTTL: number,
): number | undefined {
  const idleTTL = nodeIdleTTL - currentSweepTTL
  if (idleTTL <= 0) {
    evictNodeIfIdle(registry, node)
    return undefined
  }
  return idleTTL
}

function remainingIdleTtl(
  registry: RegistryImpl,
  node: NodeImpl<unknown>,
  nodeIdleTTL: number,
  currentSweepTTL: number | null,
): number | undefined {
  if (currentSweepTTL === null) {
    return nodeIdleTTL
  }
  return remainingAfterSweep(registry, node, nodeIdleTTL, currentSweepTTL)
}

function timeoutBucketFor(registry: RegistryImpl, idleTTL: number): number {
  const ttl = Math.ceil(idleTTL / registry.timeoutResolution) * registry.timeoutResolution
  const timestamp = registry.now() + ttl
  return timestamp - (timestamp % registry.timeoutResolution) + registry.timeoutResolution
}

function createTimeoutBucket(registry: RegistryImpl, bucket: number): TimeoutBucket {
  const nodes = new Set<NodeImpl<unknown>>()
  const cancel = registry.scheduleTimer(() => registry.sweepBucket(bucket), bucket - registry.now())
  const entry: TimeoutBucket = [nodes, cancel]
  registry.timeoutBuckets.set(bucket, entry)
  return entry
}

function ensureTimeoutBucket(registry: RegistryImpl, bucket: number): TimeoutBucket {
  const existing = registry.timeoutBuckets.get(bucket)
  if (existing !== undefined) {
    return existing
  }
  return createTimeoutBucket(registry, bucket)
}

function addNodeToTimeoutBucket(registry: RegistryImpl, node: NodeImpl<unknown>, idleTTL: number): void {
  const bucket = timeoutBucketFor(registry, idleTTL)
  const entry = ensureTimeoutBucket(registry, bucket)
  entry[0].add(node)
  registry.nodeTimeoutBucket.set(node, bucket)
}

function dropNodeFromTimeoutBucket(
  registry: RegistryImpl,
  node: NodeImpl<unknown>,
  bucket: number,
): void {
  const entry = registry.timeoutBuckets.get(bucket)
  if (entry === undefined) {
    return
  }
  removeNodeFromBucketEntry(registry, node, bucket, entry)
}

function removeNodeFromBucketEntry(
  registry: RegistryImpl,
  node: NodeImpl<unknown>,
  bucket: number,
  entry: TimeoutBucket,
): void {
  const [nodes, cancel] = entry
  nodes.delete(node)
  if (nodes.size === 0) {
    cancel()
    registry.timeoutBuckets.delete(bucket)
  }
}

/**
 * Concrete registry used by the package implementation.
 */
export class RegistryImpl extends Pipeable.Class implements Registry {
  readonly [TypeId]: TypeId
  readonly timeoutResolution: number
  readonly defaultIdleTTL: number | undefined
  readonly scheduler: Scheduler
  readonly schedulerAsync: Scheduler
  readonly dispatcher: SchedulerDispatcher
  readonly now: () => number
  readonly scheduleTimer: (f: () => void, delayMillis: number) => () => void
  onNodeAdded?: ((node: Node<unknown>) => void) | undefined
  onNodeRemoved?: ((node: Node<unknown>) => void) | undefined

  constructor(
    initialValues?: Iterable<readonly [Atom.Atom<unknown>, unknown]>,
    scheduleTask?: (cb: () => void) => () => void,
    timeoutResolution?: number,
    defaultIdleTTL?: number,
    now?: () => number,
    scheduleTimer?: (f: () => void, delayMillis: number) => () => void,
  ) {
    super()
    this[TypeId] = TypeId
    this.scheduler = new MixedScheduler('sync', scheduleTask)
    this.schedulerAsync = new MixedScheduler('async', scheduleTask)
    this.dispatcher = this.schedulerAsync.makeDispatcher()
    this.defaultIdleTTL = defaultIdleTTL
    this.now = nowOrHost(now)
    this.scheduleTimer = scheduleTimerOrHost(scheduleTimer)
    this.timeoutResolution = resolveTimeoutResolution(timeoutResolution, defaultIdleTTL)
    applyInitialValues(this, initialValues)
  }

  setInitialValue<A>(atom: Atom.Atom<A>, value: A): void {
    this.ensureNode(resolveInitialValueTarget(atom)).setInitialValue(value)
  }

  readonly nodes = new Map<Atom.Atom<unknown> | string, NodeImpl<unknown>>()
  readonly preloadedSerializable = new Map<string, unknown>()
  readonly timeoutBuckets = new Map<number, TimeoutBucket>()
  readonly nodeTimeoutBucket = new Map<NodeImpl<unknown>, number>()
  disposed = false

  getNodes() {
    return this.nodes
  }

  get<A>(atom: Atom.Atom<A>): A {
    return this.ensureNode(atom).value()
  }

  getRaw<A>(atom: Atom.Atom<A>): Option.Option<A> {
    const node = this.nodes.get(atomKey(atom))
    if (node === undefined) {
      return Option.none()
    }
    return valueOptionIfForAtom(atom, node)
  }

  set<R, W>(atom: Atom.Writable<R, W>, value: W): void {
    atom.write(this.ensureNode(atom).writeContext, value)
  }

  setSerializable(key: string, encoded: unknown): void {
    const node = this.nodes.get(key)
    if (node === undefined) {
      this.preloadedSerializable.set(key, encoded)
      return
    }
    applySerializableValue(this, node, encoded)
  }

  modify<R, W, A>(atom: Atom.Writable<R, W>, f: (_: R) => [returnValue: A, nextValue: W]): A {
    const node = this.ensureNode(atom)
    const result = f(node.value())
    atom.write(node.writeContext, result[1])
    return result[0]
  }

  update<R, W>(atom: Atom.Writable<R, W>, f: (_: R) => W): void {
    const node = this.ensureNode(atom)
    atom.write(node.writeContext, f(node.value()))
  }

  refresh = <A>(atom: Atom.Atom<A>): void => {
    if (atom.refresh !== undefined) {
      atom.refresh(this.refresh)
    } else {
      this.invalidateAtom(atom)
    }
  }

  subscribe<A>(atom: Atom.Atom<A>, f: (_: A) => void, options?: { readonly immediate?: boolean }): () => void {
    const node = this.ensureNode(atom)
    notifyIfImmediate(node, f, options)
    const remove = node.subscribe(function() {
      f(node._value)
    })
    return () => {
      remove()
      if (node.canBeRemoved) {
        this.scheduleNodeRemoval(node)
      }
    }
  }

  mount<A>(atom: Atom.Atom<A>) {
    return this.subscribe(atom, constVoid, constImmediate)
  }

  atomHasTtl(atom: Atom.Atom<unknown>): boolean {
    if (atom.keepAlive) {
      return false
    }
    return atomIdleTtlIsActive(this, atom)
  }

  ensureNode<A>(atom: Atom.Atom<A>): NodeImpl<A> {
    const key = atomKey(atom)
    const node = nodeForKey(this, atom, key)
    applyPreloadedIfStringKey(this, node, key)
    return node
  }

  createNode<A>(atom: Atom.Atom<A>): NodeImpl<A> {
    throwIfDisposed(this, atom)
    scheduleRemovalUnlessKeepAlive(this, atom)
    return new NodeImpl(this, atom)
  }

  invalidateAtom = <A>(atom: Atom.Atom<A>): void => {
    this.ensureNode(atom).invalidate()
  }

  scheduleAtomRemoval(atom: Atom.Atom<unknown>): void {
    this.dispatcher.scheduleTask(() => {
      removeAtomIfIdle(this, atom)
    }, 0)
  }

  scheduleNodeRemoval(node: NodeImpl<unknown>): void {
    this.dispatcher.scheduleTask(() => {
      removeNodeIfCanBeRemoved(this, node)
    }, 0)
  }

  removeNode(node: NodeImpl<unknown>): void {
    if (this.atomHasTtl(node.atom)) {
      this.setNodeTimeout(node)
      return
    }
    evictNode(this, node)
  }

  setNodeTimeout(node: NodeImpl<unknown>): void {
    if (this.nodeTimeoutBucket.has(node)) {
      return
    }
    this.setNodeTimeoutIfIdle(node)
  }

  private setNodeTimeoutIfIdle(node: NodeImpl<unknown>): void {
    const nodeIdleTTL = idleTtlOf(node.atom, this.defaultIdleTTL)
    if (nodeIdleTTL === undefined) {
      return
    }
    this.scheduleOrEvictIdleNode(node, nodeIdleTTL)
  }

  private scheduleOrEvictIdleNode(node: NodeImpl<unknown>, nodeIdleTTL: number): void {
    const remaining = remainingIdleTtl(this, node, nodeIdleTTL, this.#currentSweepTTL)
    if (remaining === undefined) {
      return
    }
    addNodeToTimeoutBucket(this, node, remaining)
  }

  removeNodeTimeout(node: NodeImpl<unknown>): void {
    const bucket = this.nodeTimeoutBucket.get(node)
    if (bucket === undefined) {
      return
    }
    this.nodeTimeoutBucket.delete(node)
    this.scheduleNodeRemoval(node)
    dropNodeFromTimeoutBucket(this, node, bucket)
  }

  #currentSweepTTL: number | null = null
  sweepBucket(bucket: number): void {
    const entry = this.timeoutBuckets.get(bucket)
    if (entry === undefined) {
      return
    }
    this.sweepBucketEntry(bucket, entry)
  }

  private sweepBucketEntry(bucket: number, entry: TimeoutBucket): void {
    this.timeoutBuckets.delete(bucket)
    entry[0].forEach((node) => {
      this.sweepIdleNode(node)
    })
  }

  private sweepIdleNode(node: NodeImpl<unknown>): void {
    this.nodeTimeoutBucket.delete(node)
    this.sweepIdleNodeIfRemovable(node)
  }

  private sweepIdleNodeIfRemovable(node: NodeImpl<unknown>): void {
    if (node.canBeRemoved === false) {
      return
    }
    this.sweepRemoveNode(node)
  }

  private sweepRemoveNode(node: NodeImpl<unknown>): void {
    this.nodes.delete(atomKey(node.atom))
    notifyNodeRemoved(this, node)
    this.removeNodeWithSweepTtl(node)
  }

  private removeNodeWithSweepTtl(node: NodeImpl<unknown>): void {
    this.assignSweepTtl(idleTtlOf(node.atom, this.defaultIdleTTL))
    node.remove()
    this.#currentSweepTTL = null
  }

  private assignSweepTtl(idleTTL: number | undefined): void {
    if (idleTTL === undefined) {
      return
    }
    this.#currentSweepTTL = idleTTL
  }

  reset(): void {
    this.timeoutBuckets.forEach(([, cancel]) => cancel())
    this.timeoutBuckets.clear()
    this.nodeTimeoutBucket.clear()

    this.nodes.forEach((node) => {
      node.remove()
      notifyNodeRemoved(this, node)
    })
    this.nodes.clear()
  }

  dispose(): void {
    this.disposed = true
    this.reset()
  }
}

export function batch(f: () => void): void {
  runInternalBatch(f)
}
