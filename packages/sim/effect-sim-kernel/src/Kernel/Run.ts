export { beginExploration, isStepping } from '../internal/kernel.js'
export { run } from '../internal/stepLoop.js'
export { runOutcomeTags as outcomeTags } from '../internal/stepLoop.js'

export type { AnyFiber, SuspendedFiber, WaitKind } from '../internal/deadlock.js'
export type { Escape, TimerName } from '../internal/escapeRecorder.js'
export type {
  BoundaryKind,
  BoundaryRecord,
  Choice,
  ChoiceOption,
  Decision,
  FiberTarget,
  StepRecord,
  TraceDivergence,
  TraceSnapshot,
} from '../internal/kernel.js'
export type {
  BlockedFailure,
  DeadlockFailure,
  EscapeFailure,
  Interruption,
  ReplayTraceDivergedFailure,
  RunawayFailure,
  RunCompleted,
  RunFailed,
  RunFailure,
  RunHistory,
  RunOptions,
  RunResult,
} from '../internal/stepLoop.js'
