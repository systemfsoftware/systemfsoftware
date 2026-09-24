import type * as Fiber from 'effect/Fiber'
import * as Function from 'effect/Function'
import type * as Scheduler from 'effect/Scheduler'

/** @internal */
export interface StopState {
  readonly stopped: WeakSet<SteppableFiber>
  readonly failed: () => boolean
}

/** @internal */
export interface SteppableFiber {
  readonly id: number
  interruptUnsafe: (fiberId?: number) => void
}

/** @internal */
export type StopCheck = (fiber: SteppableFiber) => boolean

/** @internal */
export const makeStopState = (failed: () => boolean): StopState => ({ stopped: new WeakSet(), failed })

const alreadyStopped = (state: StopState, fiber: SteppableFiber): boolean => state.stopped.has(fiber)

/** @internal */
export const stopChecker: {
  (state: StopState): StopCheck
  (state: StopState, fiber: SteppableFiber): boolean
} = Function.dual(
  2,
  (state: StopState, fiber: SteppableFiber): boolean => alreadyStopped(state, fiber) === false && state.failed(),
)

const markStopped = (state: StopState, fiber: SteppableFiber): void => {
  state.stopped.add(fiber)
}

/** @internal */
export const stopAfterFailedCheck: {
  (state: StopState): (scheduler: Scheduler.Scheduler) => Scheduler.Scheduler
  (scheduler: Scheduler.Scheduler, state: StopState): Scheduler.Scheduler
} = Function.dual(2, (scheduler: Scheduler.Scheduler, state: StopState): Scheduler.Scheduler => ({
  executionMode: scheduler.executionMode,
  makeDispatcher: () => scheduler.makeDispatcher(),
  shouldYield: <A, E>(fiber: Fiber.Fiber<A, E>) => checkFiber(state, scheduler, fiber),
}))

const checkFiber = <A, E>(
  state: StopState,
  scheduler: Scheduler.Scheduler,
  fiber: Fiber.Fiber<A, E>,
): boolean => {
  const steppable: SteppableFiber = fiber
  if (stopChecker(state, steppable) === false) return scheduler.shouldYield(fiber)
  markStopped(state, steppable)
  steppable.interruptUnsafe(steppable.id)
  return true
}
