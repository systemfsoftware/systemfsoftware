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
import { Handle } from '@systemfsoftware/effect-cell-types'
import * as Equal from 'effect/Equal'
import type { Equal as EqualType } from 'effect/Equal'
import { dual } from 'effect/Function'
import * as Hash from 'effect/Hash'
import * as Pipeable from 'effect/Pipeable'

type Top<A = unknown> = A
type AnyValue<A = unknown> = A

/**
 * The identity every ref handle carries.
 *
 * @since 4.0.0
 */
export const TypeId: unique symbol = Symbol.for('~effect/reactivity/AtomRef')

/**
 * The runtime type id used to identify `AtomRef` values.
 *
 * @since 4.0.0
 */
export type TypeId = typeof TypeId

/**
 * The protocol data every ref handle carries: equality and hashing are decided
 * by the current value of the ref.
 *
 * @since 4.0.0
 */
export interface RefProtocol {
  readonly [Equal.symbol]: (that: EqualType) => boolean
  readonly [Hash.symbol]: () => number
}

/**
 * The internal machinery behind a read-only ref handle.
 *
 * @since 4.0.0
 */
export interface ReadonlyRefEngine<A> {
  value(): A
  subscribe(f: (a: A) => void): () => void
  map<B>(f: (a: A) => B): ReadonlyRef<B>
  equals(that: EqualType): boolean
  hash(): number
}

/**
 * The internal machinery behind a mutable ref handle.
 *
 * @since 4.0.0
 */
export interface AtomRefEngine<A> extends ReadonlyRefEngine<A> {
  set(value: A): void
  update(f: (value: A) => A): void
  prop<K extends keyof A>(prop: K): AtomRef<A[K]>
}

/**
 * The internal machinery behind a collection handle.
 *
 * @since 4.0.0
 */
export interface CollectionEngine<A> extends ReadonlyRefEngine<readonly AtomRef<A>[]> {
  push(item: A): void
  insertAt(index: number, item: A): void
  remove(ref: AtomRef<A>): void
  toArray(): A[]
}

/**
 * The slot a read-only ref handle carries: its engine typed by the value the
 * handle is indexed at.
 *
 * @since 4.0.0
 */
export interface ReadonlyRefSlot extends Handle.Indexed {
  readonly slot: ReadonlyRefEngine<this['Index']>
}

/**
 * The slot a mutable ref handle carries: its engine typed by the value the
 * handle is indexed at.
 *
 * @since 4.0.0
 */
export interface AtomRefSlot extends Handle.Indexed {
  readonly slot: AtomRefEngine<this['Index']>
}

/**
 * The item type of the item-ref array a collection handle is indexed at.
 */
type ItemOf<X> = X extends readonly AtomRef<infer A>[] ? A : never

/**
 * The slot a collection handle carries: its engine typed by the item type of
 * the item-ref array the handle is indexed at. A collection is indexed at the
 * refs it carries, so it stays a `ReadonlyRef` of those refs.
 *
 * @since 4.0.0
 */
export interface CollectionSlot extends Handle.Indexed {
  readonly slot: CollectionEngine<ItemOf<this['Index']>>
}

const Refs = Handle.make<RefProtocol, ReadonlyRefSlot, Top>()(TypeId)

const MutableRefs = Handle.make<RefProtocol, AtomRefSlot, Top>()(TypeId)

const Collections = Handle.make<RefProtocol, CollectionSlot, Top>()(TypeId)

/**
 * A read-only reactive reference.
 *
 * **Details**
 *
 * It is a handle value: the protocol record minted by the kind, carrying
 * equality and hashing by the current value and a private slot holding the
 * engine behind it. The current value, the subscriptions, and the derived views
 * are reached through the `dual` functions in this module, never through methods
 * on the handle. The handle value itself is the ref's identity.
 *
 * Equality and hashing are based on the current value.
 *
 * @since 4.0.0
 */
export type ReadonlyRef<A> = Handle.Handle<typeof TypeId, RefProtocol, ReadonlyRefSlot, A>

/**
 * A mutable reactive reference.
 *
 * **Details**
 *
 * The whole value can be replaced, updated from the current value, and
 * mutable references to nested properties can be created. All of that is
 * reached through the `dual` functions in this module.
 *
 * @since 4.0.0
 */
