import { type Pipeable, Prototype } from 'effect/Pipeable'
import * as Predicate from 'effect/Predicate'

const SlotId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/Handle/slot')
type SlotId = typeof SlotId

type Branded<T extends symbol> = { readonly [K in T]: T }

type Slotted<Slot> = [Slot] extends [never] ? object : { readonly [SlotId]: Slot }

export type Handle<T extends symbol, Data extends object, Slot = never> =
  & Pipeable
  & Branded<T>
  & { readonly [K in keyof Data]: Data[K] }
  & Slotted<Slot>

type SlotArguments<Slot> = [Slot] extends [never] ? [] : [slot: Slot]

export interface Definition<T extends symbol, Data extends object, Slot> {
  readonly TypeId: T
  readonly is: (u: unknown) => u is Handle<T, Data, Slot>
  readonly make: (data: Data, ...slot: SlotArguments<Slot>) => Handle<T, Data, Slot>
  readonly slot: (self: Handle<T, Data, Slot>) => Slot
}

function assertHandle<T extends symbol, Data extends object, Slot>(
  _self: object,
): asserts _self is Handle<T, Data, Slot> {}

function assertSlotted<Slot>(_self: object): asserts _self is { readonly [SlotId]: Slot } {}

export const make =
  <Data extends object, Slot = never>() => <T extends symbol>(typeId: T): Definition<T, Data, Slot> => ({
    TypeId: typeId,
    is: (u: unknown): u is Handle<T, Data, Slot> => Predicate.hasProperty(u, typeId),
    make: (data: Data, ...slot: SlotArguments<Slot>): Handle<T, Data, Slot> => {
      const self = { ...data, ...Prototype, [typeId]: typeId, [SlotId]: slot[0] }
      assertHandle<T, Data, Slot>(self)
      return self
    },
    slot: (self: Handle<T, Data, Slot>): Slot => {
      assertSlotted<Slot>(self)
      return self[SlotId]
    },
  })

export type Of<D> = D extends Definition<infer T, infer Data, infer Slot> ? Handle<T, Data, Slot> : never
