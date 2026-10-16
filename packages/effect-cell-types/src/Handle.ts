import { type Pipeable, Prototype } from 'effect/Pipeable'
import * as Predicate from 'effect/Predicate'

const SlotId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/Handle/slot')
type SlotId = typeof SlotId

const IndexId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/Handle/index')
type IndexId = typeof IndexId

type Top<A = unknown> = A

type Branded<T extends symbol> = { readonly [K in T]: T }

export interface Indexed {
  readonly Index: Top
  readonly slot: Top
}

type IsIndexed<Slot> = [Slot] extends [never] ? false : [Slot] extends [Indexed] ? true : false

type SlotOf<S> = S extends { readonly slot: infer A } ? A : never

type SlotAt<Slot, X> = IsIndexed<Slot> extends true ? SlotOf<Slot & { readonly Index: X }> : Slot

type Slotted<Slot, X> = [Slot] extends [never] ? object : { readonly [SlotId]: SlotAt<Slot, X> }

type Indexing<Slot, X> = IsIndexed<Slot> extends true ? { readonly [IndexId]?: X } : object

export type Handle<T extends symbol, Data extends object, Slot = never, X = never> =
  & Pipeable
  & Branded<T>
  & { readonly [K in keyof Data]: Data[K] }
  & Slotted<Slot, X>
  & Indexing<Slot, X>

type SlotArguments<Slot, X> = [Slot] extends [never] ? [] : [slot: SlotAt<Slot, X>]

export interface Definition<T extends symbol, Data extends object, Slot, X = never> {
  readonly TypeId: T
  readonly is: (u: unknown) => u is Handle<T, Data, Slot, X>
  readonly make: <I extends X = X>(data: Data, ...slot: SlotArguments<Slot, I>) => Handle<T, Data, Slot, I>
  readonly slot: <I extends X>(self: Handle<T, Data, Slot, I>) => SlotAt<Slot, I>
}

function assertHandle<T extends symbol, Data extends object, Slot, X>(
  _self: object,
): asserts _self is Handle<T, Data, Slot, X> {}

function assertSlotted<Slot>(_self: object): asserts _self is { readonly [SlotId]: Slot } {}

/**
 * Declares a handle kind: a minimal protocol record of `Data`, branded with its TypeId, optionally
 * carrying a private slot. A slot declared as {@link Indexed} is typed by the index `X` the handle
 * is minted at.
 */
export const make =
  <Data extends object, Slot = never, X = never>() => <T extends symbol>(typeId: T): Definition<T, Data, Slot, X> => ({
    TypeId: typeId,
    is: (u: unknown): u is Handle<T, Data, Slot, X> => Predicate.hasProperty(u, typeId),
    make: <I extends X = X>(data: Data, ...slot: SlotArguments<Slot, I>): Handle<T, Data, Slot, I> => {
      const self = { ...data, ...Prototype, [typeId]: typeId, ...(slot.length === 0 ? {} : { [SlotId]: slot[0] }) }
      assertHandle<T, Data, Slot, I>(self)
      return self
    },
    slot: <I extends X>(self: Handle<T, Data, Slot, I>): SlotAt<Slot, I> => {
      assertSlotted<SlotAt<Slot, I>>(self)
      return self[SlotId]
    },
  })

export type Of<D> = D extends Definition<infer T, infer Data, infer Slot, infer X> ? Handle<T, Data, Slot, X> : never
