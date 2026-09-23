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
import { makeNode, type NodeImpl, runInternalBatch } from './AtomNode.js'
import { hostNow, hostScheduleTimer } from './internal/HostTimer.js'
import * as Result from './Result.js'
import type { Failure, Success } from './Result.js'

type AnyValue<A = unknown> = A

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
  readonly getNodes: () => ReadonlyMap<Atom.Atom | string, Node>
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
  readonly setSerializable: <T = unknown>(key: string, encoded: T) => void
  readonly setInitialValue: <A>(atom: Atom.Atom<A>, value: A) => void
  readonly modify: <R, W, A>(atom: Atom.Writable<R, W>, f: (_: R) => [returnValue: A, nextValue: W]) => A
  readonly update: <R, W>(atom: Atom.Writable<R, W>, f: (_: R) => W) => void
  readonly subscribe: <A>(atom: Atom.Atom<A>, f: (_: A) => void, options?: {
    readonly immediate?: boolean
  }) => () => void
  readonly reset: () => void
  readonly dispose: () => void
  onNodeAdded?: ((node: Node) => void) | undefined
  onNodeRemoved?: ((node: Node) => void) | undefined
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
    return makeRegistryImpl()
  }
  return makeRegistryImpl(
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
    readonly decode: (encoded: AnyValue) => AnyValue
  }
}

const isSerializableAtom = (atom: Atom.Atom): atom is Atom.Atom & SerializableAtom => SerializableTypeId in atom

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
const isNodeImplFor = <A>(atom: Atom.Atom<A>, node: NodeImpl): node is NodeImpl<A> =>
  atomKey(node.atom) === atomKey(atom)

type TimeoutBucket = readonly [nodes: Set<NodeImpl>, cancel: () => void]

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
  initialValues: Iterable<readonly [Atom.Atom, AnyValue]> | undefined,
): void {
  if (initialValues === undefined) {
    return
  }
  setEachInitialValue(registry, initialValues)
}

