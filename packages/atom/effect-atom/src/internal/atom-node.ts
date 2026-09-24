import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Pipeable from 'effect/Pipeable'
import * as Queue from 'effect/Queue'
import * as Stream from 'effect/Stream'
import * as Result from '../async-result.js'
import type * as Atom from '../Atom.js'
import { decideNodeFate, type NodeLifetimeInput } from './node-lifetime.js'
import type { NodeFate } from './node-lifetime.schema.js'
import type { RegistryImpl } from './registry-engine.js'

type AnyNode<A = unknown> = NodeImpl<A>
type AnyLifetime<A = unknown> = Lifetime<A>

const notifyListener = (listener: () => void): void => {
  listener()
}

const NodeFlags: {
  readonly alive: 1
  readonly initialized: 2
  readonly waitingForValue: 4
} = {
  alive: 1, // 1 << 0
  initialized: 2, // 1 << 1,
  waitingForValue: 4, // 1 << 2
}
type NodeFlags = 1 | 2 | 4

const NodeState: {
  readonly uninitialized: number
  readonly stale: number
  readonly valid: number
  readonly removed: 0
} = {
  uninitialized: NodeFlags.alive | NodeFlags.waitingForValue,
  stale: NodeFlags.alive | NodeFlags.initialized | NodeFlags.waitingForValue,
  valid: NodeFlags.alive | NodeFlags.initialized,
  removed: 0,
}
type NodeState = number

/**
 * @internal
 */
export class NodeImpl<A = unknown> extends Pipeable.Class {
  constructor(
    registry: RegistryImpl,
    atom: Atom.Atom<A>,
  ) {
    super()
    this.registry = registry
    this.atom = atom
    this.writeContext = new WriteContextImpl(registry, this)
  }
  readonly registry: RegistryImpl
  readonly atom: Atom.Atom<A>
  state: NodeState = NodeState.uninitialized
  lifetime: Lifetime<A> | undefined
  writeContext: WriteContextImpl<A>
  preserveInitialValueOnBuild = false

  parents = new Set<AnyNode>()
  previousParents: Set<AnyNode> | undefined
  children = new Set<AnyNode>()
  listeners = new Set<() => void>()
  skipInvalidation = false
  building = false
  invalidatedDuringBuild = false

  currentState(): 'uninitialized' | 'stale' | 'valid' | 'removed' {
    switch (this.state) {
      case NodeState.uninitialized:
        return 'uninitialized'
      case NodeState.stale:
        return 'stale'
      case NodeState.valid:
        return 'valid'
      default:
        return 'removed'
    }
  }

  get canBeRemoved(): boolean {
    return this.pipe(nodeLifetimeInput, decideNodeFate, fateMeansRemoved)
  }

  _value!: A
  value(): A {
    rebuildIfWaiting(this)
    return this._value
  }

  valueOption(): Option.Option<A> {
    if ((this.state & NodeFlags.initialized) === 0) {
      return Option.none()
    }
    return Option.some(this._value)
  }

  setInitialValue(value: A): void {
    if ((this.state & NodeFlags.initialized) === 0) {
      assignInitialUninitialized(this, value)
      return
    }
    this.setValue(value)
  }

  setValue(value: A): void {
    if ((this.state & NodeFlags.initialized) === 0) {
      assignFirstValue(this, value)
      return
    }
    replaceInitializedValue(this, value)
  }

  addParent(parent: AnyNode): void {
    this.parents.add(parent)
    forgetPreviousParent(this, parent)
    linkChild(this, parent)
  }

  removeChild(child: AnyNode): void {
    this.children.delete(child)
  }

  invalidate(): void {
    markInvalidatedDuringBuild(this)
    staleIfValid(this)
    continueInvalidate(this)
  }

  invalidateChildren(): void {
    if (this.children.size === 0) {
      return
    }
    invalidateChildSet(this)
  }

  notify(): void {
    this.listeners.forEach(notifyListener)

    if (batchState.phase === BatchPhase.commit) {
      batchState.notify.delete(this)
    }
  }

  disposeLifetime(): void {
    disposeCurrentLifetime(this)
    stashParents(this)
  }

