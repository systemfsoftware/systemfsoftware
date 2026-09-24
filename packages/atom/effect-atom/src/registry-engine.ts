import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as Exit from 'effect/Exit'
import { constVoid, type LazyArg } from 'effect/Function'
import * as Option from 'effect/Option'
import * as Pipeable from 'effect/Pipeable'
import { MixedScheduler, type Scheduler, type SchedulerDispatcher } from 'effect/Scheduler'
import * as Schema from 'effect/Schema'
import { batchRunner, type BatchState, makeBatchState, NodeImpl } from './atom-node.js'
import type * as Atom from './atom.blueprint.js'
import { hostScheduleTimer, makeHostNow } from './internal/host-timer.js'
import type { Node, PreloadRefused, Registry } from './registry.handle.js'

type AnyValue<A = unknown> = A

class Refusals extends Context.Service<Refusals, { readonly entries: Array<PreloadRefused> }>()(
  '@systemfsoftware/effect-atom/registry-engine/Refusals',
) {}
// -----------------------------------------------------------------------------
// internal
// -----------------------------------------------------------------------------

const constImmediate = { immediate: true }

function atomKey<A>(atom: Atom.Atom<A>): Atom.Atom<A> | string {
  const serializable = atom.spec.serializable
  if (serializable === undefined) {
    return atom
  }
  return serializable.key
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
    return makeHostNow()
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

function resolveInitialValueTarget(atom: Atom.Atom): Atom.Atom {
  const target = atom.spec.initialValueTarget
  if (target === undefined) {
    return atom
  }
  return resolveInitialValueTarget(target)
}

function valueOptionIfForAtom<A>(atom: Atom.Atom<A>, node: NodeImpl): Option.Option<A> {
  if (isNodeImplFor(atom, node) === false) {
    return Option.none()
  }
  return node.valueOption()
}

const isDecodingCodec = (u: unknown): u is Schema.ConstraintDecoder<AnyValue> => Schema.isSchema(u)

const decodingCodecOf = (serializer: Atom.SerializableSpec): Schema.ConstraintDecoder<AnyValue> | undefined => {
  const codec = serializer.codecJson
  if (isDecodingCodec(codec) === false) {
    return undefined
  }
  return codec
}

function applyDecodedSerializable(
  registry: RegistryImpl,
  node: NodeImpl,
  serializer: Atom.SerializableSpec,
  encoded: AnyValue,
): void {
  const codec = decodingCodecOf(serializer)
  if (codec === undefined) {
    return
  }
  applyDecodedExit(registry, node, serializer.key, Schema.decodeUnknownExit(codec)(encoded))
}

function applyDecodedExit(
  registry: RegistryImpl,
  node: NodeImpl,
  key: string,
  exit: Exit.Exit<AnyValue, Schema.SchemaError>,
): void {
  if (Exit.isFailure(exit)) {
    recordRefusalOn(registry, key, exit.cause)
    return
  }
  assignDecodedSerializable(registry, node, exit.value)
}

function recordRefusalOn(registry: RegistryImpl, key: string, cause: Cause.Cause<Schema.SchemaError>): void {
  registry.refusals().entries.push({ key, issue: formatSchemaError(cause) })
}

function formatSchemaError(cause: Cause.Cause<Schema.SchemaError>): string {
  const found = Cause.findErrorOption(cause)
  if (Option.isNone(found)) {
    return 'undecodable value'
  }
  return found.value.message
}

function assignDecodedSerializable(
  registry: RegistryImpl,
  node: NodeImpl,
  decoded: AnyValue,
): void {
  const target = resolveInitialValueTarget(node.atom)
  if (target === node.atom) {
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
  const serializer = node.atom.spec.serializable
  if (serializer === undefined) {
    return
  }
  applyDecodedSerializable(registry, node, serializer, encoded)
}

function notifyIfImmediate<A>(
  current: A,
  f: (_: A) => void,
  options: { readonly immediate?: boolean } | undefined,
): void {
  if (options === undefined) {
    return
  }
  notifyIfImmediateFlag(current, f, options.immediate)
}

function notifyIfImmediateFlag<A>(current: A, f: (_: A) => void, immediate: boolean | undefined): void {
  if (immediate === true) {
    f(current)
  }
}

function hearIfChanged<A>(node: NodeImpl<A>, lastSeen: { value: A }, f: (_: A) => void): void {
  if (node.atom.equals(lastSeen.value, node._value)) {
    return
  }
  lastSeen.value = node._value
  f(node._value)
}

function atomIdleTtlIsActive(registry: RegistryImpl, atom: Atom.Atom): boolean {
  if (atom.spec.idleTTL === 0) {
    return false
  }
  return hasIdleTtl(registry, atom)
}

function hasIdleTtl(registry: RegistryImpl, atom: Atom.Atom): boolean {
  if (atom.spec.idleTTL !== undefined) {
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

function holdsStateFor(registry: RegistryImpl, key: Atom.Atom | string): boolean {
  return registry.nodes.has(key) || hasPendingPreload(registry, key)
}

function hasPendingPreload(registry: RegistryImpl, key: Atom.Atom | string): boolean {
  return typeof key === 'string' && registry.preloadedSerializable.has(key)
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
  const label = atom.spec.label
  if (label === undefined) {
    return 'unknown'
  }
  return label[0]
}

function throwIfDisposed<A>(registry: RegistryImpl, atom: Atom.Atom<A>): void {
  if (registry.disposed) {
    throw new Error(`Cannot access Atom ${atomLabel(atom)}: registry is disposed`)
  }
}

function scheduleRemovalUnlessKeepAlive<A>(registry: RegistryImpl, atom: Atom.Atom<A>): void {
  if (atom.spec.keepAlive) {
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
  clearNodeTimeout(registry, node)
  registry.nodes.delete(atomKey(node.atom))
  node.remove()
  notifyNodeRemoved(registry, node)
}

function clearNodeTimeout(registry: RegistryImpl, node: NodeImpl): void {
  const bucket = registry.nodeTimeoutBucket.get(node)
  if (bucket === undefined) {
    return
  }
  registry.nodeTimeoutBucket.delete(node)
  dropNodeFromTimeoutBucket(registry, node, bucket)
}

function evictNodeIfIdle(registry: RegistryImpl, node: NodeImpl): void {
  if (node.canBeRemoved) {
    evictNode(registry, node)
  }
}

function idleTtlOf(atom: Atom.Atom, defaultIdleTTL: number | undefined): number | undefined {
  if (atom.spec.idleTTL === undefined) {
    return defaultIdleTTL
  }
  return atom.spec.idleTTL
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
 * The registry engine: one instance stores atom nodes, coordinates reads,
 * writes, refreshes, subscriptions, and disposal for one registry handle.
 */
export class RegistryImpl extends Pipeable.Class {
  readonly timeoutResolution: number
  readonly defaultIdleTTL: number | undefined
  readonly scheduler: Scheduler
  readonly schedulerAsync: Scheduler
  readonly dispatcher: SchedulerDispatcher
  readonly now: () => number
  readonly scheduleTimer: (f: () => void, delayMillis: number) => () => void
  readonly handle: Registry
  readonly batch: BatchState
  onNodeAdded?: ((node: Node) => void) | undefined
  onNodeRemoved?: ((node: Node) => void) | undefined

  constructor(
    mint: (engine: RegistryImpl) => Registry,
    initialValues?: Iterable<readonly [Atom.Atom, AnyValue]>,
    scheduleTask?: (cb: () => void) => () => void,
    timeoutResolution?: number,
    defaultIdleTTL?: number,
    now?: () => number,
    scheduleTimer?: (f: () => void, delayMillis: number) => () => void,
  ) {
    super()
    this.handle = mint(this)
    this.batch = makeBatchState()
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

  readonly nodes = new Map<Atom.Atom | string, NodeImpl>()
  readonly preloadedSerializable = new Map<string, AnyValue>()
  readonly timeoutBuckets = new Map<number, TimeoutBucket>()
  readonly nodeTimeoutBucket = new Map<NodeImpl, number>()
  disposed = false
  storage: Context.Context<never> = Context.empty()

  storageFor<I, A>(key: Context.Key<I, A>, make: LazyArg<A>): A {
    const found = Context.getOption(this.storage, key)
    if (Option.isSome(found)) {
      return found.value
    }
    const created = make()
    this.storage = Context.add(this.storage, key, created)
    return created
  }

  refusals(): { readonly entries: Array<PreloadRefused> } {
    return this.storageFor(Refusals, () => ({ entries: [] }))
  }

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
  batchOn(f: () => void): void {
    batchRunner.startBatch(this.batch)
    try {
      f()
      batchRunner.commitBatchIfOutermost(this.batch)
    } finally {
      batchRunner.finishBatch(this.batch)
    }
  }
  setSerializable<T = unknown>(key: string, encoded: T): void {
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
    const custom = atom.spec.refresh
    if (custom === undefined) {
      this.invalidateAtom(atom)
      return
    }
    custom(this.refresh)
  }

  subscribe<A>(atom: Atom.Atom<A>, f: (_: A) => void, options?: { readonly immediate?: boolean }): () => void {
    const node = this.ensureNode(atom)
    const lastSeen = { value: node.value() }
    notifyIfImmediate(lastSeen.value, f, options)
    const remove = node.subscribe(function() {
      hearIfChanged(node, lastSeen, f)
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

  atomHasTtl(atom: Atom.Atom): boolean {
    if (atom.spec.keepAlive) {
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
    throwIfDisposed(this, atom)
    if (holdsStateFor(this, atomKey(atom))) {
      this.ensureNode(atom).invalidate()
    }
  }

  scheduleAtomRemoval(atom: Atom.Atom): void {
    this.dispatcher.scheduleTask(() => {
      removeAtomIfIdle(this, atom)
    }, 0)
  }

  scheduleNodeRemoval(node: NodeImpl): void {
    this.dispatcher.scheduleTask(() => {
      removeNodeIfCanBeRemoved(this, node)
    }, 0)
  }

  removeNode(node: NodeImpl): void {
    if (this.atomHasTtl(node.atom)) {
      this.setNodeTimeout(node)
      return
    }
    evictNode(this, node)
  }

  setNodeTimeout(node: NodeImpl): void {
    if (this.nodeTimeoutBucket.has(node)) {
      return
    }
    this.setNodeTimeoutIfIdle(node)
  }

  private setNodeTimeoutIfIdle(node: NodeImpl): void {
    const nodeIdleTTL = idleTtlOf(node.atom, this.defaultIdleTTL)
    if (nodeIdleTTL === undefined) {
      return
    }
    this.scheduleOrEvictIdleNode(node, nodeIdleTTL)
  }

  private scheduleOrEvictIdleNode(node: NodeImpl, nodeIdleTTL: number): void {
    const remaining = remainingIdleTtl(this, node, nodeIdleTTL, this.#currentSweepTTL)
    if (remaining === undefined) {
      return
    }
    addNodeToTimeoutBucket(this, node, remaining)
  }

  removeNodeTimeout(node: NodeImpl): void {
    if (this.nodeTimeoutBucket.has(node) === false) {
      return
    }
    clearNodeTimeout(this, node)
    this.scheduleNodeRemoval(node)
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

  private sweepIdleNode(node: NodeImpl): void {
    this.nodeTimeoutBucket.delete(node)
    this.sweepIdleNodeIfRemovable(node)
  }

  private sweepIdleNodeIfRemovable(node: NodeImpl): void {
    if (node.canBeRemoved === false) {
      return
    }
    this.sweepRemoveNode(node)
  }

  private sweepRemoveNode(node: NodeImpl): void {
    this.nodes.delete(atomKey(node.atom))
    notifyNodeRemoved(this, node)
    this.removeNodeWithSweepTtl(node)
  }

  private removeNodeWithSweepTtl(node: NodeImpl): void {
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
    this.storage = Context.empty()
    this.reset()
  }
}