export type AtomRef<A> = Handle.Handle<typeof TypeId, RefProtocol, AtomRefSlot, A>

/**
 * A reactive collection of mutable item references.
 *
 * **Details**
 *
 * A collection is indexed at the item refs it carries, so it is a
 * `ReadonlyRef` of those refs: reading or subscribing to it reports the current
 * refs. Items can be added and removed and the raw item values can be listed.
 * Every collection operation is a `dual` function in this module.
 *
 * @since 4.0.0
 */
export type Collection<A> = Handle.Handle<typeof TypeId, RefProtocol, CollectionSlot, readonly AtomRef<A>[]>

/**
 * Returns `true` when a value is a reactive reference.
 *
 * @since 4.0.0
 */
export const isReadonlyRef = Refs.is

const refProtocol = <A>(self: ReadonlyRefEngine<A>): RefProtocol => ({
  [Equal.symbol]: (that) => isReadonlyRef(that) && self.equals(that),
  [Hash.symbol]: () => self.hash(),
})

const mintReadonlyRef = <A>(self: ReadonlyRefEngine<A>): ReadonlyRef<A> => Refs.make<A>(refProtocol(self), self)

const mintAtomRef = <A>(self: AtomRefEngine<A>): AtomRef<A> => MutableRefs.make<A>(refProtocol(self), self)

const mintCollection = <A>(self: CollectionEngine<A>): Collection<A> =>
  Collections.make<readonly AtomRef<A>[]>(refProtocol(self), self)

const collectionEngineOf = <A>(self: Collection<A>): CollectionEngine<A> =>
  Collections.slot<readonly AtomRef<A>[]>(self)

/**
 * Creates a mutable reactive reference initialized with the supplied value.
 *
 * @since 4.0.0
 */
export const make = <A>(value: A): AtomRef<A> => mintAtomRef(new AtomRefEngineImpl(value))

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
export const collection = <A>(items: Iterable<A>): Collection<A> => mintCollection(new CollectionImpl(items))

/**
 * Reads the current value of a reactive reference.
 *
 * @since 4.0.0
 */
export const get = <A>(self: ReadonlyRef<A>): A => Refs.slot<A>(self).value()

/**
 * Replaces the whole value of a mutable reactive reference. Equal values leave
 * the ref untouched.
 *
 * @since 4.0.0
 */
export const set: {
  <A>(value: A): (self: AtomRef<A>) => AtomRef<A>
  <A>(self: AtomRef<A>, value: A): AtomRef<A>
} = dual(2, <A>(self: AtomRef<A>, value: A): AtomRef<A> => {
  MutableRefs.slot<A>(self).set(value)
  return self
})

/**
 * Replaces the whole value using the current value of a mutable reactive
 * reference. Equal results leave the ref untouched.
 *
 * @since 4.0.0
 */
export const update: {
  <A>(f: (value: A) => A): (self: AtomRef<A>) => AtomRef<A>
  <A>(self: AtomRef<A>, f: (value: A) => A): AtomRef<A>
} = dual(2, <A>(self: AtomRef<A>, f: (value: A) => A): AtomRef<A> => {
  MutableRefs.slot<A>(self).update(f)
  return self
})

/**
 * Listens to value changes of a reactive reference and returns a function that
 * removes the listener again.
 *
 * @since 4.0.0
 */
export const subscribe: {
  <A>(f: (a: A) => void): (self: ReadonlyRef<A>) => () => void
  <A>(self: ReadonlyRef<A>, f: (a: A) => void): () => void
} = dual(2, <A>(self: ReadonlyRef<A>, f: (a: A) => void): () => void => Refs.slot<A>(self).subscribe(f))

/**
 * Creates a read-only reactive reference derived from the current value.
 *
 * @since 4.0.0
 */
export const map: {
  <A, B>(f: (a: A) => B): (self: ReadonlyRef<A>) => ReadonlyRef<B>
  <A, B>(self: ReadonlyRef<A>, f: (a: A) => B): ReadonlyRef<B>
} = dual(2, <A, B>(self: ReadonlyRef<A>, f: (a: A) => B): ReadonlyRef<B> => Refs.slot<A>(self).map(f))

/**
 * Creates a mutable reactive reference to one property of the current value.
 *
 * @since 4.0.0
 */
