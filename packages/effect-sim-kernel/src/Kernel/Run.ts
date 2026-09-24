import type { Effect } from 'effect'

import { beginExploration, runKernel, runOutcomeTags } from '../internal/stepLoop.js'
import type { RunOptions, RunResult } from '../internal/stepLoop.js'

export const run: {
  <A, E>(program: Effect.Effect<A, E>, options?: RunOptions): Promise<RunResult<A, E>>
  (options?: RunOptions): <A, E>(program: Effect.Effect<A, E>) => Promise<RunResult<A, E>>
} = runKernel

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
