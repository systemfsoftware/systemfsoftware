/**
 * Mutable reactive references for local, in-memory state.
 *
 * `AtomRef` provides small observable state cells that can be read, updated,
 * mapped, and subscribed to without going through a registry. Mutable
 * refs can also create refs for nested properties. The module also provides a
 * collection helper that stores item refs and notifies subscribers when items are
 * inserted, removed, or changed.
 *
 * @since 4.0.0
 */
import * as Equal from 'effect/Equal'
import type { Equal as EqualType } from 'effect/Equal'
import * as Hash from 'effect/Hash'
import * as Pipeable from 'effect/Pipeable'
import { hasProperty } from 'effect/Predicate'

type AnyReadonlyRef<A = unknown> = ReadonlyRef<A>
type AnyValue<A = unknown> = A
/**
 * The literal type used to identify `AtomRef` values.
 *
 * @since 4.0.0
 */
export type TypeId = '~effect/reactivity/AtomRef'

/**
 * The runtime type id used to identify `AtomRef` values.
 *
 * @since 4.0.0
 */
export const TypeId: TypeId = '~effect/reactivity/AtomRef'

/**
 * A read-only reactive reference.
 *
 * **Details**
 *
 * It exposes a stable key, the current value, subscriptions to value changes, and
 * `map` for creating derived read-only references. Equality and hashing are based
 * on the current value.
 *
 * @since 4.0.0
 */
export interface ReadonlyRef<A> extends EqualType {
  readonly [TypeId]: TypeId
  readonly key: string
  readonly value: A
  readonly subscribe: (f: (a: A) => void) => () => void
  readonly map: <B>(f: (a: A) => B) => ReadonlyRef<B>
}

/**
 * A mutable reactive reference.
 *
 * **Details**
 *
 * It supports replacing the whole value, updating it from the current value, and
 * creating mutable references to nested properties.
 *
 * @since 4.0.0
 */
export interface AtomRef<A> extends ReadonlyRef<A> {
  readonly prop: <K extends keyof A>(prop: K) => AtomRef<A[K]>
  readonly set: (value: A) => AtomRef<A>
  readonly update: (f: (value: A) => A) => AtomRef<A>
}

/**
 * A reactive collection of mutable item references.
 *
 * **Details**
 *
 * The collection can push, insert, and remove item refs, and `toArray` returns the
 * current raw item values.
 *
 * @since 4.0.0
 */
export interface Collection<A> extends ReadonlyRef<readonly AtomRef<A>[]> {
  readonly push: (item: A) => Collection<A>
  readonly insertAt: (index: number, item: A) => Collection<A>
  readonly remove: (ref: AtomRef<A>) => Collection<A>
  readonly toArray: () => A[]
}

/**
 * Creates a mutable reactive reference initialized with the supplied value.
 *
 * @since 4.0.0
 */
export const make = <A>(value: A): AtomRef<A> => new AtomRefImpl(value)

/**
 * Creates a reactive collection from an iterable of initial item values.
 *
 * **Details**
 *
 * Each item is wrapped in an `AtomRef`, and changes to item refs notify the
 * collection subscribers.
 *
 * @since 4.0.0
 */
export const collection = <A>(items: Iterable<A>): Collection<A> => new CollectionImpl(items)

const isReadonlyRef = (u: unknown): u is AnyReadonlyRef => hasProperty(u, TypeId)

const isArrayWithProp = <A, K extends keyof A>(value: A, _prop: K): value is A & Array<A[K]> => Array.isArray(value)

const hasProp = <A, K extends PropertyKey>(value: A, prop: K): boolean => {
  if (value != null) {
    return propInObject(value, prop)
  }
  return false
}

const propInObject = <T = unknown>(value: NonNullable<T>, prop: PropertyKey): boolean => {
  const boxed: AnyValue = Object(value)
  return hasKey(boxed, prop)
}

const isInTarget = (value: unknown): value is object => {
  if (typeof value === 'object') {
    return value !== null
  }
  return typeof value === 'function'
}