export const prop: {
  <A, K extends keyof A>(prop: K): (self: AtomRef<A>) => AtomRef<A[K]>
  <A, K extends keyof A>(self: AtomRef<A>, prop: K): AtomRef<A[K]>
} = dual(2, <A, K extends keyof A>(self: AtomRef<A>, prop: K): AtomRef<A[K]> => MutableRefs.slot<A>(self).prop(prop))

/**
 * Appends an item to the end of a reactive collection.
 *
 * @since 4.0.0
 */
export const push: {
  <A>(item: A): (self: Collection<A>) => Collection<A>
  <A>(self: Collection<A>, item: A): Collection<A>
} = dual(2, <A>(self: Collection<A>, item: A): Collection<A> => {
  collectionEngineOf(self).push(item)
  return self
})

/**
 * Inserts an item into a reactive collection at the supplied index.
 *
 * @since 4.0.0
 */
export const insertAt: {
  <A>(index: number, item: A): (self: Collection<A>) => Collection<A>
  <A>(self: Collection<A>, index: number, item: A): Collection<A>
} = dual(3, <A>(self: Collection<A>, index: number, item: A): Collection<A> => {
  collectionEngineOf(self).insertAt(index, item)
  return self
})

/**
 * Removes a reactive reference from a reactive collection. Removing a reference
 * that is not part of the collection leaves the collection untouched.
 *
 * @since 4.0.0
 */
export const remove: {
  <A>(ref: AtomRef<A>): (self: Collection<A>) => Collection<A>
  <A>(self: Collection<A>, ref: AtomRef<A>): Collection<A>
} = dual(2, <A>(self: Collection<A>, ref: AtomRef<A>): Collection<A> => {
  collectionEngineOf(self).remove(ref)
  return self
})

/**
 * Lists the current item values of a reactive collection.
 *
 * @since 4.0.0
 */
export const toArray = <A>(self: Collection<A>): A[] => collectionEngineOf(self).toArray()

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

type Listener<A> = {
  readonly f: (a: A) => void
  prev: Listener<A> | null
  next: Listener<A> | null
}

interface Listeners<A> {
  listeners: Listener<A> | null
}

const linkListener = <A>(self: Listeners<A>, listener: Listener<A>): void => {
  if (self.listeners !== null) {
    self.listeners.prev = listener
  }
}

const unlinkIfHead = <A>(self: Listeners<A>, listener: Listener<A>): void => {
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

const unlinkListener = <A>(self: Listeners<A>, listener: Listener<A>): void => {
  unlinkIfHead(self, listener)
  unlinkPrev(listener)
  unlinkNext(listener)
}

class ValueRefEngine<A> extends Pipeable.Class implements ReadonlyRefEngine<A>, Listeners<A> {
  current: A
  listeners: Listener<A> | null = null

  constructor(value: A) {
    super()
    this.current = value
  }

  value(): A {
    return this.current
  }

  equals(that: EqualType): boolean {
    return isReadonlyRef(that) && Equal.equals(this.current, Refs.slot(that).value())
  }

  hash(): number {
    return Hash.hash(this.current)
  }

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
    return mintReadonlyRef(new MapRefEngine(this, f))
  }
}

class AtomRefEngineImpl<A> extends ValueRefEngine<A> implements AtomRefEngine<A> {
  set(value: A) {
    if (Equal.equals(value, this.current)) {
      return
    }
    this.current = value
    this.notify(value)
  }

  update(f: (value: A) => A) {
    this.set(f(this.current))
  }

  prop<K extends keyof A>(prop: K): AtomRef<A[K]> {
    return mintAtomRef(new PropRefEngine(this, prop))
  }
}

class MapRefEngine<A, B> extends Pipeable.Class implements ReadonlyRefEngine<B> {
  readonly parent: ReadonlyRefEngine<A>
  readonly transform: (a: A) => B

  constructor(parent: ReadonlyRefEngine<A>, transform: (a: A) => B) {
    super()
    this.parent = parent
    this.transform = transform
  }

  value(): B {
    return this.transform(this.parent.value())
  }

  equals(that: EqualType): boolean {
    return isReadonlyRef(that) && Equal.equals(this.value(), Refs.slot(that).value())
  }

  hash(): number {
    return Hash.hash(this.value())
  }

  subscribe(f: (a: B) => void): () => void {
    let previous = this.transform(this.parent.value())
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
    return mintReadonlyRef(new MapRefEngine(this, f))
  }
}

