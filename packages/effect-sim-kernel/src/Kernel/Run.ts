import type { Effect } from 'effect'

import { currentKernel } from '../internal/runMark.js'
import { beginExploration, runKernel, runOutcomeTags } from '../internal/stepLoop.js'
import type { RunOptions, RunResult } from '../internal/stepLoop.js'

export const run: {
  <A, E>(program: Effect.Effect<A, E>, options?: RunOptions): Promise<RunResult<A, E>>
  (options?: RunOptions): <A, E>(program: Effect.Effect<A, E>) => Promise<RunResult<A, E>>
} = runKernel

/**
 * Whether the live run is inside a synchronous step. A library that samples a
 * run from outside can tell work the run caused from work an outside fiber did
 * between steps. `false` when no run is live.
 */
export const isStepping = (): boolean => currentKernel()?.phase === 'step'

export { beginExploration, runOutcomeTags as outcomeTags }
export type { AnyFiber, SuspendedFiber, WaitKind } from '../internal/deadlock.js'
export type { Escape, TimerName } from '../internal/escapeRecorder.js'
export type { Choice, ChoiceOption, Decision, FiberTarget, StepRecord } from '../internal/kernel.js'
export type {
  BlockedFailure,
  DeadlockFailure,
  EscapeFailure,
  Interruption,
  RunawayFailure,
  RunCompleted,
  RunFailed,
  RunFailure,
  RunHistory,
  RunOptions,
  RunResult,
} from '../internal/stepLoop.js'
