/**
 * The one-live-run mark. A module-private slot on the patched fiber prototype
 * names the kernel whose run is live: acquisition claims it, release clears it,
 * and the concurrency guard reads it. The symbol never leaves this module, so
 * the slot is unnameable from consumer code. No module-level mutable state
 * lives here — the slot travels on the fiber prototype itself.
 */
import { Effect } from 'effect'

import type { Kernel } from './kernel.js'

/** A value read from code this package does not own, narrowed by predicates. */
type Field<A = unknown> = A

const ACTIVE_RUN = Symbol('~effect-sim-kernel/activeRun')

const isHostObject = (candidate: Field): candidate is object => typeof candidate === 'object'

const isKernel = (candidate: object): candidate is Kernel => 'pending' in candidate && 'release' in candidate

const fieldOf = (target: object, key: string | symbol): Field => Reflect.get(target, key)

const protoOf = (value: object): object => {
  const proto: Field = Object.getPrototypeOf(value)
  return isHostObject(proto) ? proto : Object.prototype
}

/** @internal */
export const FIBER_PROTOTYPE: object = protoOf(Effect.runFork(Effect.void))

const heldRun = (): Field => fieldOf(FIBER_PROTOTYPE, ACTIVE_RUN)

const isLiveKernel = (candidate: Field): candidate is Kernel => isHostObject(candidate) && isKernel(candidate)

/** @internal */
export const currentKernel = (): Kernel | undefined => {
  const candidate: Field = heldRun()
  return isLiveKernel(candidate) ? candidate : undefined
}

/** @internal */
export const isRunLive = (): boolean => isHostObject(heldRun())

/** @internal */
export const claimRun = (kernel: Kernel): void => {
  Reflect.set(FIBER_PROTOTYPE, ACTIVE_RUN, kernel)
}

/** @internal */
export const releaseRun = (): void => {
  Reflect.set(FIBER_PROTOTYPE, ACTIVE_RUN, undefined)
}