class PropRefEngine<A, K extends keyof A> extends Pipeable.Class implements AtomRefEngine<A[K]> {
  private previous: A[K]
  readonly parent: AtomRefEngine<A>
  readonly _prop: K

  constructor(parent: AtomRefEngine<A>, _prop: K) {
    super()
    this.parent = parent
    this._prop = _prop
    this.previous = parent.value()[_prop]
  }

  equals(that: EqualType): boolean {
    return isReadonlyRef(that) && Equal.equals(this.value(), Refs.slot(that).value())
  }

  hash(): number {
    return Hash.hash(this.value())
  }

  value(): A[K] {
    const parentValue = this.parent.value()
    if (hasProp(parentValue, this._prop)) {
      this.previous = parentValue[this._prop]
    }
    return this.previous
  }

  subscribe(f: (a: A[K]) => void): () => void {
    let previous = this.value()
    return this.parent.subscribe((a) => {
      previous = emitPropIfPresent(this._prop, a, previous, f)
    })
  }

  map<C>(f: (a: A[K]) => C): ReadonlyRef<C> {
    return mintReadonlyRef(new MapRefEngine(this, f))
  }

  prop<CK extends keyof A[K]>(prop: CK): AtomRef<A[K][CK]> {
    return mintAtomRef(new PropRefEngine(this, prop))
  }

  set(value: A[K]): void {
    this.writeParent((current) => {
      if (isArrayWithProp(current, this._prop)) {
        const newArray = Object.assign(new Array<A[K]>(), current)
        newArray[Number(this._prop)] = value
        return newArray
      }
      return {
        ...current,
        [this._prop]: value,
      }
    })
  }

  update(f: (value: A[K]) => A[K]): void {
    this.writeParent((current) => {
      if (isArrayWithProp(current, this._prop)) {
        const newArray = Object.assign(new Array<A[K]>(), current)
        newArray[Number(this._prop)] = f(current[this._prop])
        return newArray
      }
      return {
        ...current,
        [this._prop]: f(current[this._prop]),
      }
    })
  }

  writeParent(write: (current: A) => A): void {
    this.parent.set(write(this.parent.value()))
  }
}

class CollectionImpl<A> extends ValueRefEngine<readonly AtomRef<A>[]> implements CollectionEngine<A> {
  private readonly linked = new Set<CollectionItemEngine<A>>()
  private items: AtomRef<A>[] = []

  override value(): readonly AtomRef<A>[] {
    return this.items
  }

  constructor(items: Iterable<A>) {
    super([])
    for (const item of items) {
      this.items.push(this.makeRef(item))
    }
  }

  makeRef(value: A): AtomRef<A> {
    const itemEngine = new CollectionItemEngine<A>(value, this)
    this.linked.add(itemEngine)
    return mintAtomRef(itemEngine)
  }

  itemChanged(itemEngine: CollectionItemEngine<A>) {
    if (this.linked.has(itemEngine)) {
      this.notify(this.value())
    }
  }

  push(item: A) {
    this.items.push(this.makeRef(item))
    this.notify(this.value())
  }

  insertAt(index: number, item: A) {
    this.items.splice(index, 0, this.makeRef(item))
    this.notify(this.value())
  }

  remove(ref: AtomRef<A>) {
    const index = this.items.indexOf(ref)
    if (index !== -1) {
      this.items.splice(index, 1)
      this.unlink(ref)
      this.notify(this.value())
    }
  }

  unlink(ref: AtomRef<A>) {
    const itemEngine = MutableRefs.slot<A>(ref)
    if (isCollectionItemEngine(itemEngine)) {
      this.linked.delete(itemEngine)
    }
  }

  toArray(): A[] {
    return this.items.map((ref) => Refs.slot<A>(ref).value())
  }
}

const isCollectionItemEngine = <A>(itemEngine: AtomRefEngine<A>): itemEngine is CollectionItemEngine<A> =>
  itemEngine instanceof CollectionItemEngine

class CollectionItemEngine<A> extends AtomRefEngineImpl<A> {
  constructor(value: A, private readonly collection: CollectionImpl<A>) {
    super(value)
  }

  override notify(a: A) {
    super.notify(a)
    this.collection.itemChanged(this)
  }
}