const hasKey = <T = unknown>(value: T, prop: PropertyKey): boolean => {
  if (isInTarget(value)) {
    return prop in value
  }
  return false
}

const emitIfChanged = <B>(next: B, previous: B, f: (value: B) => void): B => {
  if (Equal.equals(next, previous)) {
    return previous
  }
  f(next)
  return next
}

const emitPropIfPresent = <A, K extends keyof A>(
  prop: K,
  a: A,
  previous: A[K],
  f: (value: A[K]) => void,
): A[K] => {
  if (hasProp(a, prop)) {
    return emitIfChanged(a[prop], previous, f)
  }
  return previous
}

const keyState = {
  count: 0,
  generate() {
    return `AtomRef-${this.count++}`
  },
}
type Listener<A> = {
  readonly f: (a: A) => void
  prev: Listener<A> | null
  next: Listener<A> | null
}

const linkListener = <A>(self: ReadonlyRefImpl<A>, listener: Listener<A>): void => {
  if (self.listeners !== null) {
    self.listeners.prev = listener
  }
}

const unlinkIfHead = <A>(self: ReadonlyRefImpl<A>, listener: Listener<A>): void => {
  if (self.listeners === listener) {
    self.listeners = listener.next
  }
}

const unlinkPrev = <A>(listener: Listener<A>): void => {
  if (listener.prev !== null) {
    listener.prev.next = listener.next
  }
}

const unlinkNext = <A>(listener: Listener<A>): void => {
  if (listener.next !== null) {
    listener.next.prev = listener.prev
  }
}

const unlinkListener = <A>(self: ReadonlyRefImpl<A>, listener: Listener<A>): void => {
  unlinkIfHead(self, listener)
  unlinkPrev(listener)
  unlinkNext(listener)
}

class ReadonlyRefImpl<A> extends Pipeable.Class implements ReadonlyRef<A> {
  readonly [TypeId]: TypeId
  readonly key = keyState.generate()
  public value: A
  constructor(value: A) {
    super()
    this[TypeId] = TypeId
    this.value = value
  }

  [Equal.symbol](that: Equal.Equal) {
    return isReadonlyRef(that) && Equal.equals(this.value, that.value)
  }

  [Hash.symbol]() {
    return Hash.hash(this.value)
  }

  listeners: Listener<A> | null = null

  notify(a: A) {
    let listener = this.listeners
    while (listener !== null) {
      listener.f(a)
      listener = listener.next
    }
  }

  subscribe(f: (a: A) => void): () => void {
    const listener: Listener<A> = {
      f,
      prev: null,
      next: this.listeners,
    }
    linkListener(this, listener)
    this.listeners = listener

    return () => {
      unlinkListener(this, listener)
    }
  }

  map<B>(f: (a: A) => B): ReadonlyRef<B> {
    return new MapRefImpl(this, f)
  }
}

class AtomRefImpl<A> extends ReadonlyRefImpl<A> implements AtomRef<A> {
  prop<K extends keyof A>(prop: K): AtomRef<A[K]> {
    return new PropRefImpl(this, prop)
  }
  set(value: A) {
    if (Equal.equals(value, this.value)) {
      return this
    }
    this.value = value
    this.notify(value)
    return this
  }

  update(f: (value: A) => A) {
    return this.set(f(this.value))
  }
}

class MapRefImpl<A, B> extends Pipeable.Class implements ReadonlyRef<B> {
  readonly [TypeId]: TypeId
  readonly key = keyState.generate()
  readonly parent: ReadonlyRef<A>
  readonly transform: (a: A) => B
  constructor(parent: ReadonlyRef<A>, transform: (a: A) => B) {
    super()
    this[TypeId] = TypeId
    this.parent = parent
    this.transform = transform
  }
  [Equal.symbol](that: Equal.Equal) {
    return isReadonlyRef(that) && Equal.equals(this.value, that.value)
  }
  [Hash.symbol]() {
    return Hash.hash(this.value)
  }
  get value() {
    return this.transform(this.parent.value)
  }
  subscribe(f: (a: B) => void): () => void {
    let previous = this.transform(this.parent.value)
    return this.parent.subscribe((a) => {
      const next = this.transform(a)
      if (Equal.equals(next, previous)) {
        return
      }
      previous = next
      f(next)
    })
  }
  map<C>(f: (a: B) => C): ReadonlyRef<C> {
    return new MapRefImpl(this, f)
  }
}