  remove() {
    this.state = NodeState.removed
    this.listeners.clear()
    removeLifetimeAndParents(this)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

function nodeLifetimeInput<A>(node: NodeImpl<A>): NodeLifetimeInput {
  return {
    keepAlive: node.atom.keepAlive,
    listenerCount: node.listeners.size,
    childCount: node.children.size,
    isLive: node.state !== 0,
    isWaiting: isWaitingForInitial(node._value),
    idleTTL: node.atom.idleTTL,
    defaultIdleTTL: node.registry.defaultIdleTTL,
  }
}

function isWaitingForInitial<T = unknown>(value: T): boolean {
  if (Result.isResult(value) === false) {
    return false
  }
  return isInitialWaiting(value)
}

function isInitialWaiting<A = unknown, E = unknown>(value: Result.Result<A, E>): boolean {
  if (Result.isInitial(value) === false) {
    return false
  }
  return value.waiting
}

function fateMeansRemoved(fate: NodeFate): boolean {
  return Match.value(fate).pipe(
    Match.tags({
      Alive: () => false,
      RemoveNow: () => true,
      RemoveAfterTtl: () => true,
    }),
    Match.exhaustive,
  )
}

function rebuildIfWaiting<A>(node: NodeImpl<A>): void {
  if ((node.state & NodeFlags.waitingForValue) !== 0) {
    rebuildNodeValue(node)
  }
}

function rebuildNodeValue<A>(node: NodeImpl<A>): void {
  node.lifetime = makeLifetime(node)
  node.building = true
  const value = node.atom.read(node.lifetime)
  node.building = false
  assignRebuiltValue(node, value)
  detachPreviousParents(node)
}

function assignRebuiltValue<A>(node: NodeImpl<A>, value: A): void {
  if ((node.state & NodeFlags.waitingForValue) !== 0) {
    assignRebuiltWaitingValue(node, value)
  }
}

function assignRebuiltWaitingValue<A>(node: NodeImpl<A>, value: A): void {
  if (node.preserveInitialValueOnBuild) {
    node.preserveInitialValueOnBuild = false
    node.state = NodeState.valid
    return
  }
  node.setValue(value)
}

function detachPreviousParents<A>(node: NodeImpl<A>): void {
  if (node.previousParents === undefined) {
    return
  }
  detachParents(node, node.previousParents)
}

function detachParents<A>(node: NodeImpl<A>, parents: Set<AnyNode>): void {
  node.previousParents = undefined
  for (const parent of parents) {
    detachParent(node, parent)
  }
}

function detachParent<A>(node: NodeImpl<A>, parent: AnyNode): void {
  parent.removeChild(node)
  scheduleRemovalIfIdle(node, parent)
}

function scheduleRemovalIfIdle<A>(node: NodeImpl<A>, parent: AnyNode): void {
  if (parent.canBeRemoved) {
    node.registry.scheduleNodeRemoval(parent)
  }
}

function assignInitialUninitialized<A>(node: NodeImpl<A>, value: A): void {
  node.preserveInitialValueOnBuild = true
  node.state = NodeState.stale
  node._value = value
  notifyNodeOrBatch(node)
}

function assignFirstValue<A>(node: NodeImpl<A>, value: A): void {
  node.state = NodeState.valid
  node._value = value
  notifyNodeOrBatch(node)
}

function notifyNodeOrBatch<A>(node: NodeImpl<A>): void {
  if (batchState.phase === BatchPhase.collect) {
    batchState.notify.add(node)
    return
  }
  node.notify()
}

function replaceInitializedValue<A>(node: NodeImpl<A>, value: A): void {
  node.state = NodeState.valid
  replaceIfChanged(node, value)
}

function replaceIfChanged<A>(node: NodeImpl<A>, value: A): void {
  if (node.atom.equals(node._value, value)) {
    return
  }
  commitChangedValue(node, value)
}

function commitChangedValue<A>(node: NodeImpl<A>, value: A): void {
  node._value = value
  invalidateAfterValueChange(node)
  notifyListenersIfPresent(node)
}

function invalidateAfterValueChange<A>(node: NodeImpl<A>): void {
  if (node.skipInvalidation) {
    node.skipInvalidation = false
    return
  }
  node.invalidateChildren()
}

function notifyListenersIfPresent<A>(node: NodeImpl<A>): void {
  if (node.listeners.size > 0) {
    notifyNodeOrBatch(node)
  }
}

function forgetPreviousParent<A>(node: NodeImpl<A>, parent: AnyNode): void {
  if (node.previousParents !== undefined) {
    dropPreviousParent(node, node.previousParents, parent)
  }
}

function dropPreviousParent<A>(
  node: NodeImpl<A>,
  previousParents: Set<AnyNode>,
  parent: AnyNode,
): void {
  previousParents.delete(parent)
  clearPreviousParentsIfEmpty(node, previousParents)
}

function clearPreviousParentsIfEmpty<A>(
  node: NodeImpl<A>,
  previousParents: Set<AnyNode>,
): void {
  if (previousParents.size === 0) {
    node.previousParents = undefined
  }
}

function linkChild<A>(node: NodeImpl<A>, parent: AnyNode): void {
  if (parent.children.has(node) === false) {
    adoptChild(node, parent)
  }
}

function adoptChild<A>(node: NodeImpl<A>, parent: AnyNode): void {
  parent.children.add(node)
  clearSkipInvalidation(parent)
}

function clearSkipInvalidation(parent: AnyNode): void {
  if (parent.skipInvalidation) {
    parent.skipInvalidation = false
  }
}

function markInvalidatedDuringBuild<A>(node: NodeImpl<A>): void {
  if (isBuildingInCollect(node)) {
    node.invalidatedDuringBuild = true
  }
}

function isBuildingInCollect<A>(node: NodeImpl<A>): boolean {
  if (node.building === false) {
    return false
  }
  return batchState.phase === BatchPhase.collect
}

function staleIfValid<A>(node: NodeImpl<A>): void {
  if (node.state === NodeState.valid) {
    node.state = NodeState.stale
    node.disposeLifetime()
  }
}

function continueInvalidate<A>(node: NodeImpl<A>): void {
  if (batchState.phase === BatchPhase.collect) {
    batchState.stale.push(node)
    return
  }
  invalidateOutsideCollect(node)
}

function invalidateOutsideCollect<A>(node: NodeImpl<A>): void {
  if (shouldSkipLazyInvalidate(node)) {
    node.invalidateChildren()
    node.skipInvalidation = true
    return
  }
  node.value()
}

function shouldSkipLazyInvalidate<A>(node: NodeImpl<A>): boolean {
  if (node.atom.lazy === false) {
    return false
  }
  return isIdleWithoutActiveChildren(node)
}

function isIdleWithoutActiveChildren<A>(node: NodeImpl<A>): boolean {
  if (node.listeners.size === 0) {
    return childrenAreActive(node.children) === false
  }
  return false
}

function invalidateChildSet<A>(node: NodeImpl<A>): void {
  const children = node.children
  node.children = new Set()
  for (const child of children) {
    child.invalidate()
  }
}

function disposeCurrentLifetime<A>(node: NodeImpl<A>): void {
  if (node.lifetime !== undefined) {
    node.lifetime.dispose()
    node.lifetime = undefined
  }
}

function stashParents<A>(node: NodeImpl<A>): void {
  if (node.parents.size !== 0) {
    node.previousParents = node.parents
    node.parents = new Set()
  }
}

function removeLifetimeAndParents<A>(node: NodeImpl<A>): void {
  if (node.lifetime === undefined) {
    return
  }
  disposeThenDetach(node)
}

function disposeThenDetach<A>(node: NodeImpl<A>): void {
  node.disposeLifetime()
  detachRemovedParents(node)
}

function detachRemovedParents<A>(node: NodeImpl<A>): void {
  if (node.previousParents === undefined) {
    return
  }
  removeFromParents(node, node.previousParents)
}

function removeFromParents<A>(node: NodeImpl<A>, parents: Set<AnyNode>): void {
  node.previousParents = undefined
  for (const parent of parents) {
    removeFromParent(node, parent)
  }
}

function removeFromParent<A>(node: NodeImpl<A>, parent: AnyNode): void {
  parent.removeChild(node)
  removeParentIfIdle(node, parent)
}

function removeParentIfIdle<A>(node: NodeImpl<A>, parent: AnyNode): void {
  if (parent.canBeRemoved) {
    node.registry.removeNode(parent)
  }
}

function childrenAreActive(children: Set<AnyNode>): boolean {
  if (children.size === 0) {
    return false
  }
  return walkActiveChildren(children)
}

function walkActiveChildren(start: Set<AnyNode>): boolean {
  const stack: Array<Set<AnyNode>> = [start]
  return walkActiveStack(stack, 0)
}

function walkActiveStack(stack: Array<Set<AnyNode>>, index: number): boolean {
  if (index >= stack.length) {
    return false
  }
  return scanThenContinue(stack, index)
}

function scanThenContinue(stack: Array<Set<AnyNode>>, index: number): boolean {
  if (scanActiveSet(stack[index], stack)) {
    return true
  }
  return walkActiveStack(stack, index + 1)
}

function scanActiveSet(
  current: Set<AnyNode> | undefined,
  stack: Array<Set<AnyNode>>,
): boolean {
  if (current === undefined) {
    return false
  }
  return scanDefinedSet(current, stack)
}

function scanDefinedSet(
  current: Set<AnyNode>,
  stack: Array<Set<AnyNode>>,
): boolean {
  let found = false
  current.forEach((child) => {
    found = takeActiveChild(found, child, stack)
  })
  return found
}

function takeActiveChild(
  found: boolean,
  child: AnyNode,
  stack: Array<Set<AnyNode>>,
): boolean {
  if (found) {
    return true
  }
  return childSignalsActive(child, stack)
}

function childSignalsActive(
  child: AnyNode,
  stack: Array<Set<AnyNode>>,
): boolean {
  if (childIsLive(child)) {
    return true
  }
  pushChildSet(child, stack)
  return false
}

function childIsLive(child: AnyNode): boolean {
  if (child.atom.lazy === false) {
    return true
  }
  return child.listeners.size > 0
}

function pushChildSet(child: AnyNode, stack: Array<Set<AnyNode>>): void {
  if (child.children.size > 0) {
    stack.push(child.children)
  }
}

interface Lifetime<A> extends Atom.AtomContext {
  isFn: boolean
  readonly registry: RegistryImpl
  readonly node: NodeImpl<A>
  finalizers: (() => void)[] | undefined
  disposed: boolean
  readonly dispose: () => void
}

type ResultOptions = {
  readonly suspendOnWaiting?: boolean | undefined
}

type StreamOptions = {
  readonly withoutInitialValue?: boolean
}

const LifetimeProto: Omit<AnyLifetime, 'node' | 'finalizers' | 'disposed' | 'isFn' | 'registry'> = {
  addFinalizer(this: AnyLifetime, f: () => void): void {
    if (this.disposed) {
      f()
      return
    }
    pushFinalizer(this, f)
  },

  get<A>(this: AnyLifetime, atom: Atom.Atom<A>): A {
    if (this.disposed) {
      return this.node.registry.get(atom)
    }
    return getLive(this, atom)
  },

  result<A, E>(
    this: AnyLifetime,
    atom: Atom.Atom<Result.Result<A, E>>,
    options?: ResultOptions,
  ): Effect.Effect<A, E> {
    if (isDisposedOrFn(this)) {
      return this.resultOnce(atom, options)
    }
    return resultFromLive(this, atom, options)
  },

  resultOnce<A, E>(
    this: AnyLifetime,
    atom: Atom.Atom<Result.Result<A, E>>,
    options?: ResultOptions,
  ): Effect.Effect<A, E> {
    return Effect.callback<A, E>((resume) => resultOnceCallback(this, atom, options, resume))
  },

  setResult<A, E, W>(
    this: AnyLifetime,
    atom: Atom.Writable<Result.Result<A, E>, W>,
    value: W,
  ): Effect.Effect<A, E> {
    if (this.disposed) return Effect.never
    this.node.registry.set(atom, value)
    return this.resultOnce(atom, { suspendOnWaiting: true })
  },

  some<A>(this: AnyLifetime, atom: Atom.Atom<Option.Option<A>>): Effect.Effect<A> {
    if (isDisposedOrFn(this)) {
      return this.someOnce(atom)
    }
    return someFromOption(this.get(atom))
  },

  someOnce<A>(this: AnyLifetime, atom: Atom.Atom<Option.Option<A>>): Effect.Effect<A> {
    return Effect.callback<A>((resume) => someOnceCallback(this, atom, resume))
  },

  once<A>(this: AnyLifetime, atom: Atom.Atom<A>): A {
    return this.node.registry.get(atom)
  },

  self<A>(this: Lifetime<A>): Option.Option<A> {
    if (this.disposed) return Option.none()
    return this.node.valueOption()
  },

  refresh<A>(this: AnyLifetime, atom: Atom.Atom<A>): void {
    if (this.disposed) return
    this.node.registry.refresh(atom)
  },

  refreshSelf(this: AnyLifetime): void {
    if (this.disposed) return
    this.node.invalidate()
  },

  mount<A>(this: AnyLifetime, atom: Atom.Atom<A>): void {
    if (this.disposed) return
    this.addFinalizer(this.node.registry.mount(atom))
  },

  subscribe<A>(this: AnyLifetime, atom: Atom.Atom<A>, f: (_: A) => void, options?: {
    readonly immediate?: boolean
  }): void {
    if (this.disposed) return
    this.addFinalizer(this.node.registry.subscribe(atom, f, options))
  },

  setSelf<A>(this: AnyLifetime, a: A): void {
    if (this.disposed) return
    this.node.setValue(a)
  },

  set<R, W>(this: AnyLifetime, atom: Atom.Writable<R, W>, value: W): void {
    if (this.disposed) return
    this.node.registry.set(atom, value)
  },

  stream<A>(this: AnyLifetime, atom: Atom.Atom<A>, options?: StreamOptions) {
    if (this.disposed) return Stream.empty
    return Stream.callback<A>((queue) =>
      Effect.sync(() => {
        this.subscribe(atom, (value) => Queue.offerUnsafe(queue, value), {
          immediate: includeInitialValue(options),
        })
      })
    )
  },

  streamResult<A, E>(this: AnyLifetime, atom: Atom.Atom<Result.Result<A, E>>, options?: {
    readonly withoutInitialValue?: boolean
    readonly bufferSize?: number
  }): Stream.Stream<A, E> {
    return this.stream(atom, options).pipe(
      Stream.filter(Result.isNotInitial),
      Stream.mapEffect((result) => streamResultEffect(result)),
    )
  },

  dispose(this: AnyLifetime): void {
    this.disposed = true
    runFinalizers(this)
  },
}

function isDisposedOrFn(lifetime: AnyLifetime): boolean {
  if (lifetime.disposed) {
    return true
  }
  return lifetime.isFn
}

function pushFinalizer(lifetime: AnyLifetime, f: () => void): void {
  if (lifetime.finalizers === undefined) {
    lifetime.finalizers = [f]
    return
  }
  lifetime.finalizers.push(f)
}

function getLive<A>(lifetime: AnyLifetime, atom: Atom.Atom<A>): A {
  const parent = lifetime.node.registry.ensureNode(atom)
  const value = parent.value()
  lifetime.node.addParent(parent)
  return value
}

function resultFromLive<A, E>(
  lifetime: AnyLifetime,
  atom: Atom.Atom<Result.Result<A, E>>,
  options: ResultOptions | undefined,
): Effect.Effect<A, E> {
  return resultFromValue(lifetime.get(atom), options)
}

function resultFromValue<A, E>(
  result: Result.Result<A, E>,
  options: ResultOptions | undefined,
): Effect.Effect<A, E> {
  if (shouldSuspendResult(result, options)) {
    return Effect.never
  }
  return resultToEffect(result)
}

function shouldSuspendResult<A, E>(
  result: Result.Result<A, E>,
  options: ResultOptions | undefined,
): boolean {
  if (waitingSuspends(result, options)) {
    return true
  }
  return Result.isInitial(result)
}

function waitingSuspends<A, E>(
  result: Result.Result<A, E>,
  options: ResultOptions | undefined,
): boolean {
  if (shouldSuspendOnWaiting(options) === false) {
    return false
  }
  return result.waiting
}

function shouldSuspendOnWaiting(options: ResultOptions | undefined): boolean {
  if (options === undefined) {
    return false
  }
  return options.suspendOnWaiting === true
}

function resultToEffect<A, E>(result: Result.Result<A, E>): Effect.Effect<A, E> {
  if (Result.isFailure(result)) {
    return Exit.failCause(result.cause)
  }
  return succeedResult(result)
}

function succeedResult<A, E>(result: Result.Result<A, E>): Effect.Effect<A, E> {
  if (Result.isSuccess(result)) {
    return Effect.succeed(result.value)
  }
  return Effect.never
}

function resultOnceCallback<A, E>(
  lifetime: AnyLifetime,
  atom: Atom.Atom<Result.Result<A, E>>,
  options: ResultOptions | undefined,
  resume: (effect: Effect.Effect<A, E>) => void,
): Effect.Effect<void> | void {
  const result = lifetime.once(atom)
  if (isReadyResult(result, options)) {
    resumeReady(result, resume)
    return
  }
  return subscribeUntilReady(lifetime, atom, options, resume)
}

function isReadyResult<A, E>(
  result: Result.Result<A, E>,
  options: ResultOptions | undefined,
): boolean {
  if (Result.isInitial(result)) {
    return false
  }
  return waitingSuspends(result, options) === false
}

function subscribeUntilReady<A, E>(
  lifetime: AnyLifetime,
  atom: Atom.Atom<Result.Result<A, E>>,
  options: ResultOptions | undefined,
  resume: (effect: Effect.Effect<A, E>) => void,
): Effect.Effect<void> {
  const cancel = lifetime.node.registry.subscribe(atom, (next) => {
    onResultSubscription(next, options, cancel, resume)
  }, { immediate: false })
  return Effect.sync(cancel)
}

function onResultSubscription<A, E>(
  result: Result.Result<A, E>,
  options: ResultOptions | undefined,
  cancel: () => void,
  resume: (effect: Effect.Effect<A, E>) => void,
): void {
  if (shouldWaitForResult(result, options)) {
    return
  }
  cancel()
  resumeReady(result, resume)
}

function shouldWaitForResult<A, E>(
  result: Result.Result<A, E>,
  options: ResultOptions | undefined,
): boolean {
  if (Result.isInitial(result)) {
    return true
  }
  return waitingSuspends(result, options)
}

function resumeReady<A, E>(
  result: Result.Result<A, E>,
  resume: (effect: Effect.Effect<A, E>) => void,
): void {
  if (Result.isInitial(result)) {
    return
  }
  resume(Result.toExit(result))
}

function someFromOption<A>(result: Option.Option<A>): Effect.Effect<A> {
  if (Option.isNone(result)) {
    return Effect.never
  }
  return Effect.succeed(result.value)
}

function someOnceCallback<A>(
  lifetime: AnyLifetime,
  atom: Atom.Atom<Option.Option<A>>,
  resume: (effect: Effect.Effect<A>) => void,
): Effect.Effect<void> | void {
  const result = lifetime.once(atom)
  if (Option.isSome(result)) {
    return resume(Effect.succeed(result.value))
  }
  return subscribeUntilSome(lifetime, atom, resume)
}

function subscribeUntilSome<A>(
  lifetime: AnyLifetime,
  atom: Atom.Atom<Option.Option<A>>,
  resume: (effect: Effect.Effect<A>) => void,
): Effect.Effect<void> {
  const cancel = lifetime.node.registry.subscribe(atom, (next) => {
    onSomeSubscription(next, cancel, resume)
  }, { immediate: false })
  return Effect.sync(cancel)
}

function onSomeSubscription<A>(
  result: Option.Option<A>,
  cancel: () => void,
  resume: (effect: Effect.Effect<A>) => void,
): void {
  if (Option.isNone(result)) {
    return
  }
  cancel()
  resume(Effect.succeed(result.value))
}

function includeInitialValue(options: StreamOptions | undefined): boolean {
  if (options === undefined) {
    return true
  }
  return options.withoutInitialValue !== true
}

function streamResultEffect<A, E>(result: Result.Result<A, E>): Effect.Effect<A, E> {
  if (Result.isSuccess(result)) {
    return Effect.succeed(result.value)
  }
  return failIfFailure(result)
}

function failIfFailure<A, E>(result: Result.Result<A, E>): Effect.Effect<A, E> {
  if (Result.isFailure(result)) {
    return Effect.failCause(result.cause)
  }
  return Effect.never
}

function runFinalizers(lifetime: AnyLifetime): void {
  if (lifetime.finalizers === undefined) {
    return
  }
  runFinalizerList(lifetime, lifetime.finalizers)
}

function runFinalizerList(lifetime: AnyLifetime, finalizers: Array<() => void>): void {
  lifetime.finalizers = undefined
  runFinalizersFrom(finalizers, finalizers.length - 1)
}

function runFinalizersFrom(finalizers: Array<() => void>, i: number): void {
  if (i < 0) {
    return
  }
  runOneThenRest(finalizers, i)
}

function runOneThenRest(finalizers: Array<() => void>, i: number): void {
  runFinalizer(finalizers[i])
  runFinalizersFrom(finalizers, i - 1)
}

function runFinalizer(finalizer: (() => void) | undefined): void {
  if (finalizer !== undefined) {
    finalizer()
  }
}

const makeLifetime = <A>(node: NodeImpl<A>): Lifetime<A> => {
  const lifetime: Lifetime<A> = Object.assign(
    function get<A2>(atom: Atom.Atom<A2>): A2 {
      if (isDisposedOrFn(lifetime)) {
        return node.registry.get(atom)
      }
      return readAndLink(node, atom)
    },
    LifetimeProto,
    {
      isFn: false,
      disposed: false,
      finalizers: undefined,
      node,
      registry: node.registry,
    },
  )
  return lifetime
}

function readAndLink<A, A2>(node: NodeImpl<A>, atom: Atom.Atom<A2>): A2 {
  const parent = node.registry.ensureNode(atom)
  const value = parent.value()
  node.addParent(parent)
  return value
}

class WriteContextImpl<A> extends Pipeable.Class implements Atom.WriteContext<A> {
  constructor(
    registry: RegistryImpl,
    node: NodeImpl<A>,
  ) {
    super()
    this.registry = registry
    this.node = node
  }
  readonly registry: RegistryImpl
  readonly node: NodeImpl<A>
  get<A>(atom: Atom.Atom<A>): A {
    return this.registry.get(atom)
  }
  set<R, W>(atom: Atom.Writable<R, W>, value: W) {
    return this.registry.set(atom, value)
  }
  setSelf(value: A) {
    return this.node.setValue(value)
  }
  refreshSelf() {
    return this.node.invalidate()
  }
}

// -----------------------------------------------------------------------------
// batching
// -----------------------------------------------------------------------------

/**
 * @internal
 */
export const BatchPhase: {
  readonly disabled: 0
  readonly collect: 1
  readonly commit: 2
} = {
  disabled: 0,
  collect: 1,
  commit: 2,
}

/**
 * @internal
 */
export type BatchPhase = 0 | 1 | 2

/**
 * @internal
 */
export const batchState: {
  phase: BatchPhase
  depth: number
  stale: Array<AnyNode>
  notify: Set<AnyNode>
} = {
  phase: BatchPhase.disabled,
  depth: 0,
  stale: [],
  notify: new Set(),
}

/**
 * @internal
 */
export function runInternalBatch(f: () => void): void {
  batchState.phase = BatchPhase.collect
  batchState.depth++
  try {
    f()
    commitInternalBatchIfOutermost()
  } finally {
    finishInternalBatch()
  }
}

function commitInternalBatchIfOutermost(): void {
  if (batchState.depth === 1) {
    commitInternalBatch()
  }
}

function commitInternalBatch(): void {
  rebuildStaleNodes()
  notifyBatchedNodes()
}

function rebuildStaleNodes(): void {
  for (const node of batchState.stale) {
    batchRebuildNode(node)
  }
}

function notifyBatchedNodes(): void {
  batchState.phase = BatchPhase.commit
  for (const node of batchState.notify) {
    node.notify()
  }
  batchState.notify.clear()
}

function finishInternalBatch(): void {
  batchState.depth--
  resetBatchIfIdle()
}

function resetBatchIfIdle(): void {
  if (batchState.depth === 0) {
    batchState.phase = BatchPhase.disabled
    batchState.stale = []
  }
}

function batchRebuildNode(node: AnyNode) {
  restaleIfInvalidatedDuringBuild(node)
  rebuildParents(node)
  rebuildIfNotValid(node)
}

function restaleIfInvalidatedDuringBuild(node: AnyNode): void {
  if (node.state === NodeState.valid) {
    restaleValidIfInvalidatedDuringBuild(node)
  }
}

function restaleValidIfInvalidatedDuringBuild(node: AnyNode): void {
  if (node.invalidatedDuringBuild === false) {
    return
  }
  node.invalidatedDuringBuild = false
  node.state = NodeState.stale
  node.disposeLifetime()
}

function rebuildParents(node: AnyNode): void {
  for (const parent of node.parents) {
    rebuildParentIfNeeded(parent)
  }
}

function rebuildParentIfNeeded(parent: AnyNode): void {
  if (parent.state !== NodeState.valid) {
    batchRebuildNode(parent)
  }
}

function rebuildIfNotValid(node: AnyNode): void {
  if (node.state !== NodeState.valid) {
    node.value()
  }
}
