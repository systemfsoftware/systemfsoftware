/**
 * Unobserved shared-primitive detection (R35, AE12). The kernel observes `Ref`
 * and `Deferred` only, so a run that touches `Queue`, `PubSub`, `Semaphore`,
 * `Latch`, or a scope finalizer must be searched unpruned, with the primitive
 * named in the result. Every accessor notes through `currentKernel()` — the
 * live kernel owns the per-run collector, so nothing is recorded outside a run
 * and no module-level mutable state exists here. Installation is claimed once
 * per patched prototype by a symbol slot on that prototype.
 */
import { Context, Effect, Latch, Option, PubSub, Queue, Scope, Semaphore } from 'effect'

import type { UnobservedPrimitive } from '../Kernel/Bound.js'
import { currentKernel, FIBER_PROTOTYPE } from './runMark.js'

/** A value read from code this package does not own, narrowed by predicates. */
type Field<A = unknown> = A

type Slots = Record<symbol, Field>

const INSTALLED = Symbol('~effect-sim-kernel/unobservedInstalled')

const isHostObject = (candidate: Field): candidate is object => typeof candidate === 'object' && candidate !== null

const isFunction = (candidate: Field): candidate is (...args: ReadonlyArray<Field>) => void =>
  typeof candidate === 'function'

const isScopeContext = (candidate: Field): candidate is Context.Context<Scope.Scope> => isHostObject(candidate)

const fieldOf = (target: Field, key: string | symbol): Field => {
  const host = isHostObject(target) ? target : {}
  return Reflect.get(host, key)
}

const objectOf = (candidate: Field): object | undefined => (isHostObject(candidate) ? candidate : undefined)

const protoOf = (value: object): object | undefined => objectOf(Object.getPrototypeOf(value))

const note = (name: UnobservedPrimitive): void => {
  currentKernel()?.unobserved(name)
}

const slotFor = (field: string): symbol => Symbol(field)

const readSlot = (slots: Slots, slot: symbol, name: UnobservedPrimitive): Field => {
  note(name)
  return slots[slot]
}

const defineField = (proto: object, field: string, name: UnobservedPrimitive): void => {
  const slot = slotFor(field)
  Object.defineProperty(proto, field, {
    configurable: true,
    get(this: Slots): Field {
      return readSlot(this, slot, name)
    },
    set(this: Slots, value: Field): void {
      note(name)
      this[slot] = value
    },
  })
}

const interceptFields = (proto: object, fields: ReadonlyArray<string>, name: UnobservedPrimitive): void => {
  for (const field of fields) defineField(proto, field, name)
}

const sealed = (proto: object): boolean => fieldOf(proto, INSTALLED) !== undefined

const sealAndReturn = (proto: object): object => {
  Reflect.set(proto, INSTALLED, true)
  return proto
}

const unclaimed = (proto: object): object | undefined => (sealed(proto) ? undefined : sealAndReturn(proto))

const claimed = (proto: object | undefined): object | undefined => {
  if (proto === undefined) return undefined
  return unclaimed(proto)
}

const interceptClaimed = (
  proto: object | undefined,
  fields: ReadonlyArray<string>,
  name: UnobservedPrimitive,
): void => {
  const target = claimed(proto)
  if (target === undefined) return
  interceptFields(target, fields, name)
}

const queueStateFields = ['dispatcher', 'capacity', 'strategy', 'messages', 'scheduleRunning', 'state']

const semaphoreStateFields = ['waiters', 'taken', 'permits']

const latchStateFields = ['waiters', 'scheduled', '_isOpen']

const pubSubStateFields = ['pubsub', 'subscribers', 'scope', 'shutdownHook', 'shutdownFlag', 'strategy']

const fiberContext = (fiber: Field): Field => fieldOf(fiber, 'context')

const scopedContext = (fiber: Field): Context.Context<Scope.Scope> | undefined => {
  const context = fiberContext(fiber)
  return isScopeContext(context) ? context : undefined
}

const holdsScope = (context: Context.Context<Scope.Scope>): boolean =>
  Option.isSome(Context.getOption(context, Scope.Scope))

const enteredScope = (fiber: Field): boolean => {
  const context = scopedContext(fiber)
  return context === undefined ? false : holdsScope(context)
}

const setAndNote = (
  original: (...args: ReadonlyArray<Field>) => void,
  self: Field,
  args: ReadonlyArray<Field>,
): void => {
  Reflect.apply(original, self, args)
  if (enteredScope(self)) note('Scope finalizer')
}

const originalSetContext = (proto: object): ((...args: ReadonlyArray<Field>) => void) | undefined => {
  const candidate = fieldOf(proto, 'setContext')
  return isFunction(candidate) ? candidate : undefined
}

const installSetContext = (proto: object, original: (...args: ReadonlyArray<Field>) => void): void => {
  Object.defineProperty(proto, 'setContext', {
    configurable: true,
    value: function(this: Field, ...args: ReadonlyArray<Field>): void {
      setAndNote(original, this, args)
    },
  })
}

const fiberProto = (): object | undefined => claimed(FIBER_PROTOTYPE)

const withOriginalSetContext = (proto: object): void => {
  const original = originalSetContext(proto)
  if (original === undefined) return
  installSetContext(proto, original)
}

const wrapSetContext = (): void => {
  const proto = fiberProto()
  if (proto === undefined) return
  withOriginalSetContext(proto)
}

/** @internal */
export const installUnobserved = (): void => {
  interceptClaimed(protoOf(Effect.runSync(Queue.unbounded<never>())), queueStateFields, 'Queue')
  interceptClaimed(protoOf(Semaphore.makeUnsafe(1)), semaphoreStateFields, 'Semaphore')
  interceptClaimed(protoOf(Latch.makeUnsafe(false)), latchStateFields, 'Latch')
  interceptClaimed(protoOf(Effect.runSync(PubSub.unbounded<never>())), pubSubStateFields, 'PubSub')
  wrapSetContext()
}
