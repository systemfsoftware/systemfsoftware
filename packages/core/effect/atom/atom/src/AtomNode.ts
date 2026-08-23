import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Queue from 'effect/Queue'
import * as Stream from 'effect/Stream'
import type * as Atom from './Atom.js'
import { decideNodeFate } from './internal/NodeLifetime.js'
import type { RegistryImpl } from './Registry.js'
import * as Result from './Result.js'

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

  parents = new Set<NodeImpl<unknown>>()
  previousParents: Set<NodeImpl<unknown>> | undefined
  children = new Set<NodeImpl<unknown>>()
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
    const value = this._value
    const fate = decideNodeFate({
      keepAlive: this.atom.keepAlive,
      listenerCount: this.listeners.size,
      childCount: this.children.size,
      isLive: this.state !== 0,
      isWaiting: Result.isResult(value) && Result.isInitial(value) && value.waiting,
      idleTTL: this.atom.idleTTL,
      defaultIdleTTL: this.registry.defaultIdleTTL,
    })
    return Match.value(fate).pipe(
      Match.tags({
        Alive: () => false,
        RemoveNow: () => true,
        RemoveAfterTtl: () => true,
      }),
      Match.exhaustive,
    )
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

  addParent(parent: NodeImpl<unknown>): void {
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

  removeChild(child: NodeImpl<unknown>): void {
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

function childrenAreActive(children: Set<NodeImpl<unknown>>): boolean {
  if (children.size === 0) {
    return false
  }
  let current: Set<NodeImpl<unknown>> | undefined = children
  let stack: Set<NodeImpl<unknown>>[] | undefined
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
  readonly registry: RegistryImpl
  readonly node: NodeImpl<A>
  finalizers: (() => void)[] | undefined
  disposed: boolean
  readonly dispose: () => void
}

const LifetimeProto: Omit<Lifetime<unknown>, 'node' | 'finalizers' | 'disposed' | 'isFn' | 'registry'> = {
  addFinalizer(this: Lifetime<unknown>, f: () => void): void {
    if (this.disposed) return f()
    this.finalizers ??= []
    this.finalizers.push(f)
  },

  get<A>(this: Lifetime<unknown>, atom: Atom.Atom<A>): A {
    if (this.disposed) {
      return this.node.registry.get(atom)
    }
    const parent = this.node.registry.ensureNode(atom)
    const value = parent.value()
    this.node.addParent(parent)
    return value
  },

  result<A, E>(this: Lifetime<unknown>, atom: Atom.Atom<Result.Result<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): Effect.Effect<A, E> {
    if (this.disposed || this.isFn) {
      return this.resultOnce(atom, options)
    }
    const result = this.get(atom)
    if (options?.suspendOnWaiting && result.waiting) {
      return Effect.never
    }
    if (Result.isInitial(result)) {
      return Effect.never
    }
    if (Result.isFailure(result)) {
      return Exit.failCause(result.cause)
    }
    return Effect.succeed(result.value)
  },

  resultOnce<A, E>(this: Lifetime<unknown>, atom: Atom.Atom<Result.Result<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): Effect.Effect<A, E> {
    return Effect.callback<A, E>((resume) => {
      const result = this.once(atom)
      if (!Result.isInitial(result) && !(options?.suspendOnWaiting && result.waiting)) {
        return resume(Result.toExit(result))
      }
      const cancel = this.node.registry.subscribe(atom, (result) => {
        if (Result.isInitial(result) || (options?.suspendOnWaiting && result.waiting)) return
        cancel()
        resume(Result.toExit(result))
      }, { immediate: false })
      return Effect.sync(cancel)
    })
  },

  setResult<A, E, W>(
    this: Lifetime<unknown>,
    atom: Atom.Writable<Result.Result<A, E>, W>,
    value: W,
  ): Effect.Effect<A, E> {
    if (this.disposed) return Effect.never
    this.node.registry.set(atom, value)
    return this.resultOnce(atom, { suspendOnWaiting: true })
  },

  some<A>(this: Lifetime<unknown>, atom: Atom.Atom<Option.Option<A>>): Effect.Effect<A> {
    if (this.disposed || this.isFn) {
      return this.someOnce(atom)
    }
    const result = this.get(atom)
    return Option.isNone(result) ? Effect.never : Effect.succeed(result.value)
  },

  someOnce<A>(this: Lifetime<unknown>, atom: Atom.Atom<Option.Option<A>>): Effect.Effect<A> {
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

  once<A>(this: Lifetime<unknown>, atom: Atom.Atom<A>): A {
    return this.node.registry.get(atom)
  },

  self<A>(this: Lifetime<A>): Option.Option<A> {
    if (this.disposed) return Option.none()
    return this.node.valueOption()
  },

  refresh<A>(this: Lifetime<unknown>, atom: Atom.Atom<A>): void {
    if (this.disposed) return
    this.node.registry.refresh(atom)
  },

  refreshSelf(this: Lifetime<unknown>): void {
    if (this.disposed) return
    this.node.invalidate()
  },

  mount<A>(this: Lifetime<unknown>, atom: Atom.Atom<A>): void {
    if (this.disposed) return
    this.addFinalizer(this.node.registry.mount(atom))
  },

  subscribe<A>(this: Lifetime<unknown>, atom: Atom.Atom<A>, f: (_: A) => void, options?: {
    readonly immediate?: boolean
  }): void {
    if (this.disposed) return
    this.addFinalizer(this.node.registry.subscribe(atom, f, options))
  },

  setSelf<A>(this: Lifetime<unknown>, a: A): void {
    if (this.disposed) return
    this.node.setValue(a)
  },

  set<R, W>(this: Lifetime<unknown>, atom: Atom.Writable<R, W>, value: W): void {
    if (this.disposed) return
    this.node.registry.set(atom, value)
  },

  stream<A>(this: Lifetime<unknown>, atom: Atom.Atom<A>, options?: {
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

  streamResult<A, E>(this: Lifetime<unknown>, atom: Atom.Atom<Result.Result<A, E>>, options?: {
    readonly withoutInitialValue?: boolean
    readonly bufferSize?: number
  }): Stream.Stream<A, E> {
    return this.stream(atom, options).pipe(
      Stream.filter(Result.isNotInitial),
      Stream.mapEffect((result) => {
        if (Result.isSuccess(result)) {
          return Effect.succeed(result.value)
        }
        return Effect.failCause(result.cause)
      }),
    )
  },

  dispose(this: Lifetime<unknown>): void {
    this.disposed = true
    if (this.finalizers === undefined) {
      return
    }

    const finalizers = this.finalizers
    this.finalizers = undefined
    for (let i = finalizers.length - 1; i >= 0; i--) {
      const finalizer = finalizers[i]
      if (finalizer !== undefined) finalizer()
    }
  },
}

const makeLifetime = <A>(node: NodeImpl<A>): Lifetime<A> => {
  const lifetime: Lifetime<A> = Object.assign(
    function get<A2>(atom: Atom.Atom<A2>): A2 {
      if (lifetime.disposed) {
        return node.registry.get(atom)
      } else if (lifetime.isFn) {
        return node.registry.get(atom)
      }
      const parent = node.registry.ensureNode(atom)
      const value = parent.value()
      node.addParent(parent)
      return value
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

export const BatchPhase = {
  disabled: 0,
  collect: 1,
  commit: 2,
} as const

export type BatchPhase = typeof BatchPhase[keyof typeof BatchPhase]

export const batchState = {
  phase: BatchPhase.disabled as BatchPhase,
  depth: 0,
  stale: [] as NodeImpl<unknown>[],
  notify: new Set<NodeImpl<unknown>>(),
}

export function runInternalBatch(f: () => void): void {
  batchState.phase = BatchPhase.collect
  batchState.depth++
  try {
    f()
    if (batchState.depth === 1) {
      for (const node of batchState.stale) {
        batchRebuildNode(node)
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

function batchRebuildNode(node: NodeImpl<unknown>) {
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
