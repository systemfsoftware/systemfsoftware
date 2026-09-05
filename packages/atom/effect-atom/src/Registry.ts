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

/**
 * The literal type used to identify `AtomRegistry` services and values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = '~effect-atom/atom/Registry'

/**
 * The runtime type id used to identify `AtomRegistry` services and values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = '~effect-atom/atom/Registry'

/**
 * Returns `true` when the value has the `AtomRegistry` type id.
 *
 * @category guards
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
 * @category models
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
 * @category models
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

/**
 * Creates an `AtomRegistry`.
 *
 * **Details**
 *
 * Options can preload initial atom values, provide a custom task scheduler,
 * configure timeout bucket resolution, and set a default idle time-to-live for
 * unused atoms.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  options?: {
    readonly initialValues?: Iterable<readonly [Atom.Atom<unknown>, unknown]> | undefined
    readonly scheduleTask?: ((f: () => void) => () => void) | undefined
    readonly timeoutResolution?: number | undefined
    readonly defaultIdleTTL?: number | undefined
    readonly now?: (() => number) | undefined
    readonly scheduleTimer?: ((f: () => void, delayMillis: number) => () => void) | undefined
  },
): Registry =>
  new RegistryImpl(
    options?.initialValues,
    options?.scheduleTask,
    options?.timeoutResolution,
    options?.defaultIdleTTL,
    options?.now,
    options?.scheduleTimer,
  )

/**
 * Service tag for the active atom runtime cache.
 *
 * **When to use**
 *
 * Use to access or provide the registry that stores atom values,
 * dependencies, subscriptions, and disposal state for a reactive lifetime.
 *
 * @category services
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
 * @category layers
 * @since 4.0.0
 */
export const layerOptions = (options?: {
  readonly initialValues?: Iterable<readonly [Atom.Atom<unknown>, unknown]> | undefined
  readonly scheduleTask?: ((f: () => void) => () => void) | undefined
  readonly timeoutResolution?: number | undefined
  readonly defaultIdleTTL?: number | undefined
  readonly now?: (() => number) | undefined
  readonly scheduleTimer?: ((f: () => void, delayMillis: number) => () => void) | undefined
}): Layer.Layer<AtomRegistry> =>
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
 * @category layers
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
 * @category converting
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

/**
 * Converts an `AsyncResult` atom in this registry into a stream of successful
 * values.
 *
 * **Details**
 *
 * Initial results are skipped, failures fail the stream with their cause, and
 * duplicate stream values are dropped with `Stream.changes`.
 *
 * @category converting
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
      Stream.mapEffect((result) =>
        Result.isSuccess(result) ? Effect.succeed(result.value) : Effect.failCause(result.cause)
      ),
      Stream.changes,
    ),
)

/**
 * Reads an `AsyncResult` atom from this registry as an effect.
 *
 * **Details**
 *
 * The effect waits for the result to leave `Initial`, and also waits through
 * waiting results when `suspendOnWaiting` is enabled.
 *
 * @category converting
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
    const suspendOnWaiting = options?.suspendOnWaiting ?? false
    return Effect.callback((resume) => {
      const result = self.get(atom)
      if (!Result.isInitial(result) && !(suspendOnWaiting && result.waiting)) {
        return resume(Result.toExit(result))
      }
      const cancel = self.subscribe(atom, (value) => {
        if (!Result.isInitial(value) && !(suspendOnWaiting && value.waiting)) {
          resume(Result.toExit(value))
          cancel()
        }
      })
      return Effect.sync(cancel)
    })
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
 * @category converting
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

const atomKey = <A>(atom: Atom.Atom<A>): Atom.Atom<A> | string =>
  isSerializableAtom(atom) ? atom[SerializableTypeId].key : atom

/**
 * Nodes are stored in one heterogeneous map keyed by `atomKey`. A node found
 * under an atom's key is that atom's own node, so key equality re-establishes
 * the erased `A` type across the map boundary.
 */
