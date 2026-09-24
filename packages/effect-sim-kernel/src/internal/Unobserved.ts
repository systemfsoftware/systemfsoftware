/**
 * Unobserved shared-primitive detection (R35, AE12). The kernel observes `Ref`
 * and `Deferred` only, so a run that touches `Queue`, `PubSub`, `Semaphore`,
 * `Latch`, or a scope finalizer must be searched unpruned, with the primitive
 * named in the result. A queue's state lives in plain properties assigned onto
 * a prototype-backed object, so its fields are intercepted through accessors
 * on that prototype; the other three primitives are class instances whose
 * fields are defined directly on each instance and would shadow such
 * accessors, so their prototype methods are intercepted instead. Every
 * accessor and method notes through `currentKernel()` — the live kernel owns
 * the per-run collector, so nothing is recorded outside a run and no
 * module-level mutable state exists here. Installation is claimed once per
 * patched prototype by a symbol slot on that prototype, and the members the
 * interception depends on are checked against a freshly constructed instance
 * before it is sealed: an Effect that renames or reshapes them fails the run
 * loudly instead of silently leaving races unsearched.
 */
import { Context, Effect, Latch, Option, PubSub, Queue, Scope, Semaphore } from 'effect'

import type { UnobservedPrimitive } from '../Kernel/Bound.js'
import { currentKernel, FIBER_PROTOTYPE } from './runMark.js'

/** A value read from code this package does not own, narrowed by predicates. */
type Field<A = unknown> = A

type Slots = Record<symbol, Field>

const INSTALLED = Symbol('~effect-sim-kernel/unobservedInstalled')

const isHostObject = (candidate: Field): candidate is object => typeof candidate === 'object' && candidate !== null

const isFunction = (candidate: Field): candidate is (...args: ReadonlyArray<Field>) => Field =>
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

const noteAndCall = (
  original: (...args: ReadonlyArray<Field>) => Field,
  name: UnobservedPrimitive,
): (this: Field, ...args: ReadonlyArray<Field>) => Field =>
  function(this: Field, ...args: ReadonlyArray<Field>): Field {
    note(name)
    return Reflect.apply(original, this, args)
  }

const defineMethod = (proto: object, method: string, name: UnobservedPrimitive): void => {
  const original = fieldOf(proto, method)
  Object.defineProperty(proto, method, {
    configurable: true,
    value: isFunction(original) ? noteAndCall(original, name) : original,
  })
}

const interceptMethods = (proto: object, methods: ReadonlyArray<string>, name: UnobservedPrimitive): void => {
  for (const method of methods) defineMethod(proto, method, name)
}

const sealed = (proto: object): boolean => fieldOf(proto, INSTALLED) !== undefined

const sealAndReturn = (proto: object): object => {
  Reflect.set(proto, INSTALLED, true)
  return proto
}

const isUnsealed = (proto: object | undefined): proto is object => proto !== undefined && !sealed(proto)

const requireField = (instance: object, field: string, name: UnobservedPrimitive): void => {
  if (!Object.hasOwn(instance, field)) {
    throw new Error(
      `effect-sim-kernel: ${name} has no '${field}' state field on the pinned Effect version; unobserved detection would silently miss it`,
    )
  }
}

const requireFields = (instance: object, fields: ReadonlyArray<string>, name: UnobservedPrimitive): void => {
  for (const field of fields) requireField(instance, field, name)
}

const hasMethod = (proto: object | undefined, method: string): boolean =>
  proto !== undefined && Object.hasOwn(proto, method)

const requireMethod = (proto: object | undefined, method: string, name: UnobservedPrimitive): void => {
  if (!hasMethod(proto, method)) {
    throw new Error(
      `effect-sim-kernel: ${name} has no '${method}' method on the pinned Effect version; unobserved detection would silently miss it`,
    )
  }
}

const requireUnshadowed = (instance: object, method: string, name: UnobservedPrimitive): void => {
  if (Object.hasOwn(instance, method)) {
    throw new Error(
      `effect-sim-kernel: ${name} has an own '${method}' property shadowing the method on the pinned Effect version; unobserved detection would silently miss it`,
    )
  }
}

const requireMethods = (instance: object, methods: ReadonlyArray<string>, name: UnobservedPrimitive): void => {
  const proto = protoOf(instance)
  for (const method of methods) {
    requireMethod(proto, method, name)
    requireUnshadowed(instance, method, name)
  }
}

const installFields = (instance: object, fields: ReadonlyArray<string>, name: UnobservedPrimitive): void => {
  const proto = protoOf(instance)
  if (!isUnsealed(proto)) return
  requireFields(instance, fields, name)
  interceptFields(sealAndReturn(proto), fields, name)
}

const installMethods = (instance: object, methods: ReadonlyArray<string>, name: UnobservedPrimitive): void => {
  const proto = protoOf(instance)
  if (!isUnsealed(proto)) return
  requireMethods(instance, methods, name)
  interceptMethods(sealAndReturn(proto), methods, name)
}

const queueStateFields = ['dispatcher', 'capacity', 'strategy', 'messages', 'scheduleRunning', 'state']

const semaphoreMethods = ['take', 'takeIfAvailable', 'release', 'resize', 'withPermits', 'withPermitsIfAvailable']

const latchMethods = ['scheduleUnsafe', 'openUnsafe', 'closeUnsafe', 'isOpen']

const pubSubMethods = ['publish', 'publishAll', 'subscribe']

/**
 * A PubSub hands its work to a backing instance carried on its `pubsub`
 * property: the wrapper's own prototype only carries `pipe`, while every
 * publish and subscribe dispatches to the backing's methods.
 */
const pubSubBacking = (): object => {
  const backing = fieldOf(Effect.runSync(PubSub.unbounded<never>()), 'pubsub')
  return isHostObject(backing) ? backing : {}
}

const fiberContext = (fiber: Field): Field => fieldOf(fiber, 'context')

const scopedContext = (fiber: Field): Context.Context<Scope.Scope> | undefined => {
  const context = fiberContext(fiber)
  return isScopeContext(context) ? context : undefined
}

const heldScope = (fiber: Field): Scope.Scope | undefined => {
  const context = scopedContext(fiber)
  return context === undefined ? undefined : Option.getOrUndefined(Context.getOption(context, Scope.Scope))
}

const holdIn = (scope: Scope.Scope, holder: Field): void => {
  currentKernel()?.holdScope(scope, holder)
}

const noteHeldScope = (self: Field): void => {
  const scope = heldScope(self)
  if (scope !== undefined) holdIn(scope, self)
}

/**
 * A scope's finalizers live in plain object state the kernel cannot watch, but
 * only a scope two fibers hold can race: the kernel is told who holds each
 * scope and records the finalizer as unobserved once a second fiber does.
 */
const setAndNote = (
  original: (...args: ReadonlyArray<Field>) => void,
  self: Field,
  args: ReadonlyArray<Field>,
): void => {
  Reflect.apply(original, self, args)
  noteHeldScope(self)
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

const fiberProto = (): object | undefined => {
  if (!isUnsealed(FIBER_PROTOTYPE)) return undefined
  return sealAndReturn(FIBER_PROTOTYPE)
}

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
  installFields(Effect.runSync(Queue.unbounded<never>()), queueStateFields, 'Queue')
  installMethods(Semaphore.makeUnsafe(1), semaphoreMethods, 'Semaphore')
  installMethods(Latch.makeUnsafe(false), latchMethods, 'Latch')
  installMethods(pubSubBacking(), pubSubMethods, 'PubSub')
  wrapSetContext()
}
