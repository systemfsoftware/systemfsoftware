import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Option from 'effect/Option'
import * as Queue from 'effect/Queue'
import * as Stream from 'effect/Stream'
import type * as Atom from '../Atom.js'
import type { RegistryImpl } from '../Registry.js'
import * as Result from '../Result.js'
import { decideNodeFate } from './node-lifetime.observer.js'

const notifyListener = (listener: () => void): void => {
  listener()
}

const NodeFlags = {
  alive: 1, // 1 << 0
  initialized: 2, // 1 << 1,
  waitingForValue: 4, // 1 << 2
} as const
type NodeFlags = typeof NodeFlags[keyof typeof NodeFlags]

const NodeState = {
  uninitialized: NodeFlags.alive | NodeFlags.waitingForValue,
  stale: NodeFlags.alive | NodeFlags.initialized | NodeFlags.waitingForValue,
  valid: NodeFlags.alive | NodeFlags.initialized,
  removed: 0,
} as const
type NodeState = number

/** @internal */
export class NodeImpl<A> {
  constructor(
    registry: RegistryImpl,
    atom: Atom.Atom<A>,
  ) {
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

  parents = new Set<NodeImpl<any>>()
  previousParents: Set<NodeImpl<any>> | undefined
  children = new Set<NodeImpl<any>>()
  listeners = new Set<() => void>()
  skipInvalidation = false
  building = false
  invalidatedDuringBuild = false

  currentState() {
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
    const value = this._value
    return decideNodeFate({
      keepAlive: this.atom.keepAlive,
      listenerCount: this.listeners.size,
      childCount: this.children.size,
      isLive: this.state !== 0,
      isWaiting: Result.isResult(value) && Result.isInitial(value) && value.waiting,
      idleTTL: this.atom.idleTTL,
      defaultIdleTTL: this.registry.defaultIdleTTL,
    })._tag !== 'Alive'
  }

  _value!: A
  value(): A {
    if ((this.state & NodeFlags.waitingForValue) !== 0) {
      this.lifetime = makeLifetime(this)
      this.building = true
      const value = this.atom.read(this.lifetime)
      this.building = false
      if ((this.state & NodeFlags.waitingForValue) !== 0) {
        if (this.preserveInitialValueOnBuild) {
          this.preserveInitialValueOnBuild = false
          this.state = NodeState.valid
        } else {
          this.setValue(value)
        }
      }

      if (this.previousParents) {
        const parents = this.previousParents
        this.previousParents = undefined
        for (const parent of parents) {
          parent.removeChild(this)
          if (parent.canBeRemoved) {
            this.registry.scheduleNodeRemoval(parent)
          }
        }
      }
    }

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
      this.preserveInitialValueOnBuild = true
      this.state = NodeState.stale
      this._value = value

      if (batchState.phase === BatchPhase.collect) {
        batchState.notify.add(this)
      } else {
        this.notify()
      }

      return
    }

    this.setValue(value)
  }

  setValue(value: A): void {
    if ((this.state & NodeFlags.initialized) === 0) {
      this.state = NodeState.valid
      this._value = value

      if (batchState.phase === BatchPhase.collect) {
        batchState.notify.add(this)
      } else {
        this.notify()
      }

      return
    }

    this.state = NodeState.valid
    if (this.atom.equals(this._value, value)) {
      return
    }

    this._value = value
    if (this.skipInvalidation) {
      this.skipInvalidation = false
    } else {
      this.invalidateChildren()
    }

    if (this.listeners.size > 0) {
      if (batchState.phase === BatchPhase.collect) {
        batchState.notify.add(this)
      } else {
        this.notify()
      }
    }
  }

  addParent(parent: NodeImpl<any>): void {
    this.parents.add(parent)
    if (this.previousParents !== undefined) {
      this.previousParents.delete(parent)
      if (this.previousParents.size === 0) {
        this.previousParents = undefined
      }
    }

    if (!parent.children.has(this)) {
      parent.children.add(this)
      if (parent.skipInvalidation) {
        parent.skipInvalidation = false
      }
    }
  }

  removeChild(child: NodeImpl<any>): void {
    this.children.delete(child)
  }

  invalidate(): void {
    if (this.building && batchState.phase === BatchPhase.collect) {
      this.invalidatedDuringBuild = true
    }
    if (this.state === NodeState.valid) {
      this.state = NodeState.stale
      this.disposeLifetime()
    }

    if (batchState.phase === BatchPhase.collect) {
      batchState.stale.push(this)
    } else if (this.atom.lazy && this.listeners.size === 0 && !childrenAreActive(this.children)) {
      this.invalidateChildren()
      this.skipInvalidation = true
    } else {
      this.value()
    }
  }

  invalidateChildren(): void {
    if (this.children.size === 0) {
      return
    }

    const children = this.children
    this.children = new Set()
    for (const child of children) {
      child.invalidate()
    }
  }