function setEachInitialValue(
  registry: RegistryImpl,
  initialValues: Iterable<readonly [Atom.Atom, AnyValue]>,
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

function valueOptionIfForAtom<A>(atom: Atom.Atom<A>, node: NodeImpl): Option.Option<A> {
  if (isNodeImplFor(atom, node) === false) {
    return Option.none()
  }
  return node.valueOption()
}

function applyDecodedSerializable(
  registry: RegistryImpl,
  node: NodeImpl,
  atom: Atom.Atom & SerializableAtom,
  encoded: AnyValue,
): void {
  let decoded: AnyValue
  try {
    decoded = atom[SerializableTypeId].decode(encoded)
  } catch {
    return
  }
  assignDecodedSerializable(registry, node, atom, decoded)
}

function assignDecodedSerializable(
  registry: RegistryImpl,
  node: NodeImpl,
  atom: Atom.Atom,
  decoded: AnyValue,
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
  node: NodeImpl,
  encoded: AnyValue,
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

function atomIdleTtlIsActive(registry: RegistryImpl, atom: Atom.Atom): boolean {
  if (atom.idleTTL === 0) {
    return false
  }
  return hasIdleTtl(registry, atom)
}

function hasIdleTtl(registry: RegistryImpl, atom: Atom.Atom): boolean {
  if (atom.idleTTL !== undefined) {
    return true
  }
  return registry.defaultIdleTTL !== undefined
}

function notifyNodeAdded(registry: RegistryImpl, node: NodeImpl): void {
  if (registry.onNodeAdded === undefined) {
    return
  }
  registry.onNodeAdded(node)
}

function notifyNodeRemoved(registry: RegistryImpl, node: NodeImpl): void {
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
  existing: NodeImpl,
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
  node: NodeImpl,
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

function removeNodeIfCanBeRemoved(registry: RegistryImpl, node: NodeImpl): void {
  if (node.canBeRemoved) {
    registry.removeNode(node)
  }
}

function removeAtomIfIdle(registry: RegistryImpl, atom: Atom.Atom): void {
  const node = registry.nodes.get(atomKey(atom))
  if (node === undefined) {
    return
  }
  removeNodeIfCanBeRemoved(registry, node)
}

function evictNode(registry: RegistryImpl, node: NodeImpl): void {
  registry.nodes.delete(atomKey(node.atom))
  node.remove()
  notifyNodeRemoved(registry, node)
}

function evictNodeIfIdle(registry: RegistryImpl, node: NodeImpl): void {
  if (node.canBeRemoved) {
    evictNode(registry, node)
  }
}

function idleTtlOf(atom: Atom.Atom, defaultIdleTTL: number | undefined): number | undefined {
  if (atom.idleTTL === undefined) {
    return defaultIdleTTL
  }
  return atom.idleTTL
}

function remainingAfterSweep(
  registry: RegistryImpl,
  node: NodeImpl,
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
  node: NodeImpl,
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
  const nodes = new Set<NodeImpl>()
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

function addNodeToTimeoutBucket(registry: RegistryImpl, node: NodeImpl, idleTTL: number): void {
  const bucket = timeoutBucketFor(registry, idleTTL)
  const entry = ensureTimeoutBucket(registry, bucket)
  entry[0].add(node)
  registry.nodeTimeoutBucket.set(node, bucket)
}

function dropNodeFromTimeoutBucket(
  registry: RegistryImpl,
  node: NodeImpl,
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
  node: NodeImpl,
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
 *
 * Registries are plain `Object.create(RegistryImplProto)` values carrying the
 * standard `Pipeable.pipe` implementation, not class instances; construct them
 * with `make` / `makeRegistryImpl`.
 *
 * @since 4.0.0
 */
export interface RegistryImpl extends Registry {
  readonly [TypeId]: TypeId
  readonly timeoutResolution: number
  readonly defaultIdleTTL: number | undefined
  readonly scheduler: Scheduler
  readonly schedulerAsync: Scheduler
  readonly dispatcher: SchedulerDispatcher
  readonly now: () => number
  readonly scheduleTimer: (f: () => void, delayMillis: number) => () => void
  onNodeAdded?: ((node: Node) => void) | undefined
  onNodeRemoved?: ((node: Node) => void) | undefined
  readonly nodes: Map<Atom.Atom | string, NodeImpl>
  readonly preloadedSerializable: Map<string, AnyValue>
  readonly timeoutBuckets: Map<number, TimeoutBucket>
  readonly nodeTimeoutBucket: Map<NodeImpl, number>
  disposed: boolean
  setInitialValue<A>(atom: Atom.Atom<A>, value: A): void
  getNodes(): Map<Atom.Atom | string, NodeImpl>
  get<A>(atom: Atom.Atom<A>): A
  getRaw<A>(atom: Atom.Atom<A>): Option.Option<A>
  set<R, W>(atom: Atom.Writable<R, W>, value: W): void
  setSerializable<T = unknown>(key: string, encoded: T): void
  modify<R, W, A>(atom: Atom.Writable<R, W>, f: (_: R) => [returnValue: A, nextValue: W]): A
  update<R, W>(atom: Atom.Writable<R, W>, f: (_: R) => W): void
  refresh: <A>(atom: Atom.Atom<A>) => void
  subscribe<A>(atom: Atom.Atom<A>, f: (_: A) => void, options?: { readonly immediate?: boolean }): () => void
  mount<A>(atom: Atom.Atom<A>): () => void
  atomHasTtl(atom: Atom.Atom): boolean
  ensureNode<A>(atom: Atom.Atom<A>): NodeImpl<A>
  createNode<A>(atom: Atom.Atom<A>): NodeImpl<A>
  invalidateAtom: <A>(atom: Atom.Atom<A>) => void
  scheduleAtomRemoval(atom: Atom.Atom): void
  scheduleNodeRemoval(node: NodeImpl): void
  removeNode(node: NodeImpl): void
  setNodeTimeout(node: NodeImpl): void
  removeNodeTimeout(node: NodeImpl): void
  sweepBucket(bucket: number): void
  reset(): void
  dispose(): void
}

/**
 * Internal view of a registry: adds the sweep state and helpers that the
 * class kept as private members. Never exported or assigned to consumers.
 */
interface RegistryImplInternal extends RegistryImpl {
  currentSweepTTL: number | null
  setNodeTimeoutIfIdle(node: NodeImpl): void
  scheduleOrEvictIdleNode(node: NodeImpl, nodeIdleTTL: number): void
  sweepBucketEntry(bucket: number, entry: TimeoutBucket): void
  sweepIdleNode(node: NodeImpl): void
  sweepIdleNodeIfRemovable(node: NodeImpl): void
  sweepRemoveNode(node: NodeImpl): void
  removeNodeWithSweepTtl(node: NodeImpl): void
  assignSweepTtl(idleTTL: number | undefined): void
}

const RegistryImplProto = {
  ...Pipeable.Prototype,

  setInitialValue<A>(this: RegistryImplInternal, atom: Atom.Atom<A>, value: A): void {
    this.ensureNode(resolveInitialValueTarget(atom)).setInitialValue(value)
  },

  getNodes(this: RegistryImplInternal) {
    return this.nodes
  },

  get<A>(this: RegistryImplInternal, atom: Atom.Atom<A>): A {
    return this.ensureNode(atom).value()
  },

  getRaw<A>(this: RegistryImplInternal, atom: Atom.Atom<A>): Option.Option<A> {
    const node = this.nodes.get(atomKey(atom))
    if (node === undefined) {
      return Option.none()
    }
    return valueOptionIfForAtom(atom, node)
  },

  set<R, W>(this: RegistryImplInternal, atom: Atom.Writable<R, W>, value: W): void {
    atom.write(this.ensureNode(atom).writeContext, value)
  },

  setSerializable<T = unknown>(this: RegistryImplInternal, key: string, encoded: T): void {
    const node = this.nodes.get(key)
    if (node === undefined) {
      this.preloadedSerializable.set(key, encoded)
      return
    }
    applySerializableValue(this, node, encoded)
  },

  modify<R, W, A>(
    this: RegistryImplInternal,
    atom: Atom.Writable<R, W>,
    f: (_: R) => [returnValue: A, nextValue: W],
  ): A {
    const node = this.ensureNode(atom)
    const result = f(node.value())
    atom.write(node.writeContext, result[1])
    return result[0]
  },

  update<R, W>(this: RegistryImplInternal, atom: Atom.Writable<R, W>, f: (_: R) => W): void {
    const node = this.ensureNode(atom)
    atom.write(node.writeContext, f(node.value()))
  },

  subscribe<A>(
    this: RegistryImplInternal,
    atom: Atom.Atom<A>,
    f: (_: A) => void,
    options?: { readonly immediate?: boolean },
  ): () => void {
    const node = this.ensureNode(atom)
    notifyIfImmediate(node, f, options)
    const remove = node.subscribe(function() {
      f(Option.getOrThrow(node._value))
    })
    return () => {
      remove()
      if (node.canBeRemoved) {
        this.scheduleNodeRemoval(node)
      }
    }
  },

  mount<A>(this: RegistryImplInternal, atom: Atom.Atom<A>) {
    return this.subscribe(atom, constVoid, constImmediate)
  },

  atomHasTtl(this: RegistryImplInternal, atom: Atom.Atom): boolean {
    if (atom.keepAlive) {
      return false
    }
    return atomIdleTtlIsActive(this, atom)
  },

  ensureNode<A>(this: RegistryImplInternal, atom: Atom.Atom<A>): NodeImpl<A> {
    const key = atomKey(atom)
    const node = nodeForKey(this, atom, key)
    applyPreloadedIfStringKey(this, node, key)
    return node
  },

  createNode<A>(this: RegistryImplInternal, atom: Atom.Atom<A>): NodeImpl<A> {
    throwIfDisposed(this, atom)
    scheduleRemovalUnlessKeepAlive(this, atom)
    return makeNode(this, atom)
  },

  scheduleAtomRemoval(this: RegistryImplInternal, atom: Atom.Atom): void {
    this.dispatcher.scheduleTask(() => {
      removeAtomIfIdle(this, atom)
    }, 0)
  },

  scheduleNodeRemoval(this: RegistryImplInternal, node: NodeImpl): void {
    this.dispatcher.scheduleTask(() => {
      removeNodeIfCanBeRemoved(this, node)
    }, 0)
  },

  removeNode(this: RegistryImplInternal, node: NodeImpl): void {
    if (this.atomHasTtl(node.atom)) {
      this.setNodeTimeout(node)
      return
    }
    evictNode(this, node)
  },

  setNodeTimeout(this: RegistryImplInternal, node: NodeImpl): void {
    if (this.nodeTimeoutBucket.has(node)) {
      return
    }
    this.setNodeTimeoutIfIdle(node)
  },

  setNodeTimeoutIfIdle(this: RegistryImplInternal, node: NodeImpl): void {
    const nodeIdleTTL = idleTtlOf(node.atom, this.defaultIdleTTL)
    if (nodeIdleTTL === undefined) {
      return
    }
    this.scheduleOrEvictIdleNode(node, nodeIdleTTL)
  },

  scheduleOrEvictIdleNode(this: RegistryImplInternal, node: NodeImpl, nodeIdleTTL: number): void {
    const remaining = remainingIdleTtl(this, node, nodeIdleTTL, this.currentSweepTTL)
    if (remaining === undefined) {
      return
    }
    addNodeToTimeoutBucket(this, node, remaining)
  },

  removeNodeTimeout(this: RegistryImplInternal, node: NodeImpl): void {
    const bucket = this.nodeTimeoutBucket.get(node)
    if (bucket === undefined) {
      return
    }
    this.nodeTimeoutBucket.delete(node)
    this.scheduleNodeRemoval(node)
    dropNodeFromTimeoutBucket(this, node, bucket)
  },

  sweepBucket(this: RegistryImplInternal, bucket: number): void {
    const entry = this.timeoutBuckets.get(bucket)
    if (entry === undefined) {
      return
    }
    this.sweepBucketEntry(bucket, entry)
  },

  sweepBucketEntry(this: RegistryImplInternal, bucket: number, entry: TimeoutBucket): void {
    this.timeoutBuckets.delete(bucket)
    entry[0].forEach((node) => {
      this.sweepIdleNode(node)
    })
  },

  sweepIdleNode(this: RegistryImplInternal, node: NodeImpl): void {
    this.nodeTimeoutBucket.delete(node)
    this.sweepIdleNodeIfRemovable(node)
  },

  sweepIdleNodeIfRemovable(this: RegistryImplInternal, node: NodeImpl): void {
    if (node.canBeRemoved === false) {
      return
    }
    this.sweepRemoveNode(node)
  },

  sweepRemoveNode(this: RegistryImplInternal, node: NodeImpl): void {
    this.nodes.delete(atomKey(node.atom))
    notifyNodeRemoved(this, node)
    this.removeNodeWithSweepTtl(node)
  },

  removeNodeWithSweepTtl(this: RegistryImplInternal, node: NodeImpl): void {
    this.assignSweepTtl(idleTtlOf(node.atom, this.defaultIdleTTL))
    node.remove()
    this.currentSweepTTL = null
  },

  assignSweepTtl(this: RegistryImplInternal, idleTTL: number | undefined): void {
    if (idleTTL === undefined) {
      return
    }
    this.currentSweepTTL = idleTTL
  },

  reset(this: RegistryImplInternal): void {
    this.timeoutBuckets.forEach(([, cancel]) => cancel())
    this.timeoutBuckets.clear()
    this.nodeTimeoutBucket.clear()

    this.nodes.forEach((node) => {
      node.remove()
      notifyNodeRemoved(this, node)
    })
    this.nodes.clear()
  },

  dispose(this: RegistryImplInternal): void {
    this.disposed = true
    this.reset()
  },
}

const makeRegistryImpl = (
  initialValues?: Iterable<readonly [Atom.Atom, AnyValue]>,
  scheduleTask?: (cb: () => void) => () => void,
  timeoutResolution?: number,
  defaultIdleTTL?: number,
  now?: () => number,
  scheduleTimer?: (f: () => void, delayMillis: number) => () => void,
): RegistryImpl => {
  const scheduler = new MixedScheduler('sync', scheduleTask)
  const schedulerAsync = new MixedScheduler('async', scheduleTask)
  const self: RegistryImpl = Object.assign(
    {},
    RegistryImplProto,
    {
      [TypeId]: TypeId,
      scheduler,
      schedulerAsync,
      dispatcher: schedulerAsync.makeDispatcher(),
      defaultIdleTTL,
      now: nowOrHost(now),
      scheduleTimer: scheduleTimerOrHost(scheduleTimer),
      timeoutResolution: resolveTimeoutResolution(timeoutResolution, defaultIdleTTL),
      onNodeAdded: undefined,
      onNodeRemoved: undefined,
      nodes: new Map<Atom.Atom | string, NodeImpl>(),
      preloadedSerializable: new Map<string, AnyValue>(),
      timeoutBuckets: new Map<number, TimeoutBucket>(),
      nodeTimeoutBucket: new Map<NodeImpl, number>(),
      disposed: false,
      currentSweepTTL: null,
      // Bound arrows, as the class fields were: `refresh` hands itself out as
      // an unbound callback (`atom.refresh(this.refresh)`), so these must stay
      // self-referencing closures instead of prototype methods.
      refresh: <A>(atom: Atom.Atom<A>): void => {
        if (atom.refresh !== undefined) {
          atom.refresh(self.refresh)
        } else {
          self.invalidateAtom(atom)
        }
      },
      invalidateAtom: <A>(atom: Atom.Atom<A>): void => {
        self.ensureNode(atom).invalidate()
      },
    },
  )
  applyInitialValues(self, initialValues)
  return self
}

export function batch(f: () => void): void {
  runInternalBatch(f)
}