const isNodeImplFor = <A>(atom: Atom.Atom<A>, node: NodeImpl<unknown>): node is NodeImpl<A> =>
  atomKey(node.atom) === atomKey(atom)

/**
 * Concrete registry used by the package implementation.
 */
export class RegistryImpl implements Registry {
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
    this[TypeId] = TypeId
    this.scheduler = new MixedScheduler('sync', scheduleTask)
    this.schedulerAsync = new MixedScheduler('async', scheduleTask)
    this.dispatcher = this.schedulerAsync.makeDispatcher()
    this.defaultIdleTTL = defaultIdleTTL
    this.now = now ?? hostNow
    this.scheduleTimer = scheduleTimer ?? hostScheduleTimer

    if (timeoutResolution === undefined && defaultIdleTTL !== undefined) {
      this.timeoutResolution = Math.round(defaultIdleTTL / 2)
    } else {
      this.timeoutResolution = timeoutResolution ?? 1000
    }
    if (initialValues !== undefined) {
      for (const [atom, value] of initialValues) {
        this.setInitialValue(atom, value)
      }
    }
  }

  setInitialValue<A>(atom: Atom.Atom<A>, value: A): void {
    let target = atom
    while (target.initialValueTarget) {
      target = target.initialValueTarget
    }
    this.ensureNode(target).setInitialValue(value)
  }

  readonly nodes = new Map<Atom.Atom<unknown> | string, NodeImpl<unknown>>()
  readonly preloadedSerializable = new Map<string, unknown>()
  readonly timeoutBuckets = new Map<
    number,
    readonly [nodes: Set<NodeImpl<unknown>>, cancel: () => void]
  >()
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
    if (node === undefined || !isNodeImplFor(atom, node)) {
      return Option.none()
    }
    return node.valueOption()
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
    this.applySerializableValue(node, encoded)
  }

  private applySerializableValue(node: NodeImpl<unknown>, encoded: unknown): void {
    const atom = node.atom
    if (!isSerializableAtom(atom)) return
    let decoded: unknown
    try {
      decoded = atom[SerializableTypeId].decode(encoded)
    } catch {
      return
    }
    let target: Atom.Atom<unknown> = atom
    while (target.initialValueTarget) {
      target = target.initialValueTarget
    }
    if (target === atom) {
      node.setValue(decoded)
    } else {
      this.ensureNode(target).setInitialValue(decoded)
    }
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
    if (options?.immediate) {
      f(node.value())
    }
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
    return !atom.keepAlive && atom.idleTTL !== 0 && (atom.idleTTL !== undefined || this.defaultIdleTTL !== undefined)
  }

  ensureNode<A>(atom: Atom.Atom<A>): NodeImpl<A> {
    const key = atomKey(atom)
    let node: NodeImpl<A>
    const existing = this.nodes.get(key)
    if (existing !== undefined && isNodeImplFor(atom, existing)) {
      node = existing
      if (this.atomHasTtl(atom)) {
        this.removeNodeTimeout(node)
      }
    } else {
      node = this.createNode(atom)
      this.nodes.set(key, node)
      this.onNodeAdded?.(node)
    }
    if (typeof key === 'string' && this.preloadedSerializable.has(key)) {
      const encoded = this.preloadedSerializable.get(key)
      this.preloadedSerializable.delete(key)
      this.applySerializableValue(node, encoded)
    }
    return node
  }

  createNode<A>(atom: Atom.Atom<A>): NodeImpl<A> {
    if (this.disposed) {
      throw new Error(`Cannot access Atom ${atom.label?.[0] ?? 'unknown'}: registry is disposed`)
    }

    if (!atom.keepAlive) {
      this.scheduleAtomRemoval(atom)
    }
    return new NodeImpl(this, atom)
  }

  invalidateAtom = <A>(atom: Atom.Atom<A>): void => {
    this.ensureNode(atom).invalidate()
  }

  scheduleAtomRemoval(atom: Atom.Atom<unknown>): void {
    this.dispatcher.scheduleTask(() => {
      const node = this.nodes.get(atomKey(atom))
      if (node !== undefined && node.canBeRemoved) {
        this.removeNode(node)
      }
    }, 0)
  }

  scheduleNodeRemoval(node: NodeImpl<unknown>): void {
    this.dispatcher.scheduleTask(() => {
      if (node.canBeRemoved) {
        this.removeNode(node)
      }
    }, 0)
  }

  removeNode(node: NodeImpl<unknown>): void {
    if (this.atomHasTtl(node.atom)) {
      this.setNodeTimeout(node)
    } else {
      this.nodes.delete(atomKey(node.atom))
      node.remove()
      this.onNodeRemoved?.(node)
    }
  }

  setNodeTimeout(node: NodeImpl<unknown>): void {
    if (this.nodeTimeoutBucket.has(node)) {
      return
    }

    // Clock and delayed scheduling come from the host seam (`now` /
    // `scheduleTimer`), so consumers can drive idle eviction deterministically
    // instead of sleeping real time (see internal/host-timer.ts).
    const nodeIdleTTL = node.atom.idleTTL ?? this.defaultIdleTTL
    if (nodeIdleTTL === undefined) {
      return
    }
    let idleTTL = nodeIdleTTL
    if (this.#currentSweepTTL !== null) {
      idleTTL -= this.#currentSweepTTL
      if (idleTTL <= 0) {
        if (node.canBeRemoved) {
          this.nodes.delete(atomKey(node.atom))
          node.remove()
          this.onNodeRemoved?.(node)
        }
        return
      }
    }
    const ttl = Math.ceil(idleTTL / this.timeoutResolution) * this.timeoutResolution
    const timestamp = this.now() + ttl
    const bucket = timestamp - (timestamp % this.timeoutResolution) + this.timeoutResolution

    let entry = this.timeoutBuckets.get(bucket)
    if (entry === undefined) {
      entry = [
        new Set<NodeImpl<unknown>>(),
        this.scheduleTimer(() => this.sweepBucket(bucket), bucket - this.now()),
      ]
      this.timeoutBuckets.set(bucket, entry)
    }
    entry[0].add(node)
    this.nodeTimeoutBucket.set(node, bucket)
  }

  removeNodeTimeout(node: NodeImpl<unknown>): void {
    const bucket = this.nodeTimeoutBucket.get(node)
    if (bucket === undefined) return
    this.nodeTimeoutBucket.delete(node)
    this.scheduleNodeRemoval(node)

    const entry = this.timeoutBuckets.get(bucket)
    if (entry === undefined) {
      return
    }
    const [nodes, cancel] = entry
    nodes.delete(node)
    if (nodes.size === 0) {
      cancel()
      this.timeoutBuckets.delete(bucket)
    }
  }

  #currentSweepTTL: number | null = null
  sweepBucket(bucket: number): void {
    const entry = this.timeoutBuckets.get(bucket)
    if (entry === undefined) {
      return
    }
    this.timeoutBuckets.delete(bucket)
    const nodes = entry[0]

    nodes.forEach((node) => {
      this.nodeTimeoutBucket.delete(node)
      if (!node.canBeRemoved) return
      this.nodes.delete(atomKey(node.atom))
      this.onNodeRemoved?.(node)
      const idleTTL = node.atom.idleTTL ?? this.defaultIdleTTL
      if (idleTTL !== undefined) {
        this.#currentSweepTTL = idleTTL
      }
      node.remove()
      this.#currentSweepTTL = null
    })
  }

  reset(): void {
    this.timeoutBuckets.forEach(([, cancel]) => cancel())
    this.timeoutBuckets.clear()
    this.nodeTimeoutBucket.clear()

    this.nodes.forEach((node) => {
      node.remove()
      this.onNodeRemoved?.(node)
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