  notify(): void {
    this.listeners.forEach(notifyListener)

    if (batchState.phase === BatchPhase.commit) {
      batchState.notify.delete(this)
    }
  }

  disposeLifetime(): void {
    if (this.lifetime !== undefined) {
      this.lifetime.dispose()
      this.lifetime = undefined
    }

    if (this.parents.size !== 0) {
      this.previousParents = this.parents
      this.parents = new Set()
    }
  }

  remove() {
    this.state = NodeState.removed
    this.listeners.clear()

    if (this.lifetime === undefined) {
      return
    }

    this.disposeLifetime()

    if (this.previousParents === undefined) {
      return
    }

    const parents = this.previousParents
    this.previousParents = undefined
    for (const parent of parents) {
      parent.removeChild(this)
      if (parent.canBeRemoved) {
        this.registry.removeNode(parent)
      }
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

function childrenAreActive(children: Set<NodeImpl<any>>): boolean {
  if (children.size === 0) {
    return false
  }
  let current: Set<NodeImpl<any>> | undefined = children
  let stack: Array<Set<NodeImpl<any>>> | undefined
  let stackIndex = 0
  while (current !== undefined) {
    for (const child of current) {
      if (!child.atom.lazy || child.listeners.size > 0) {
        return true
      } else if (child.children.size > 0) {
        if (stack === undefined) {
          stack = [child.children]
        } else {
          stack.push(child.children)
        }
      }
    }
    current = stack?.[stackIndex++]
  }
  return false
}

interface Lifetime<A> extends Atom.AtomContext {
  isFn: boolean
  readonly node: NodeImpl<A>
  finalizers: Array<() => void> | undefined
  disposed: boolean
  readonly dispose: () => void
}

const LifetimeProto: Omit<Lifetime<any>, 'node' | 'finalizers' | 'disposed' | 'isFn'> = {
  get registry(): RegistryImpl {
    return (this as Lifetime<any>).node.registry
  },

  addFinalizer(this: Lifetime<any>, f: () => void): void {
    if (this.disposed) return f()
    this.finalizers ??= []
    this.finalizers.push(f)
  },

  get<A>(this: Lifetime<any>, atom: Atom.Atom<A>): A {
    if (this.disposed) {
      return this.node.registry.get(atom)
    }
    const parent = this.node.registry.ensureNode(atom)
    const value = parent.value()
    this.node.addParent(parent)
    return value
  },

  result<A, E>(this: Lifetime<any>, atom: Atom.Atom<Result.Result<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): Effect.Effect<A, E> {
    if (this.disposed || this.isFn) {
      return this.resultOnce(atom, options)
    }
    const result = this.get(atom)
    if (options?.suspendOnWaiting && result.waiting) {
      return Effect.never
    }
    switch (result._tag) {
      case 'Initial': {
        return Effect.never
      }
      case 'Failure': {
        return Exit.failCause(result.cause)
      }
      case 'Success': {
        return Effect.succeed(result.value)
      }
    }
  },

  resultOnce<A, E>(this: Lifetime<any>, atom: Atom.Atom<Result.Result<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): Effect.Effect<A, E> {
    return Effect.callback<A, E>((resume) => {
      const result = this.once(atom)
      if (result._tag !== 'Initial' && !(options?.suspendOnWaiting && result.waiting)) {
        return resume(Result.toExit(result))
      }
      const cancel = this.node.registry.subscribe(atom, (result) => {
        if (result._tag === 'Initial' || (options?.suspendOnWaiting && result.waiting)) return
        cancel()
        resume(Result.toExit(result))
      }, { immediate: false })
      return Effect.sync(cancel)
    })
  },

  setResult<A, E, W>(
    this: Lifetime<any>,
    atom: Atom.Writable<Result.Result<A, E>, W>,
    value: W,
  ): Effect.Effect<A, E> {
    if (this.disposed) return Effect.never
    this.node.registry.set(atom, value)
    return this.resultOnce(atom, { suspendOnWaiting: true })
  },

  some<A>(this: Lifetime<any>, atom: Atom.Atom<Option.Option<A>>): Effect.Effect<A> {
    if (this.disposed || this.isFn) {
      return this.someOnce(atom)
    }
    const result = this.get(atom)
    return result._tag === 'None' ? Effect.never : Effect.succeed(result.value)
  },

  someOnce<A>(this: Lifetime<any>, atom: Atom.Atom<Option.Option<A>>): Effect.Effect<A> {
    return Effect.callback<A>((resume) => {
      const result = this.once(atom)
      if (Option.isSome(result)) {
        return resume(Effect.succeed(result.value))
      }
      const cancel = this.node.registry.subscribe(atom, (result) => {
        if (Option.isNone(result)) return
        cancel()
        resume(Effect.succeed(result.value))
      }, { immediate: false })
      return Effect.sync(cancel)
    })
  },

  once<A>(this: Lifetime<any>, atom: Atom.Atom<A>): A {
    return this.node.registry.get(atom)
  },

  self<A>(this: Lifetime<any>): Option.Option<A> {
    if (this.disposed) return Option.none()
    return this.node.valueOption()
  },

  refresh<A>(this: Lifetime<any>, atom: Atom.Atom<A>): void {
    if (this.disposed) return
    this.node.registry.refresh(atom)
  },

  refreshSelf(this: Lifetime<any>): void {
    if (this.disposed) return
    this.node.invalidate()
  },

  mount<A>(this: Lifetime<any>, atom: Atom.Atom<A>): void {
    if (this.disposed) return
    this.addFinalizer(this.node.registry.mount(atom))
  },

  subscribe<A>(this: Lifetime<any>, atom: Atom.Atom<A>, f: (_: A) => void, options?: {
    readonly immediate?: boolean
  }): void {
    if (this.disposed) return
    this.addFinalizer(this.node.registry.subscribe(atom, f, options))
  },

  setSelf<A>(this: Lifetime<any>, a: A): void {
    if (this.disposed) return
    this.node.setValue(a)
  },

  set<R, W>(this: Lifetime<any>, atom: Atom.Writable<R, W>, value: W): void {
    if (this.disposed) return
    this.node.registry.set(atom, value)
  },

  stream<A>(this: Lifetime<any>, atom: Atom.Atom<A>, options?: {
    readonly withoutInitialValue?: boolean
  }) {
    if (this.disposed) return Stream.empty
    return Stream.callback<A>((queue) =>
      Effect.sync(() => {
        this.subscribe(atom, (value) => Queue.offerUnsafe(queue, value), {
          immediate: !options?.withoutInitialValue,
        })
      })
    )
  },

  streamResult<A, E>(this: Lifetime<any>, atom: Atom.Atom<Result.Result<A, E>>, options?: {
    readonly withoutInitialValue?: boolean
    readonly bufferSize?: number
  }): Stream.Stream<A, E> {
    return this.stream(atom, options).pipe(
      Stream.filter(Result.isNotInitial),
      Stream.mapEffect((result) =>
        result._tag === 'Success' ? Effect.succeed(result.value) : Effect.failCause(result.cause)
      ),
    )
  },

  dispose(this: Lifetime<any>): void {
    this.disposed = true
    if (this.finalizers === undefined) {
      return
    }

    const finalizers = this.finalizers
    this.finalizers = undefined
    for (let i = finalizers.length - 1; i >= 0; i--) {
      finalizers[i]!()
    }
  },
}

const makeLifetime = <A>(node: NodeImpl<A>): Lifetime<A> => {
  function get<A>(atom: Atom.Atom<A>): A {
    if (get.disposed) {
      return node.registry.get(atom)
    } else if (get.isFn) {
      return node.registry.get(atom)
    }
    const parent = node.registry.ensureNode(atom)
    const value = parent.value()
    node.addParent(parent)
    return value
  }
  Object.setPrototypeOf(get, LifetimeProto)
  get.isFn = false
  get.disposed = false
  get.finalizers = undefined
  get.node = node
  return get as Lifetime<A>
}

class WriteContextImpl<A> implements Atom.WriteContext<A> {
  constructor(
    registry: RegistryImpl,
    node: NodeImpl<A>,
  ) {
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
  setSelf(value: any) {
    return this.node.setValue(value)
  }
  refreshSelf() {
    return this.node.invalidate()
  }
}

// -----------------------------------------------------------------------------
// batching
// -----------------------------------------------------------------------------

/** @internal */
export const BatchPhase = {
  disabled: 0,
  collect: 1,
  commit: 2,
} as const

/** @internal */
export type BatchPhase = typeof BatchPhase[keyof typeof BatchPhase]

/** @internal */
export const batchState = {
  phase: BatchPhase.disabled as BatchPhase,
  depth: 0,
  stale: [] as Array<NodeImpl<any>>,
  notify: new Set<NodeImpl<any>>(),
}

/** @internal */
export function batch(f: () => void): void {
  batchState.phase = BatchPhase.collect
  batchState.depth++
  try {
    f()
    if (batchState.depth === 1) {
      for (let i = 0; i < batchState.stale.length; i++) {
        batchRebuildNode(batchState.stale[i]!)
      }
      batchState.phase = BatchPhase.commit
      for (const node of batchState.notify) {
        node.notify()
      }
      batchState.notify.clear()
    }
  } finally {
    batchState.depth--
    if (batchState.depth === 0) {
      batchState.phase = BatchPhase.disabled
      batchState.stale = []
    }
  }
}

function batchRebuildNode(node: NodeImpl<any>) {
  if (node.state === NodeState.valid) {
    if (!node.invalidatedDuringBuild) {
      return
    }
    node.invalidatedDuringBuild = false
    node.state = NodeState.stale
    node.disposeLifetime()
  }

  for (const parent of node.parents) {
    if (parent.state !== NodeState.valid) {
      batchRebuildNode(parent)
    }
  }

  if (node.state !== NodeState.valid) {
    node.value()
  }
}