class PropRefImpl<A, K extends keyof A> extends Pipeable.Class implements AtomRef<A[K]> {
  readonly [TypeId]: TypeId
  readonly key = keyState.generate()
  private previous: A[K]
  readonly parent: AtomRef<A>
  readonly _prop: K

  constructor(parent: AtomRef<A>, _prop: K) {
    super()
    this[TypeId] = TypeId
    this.parent = parent
    this._prop = _prop
    this.previous = parent.value[_prop]
  }
  [Equal.symbol](that: Equal.Equal) {
    return isReadonlyRef(that) && Equal.equals(this.value, that.value)
  }
  [Hash.symbol]() {
    return Hash.hash(this.value)
  }
  get value() {
    const parentValue = this.parent.value
    if (hasProp(parentValue, this._prop)) {
      this.previous = parentValue[this._prop]
    }
    return this.previous
  }
  subscribe(f: (a: A[K]) => void): () => void {
    let previous = this.value
    return this.parent.subscribe((a) => {
      previous = emitPropIfPresent(this._prop, a, previous, f)
    })
  }
  map<C>(f: (a: A[K]) => C): ReadonlyRef<C> {
    return new MapRefImpl(this, f)
  }
  prop<CK extends keyof A[K]>(prop: CK): AtomRef<A[K][CK]> {
    return new PropRefImpl(this, prop)
  }
  set(value: A[K]): AtomRef<A[K]> {
    if (isArrayWithProp(this.parent.value, this._prop)) {
      const newArray = Object.assign(new Array<A[K]>(), this.parent.value)
      newArray[Number(this._prop)] = value
      this.parent.set(newArray)
    } else {
      this.parent.set({
        ...this.parent.value,
        [this._prop]: value,
      })
    }
    return this
  }
  update(f: (value: A[K]) => A[K]): AtomRef<A[K]> {
    if (isArrayWithProp(this.parent.value, this._prop)) {
      const newArray = Object.assign(new Array<A[K]>(), this.parent.value)
      newArray[Number(this._prop)] = f(this.parent.value[this._prop])
      this.parent.set(newArray)
    } else {
      this.parent.set({
        ...this.parent.value,
        [this._prop]: f(this.parent.value[this._prop]),
      })
    }
    return this
  }
}

class CollectionImpl<A> extends ReadonlyRefImpl<AtomRef<A>[]> implements Collection<A> {
  private readonly linked = new Set<AtomRef<A>>()

  constructor(items: Iterable<A>) {
    super([])
    for (const item of items) {
      this.value.push(this.makeRef(item))
    }
  }

  makeRef(value: A) {
    const ref = new AtomRefImpl(value)
    let proxy!: AtomRef<A>
    const notify = (value: A) => {
      ref.notify(value)
      if (this.linked.has(proxy)) {
        this.notify(this.value)
      }
    }
    proxy = new Proxy(ref, {
      get(target, p, receiver) {
        if (p === 'notify') {
          return notify
        }
        const value: AnyValue = Reflect.get(target, p, receiver)
        return value
      },
    })
    this.linked.add(proxy)
    return proxy
  }

  push(item: A) {
    const ref = this.makeRef(item)
    this.value.push(ref)
    this.notify(this.value)
    return this
  }

  insertAt(index: number, item: A) {
    const ref = this.makeRef(item)
    this.value.splice(index, 0, ref)
    this.notify(this.value)
    return this
  }

  remove(ref: AtomRef<A>) {
    const index = this.value.indexOf(ref)
    if (index !== -1) {
      this.value.splice(index, 1)
      this.linked.delete(ref)
      this.notify(this.value)
    }
    return this
  }

  toArray() {
    return this.value.map((ref) => ref.value)
  }
}
