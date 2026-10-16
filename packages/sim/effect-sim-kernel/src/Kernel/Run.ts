export { beginExploration, isStepping } from '../internal/kernel.js'
export { run } from '../internal/stepLoop.js'
export { runOutcomeTags as outcomeTags } from '../internal/stepLoop.js'

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
