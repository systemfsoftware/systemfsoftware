/**
 * The run surface: `run` executes one Effect program under one kernel run —
 * on the kernel's virtual root clock, driven by the decision path or chooser
 * in the options, reporting the exit, the decisions taken, and a per-step
 * record of which fiber ran. Dual: `run(program, options)` and
 * `program.pipe(run(options))` are the same run.
 */
import type { Effect } from 'effect'
import { dual } from 'effect/Function'

import { beginExploration, runKernel, runOutcomeTags } from '../internal/stepLoop.js'
import type { RunOptions, RunResult } from '../internal/stepLoop.js'

/** A value read from code this package does not own, narrowed by predicates. */
type Field<A = unknown> = A

const RUN_OPTION_KEYS: ReadonlyArray<string> = [
  'choose',
  'explore',
  'interrupt',
  'maxSteps',
  'onQuiescent',
  'path',
  'quiescenceTurns',
  'stepTurns',
]

const isHostObject = (candidate: Field): candidate is object => typeof candidate === 'object'

const hasOptionKeys = (candidate: object): boolean =>
  Object.keys(candidate).every((key) => RUN_OPTION_KEYS.includes(key))

const isRunOptions = (candidate: Field): candidate is RunOptions => isHostObject(candidate) && hasOptionKeys(candidate)

const isProgram = (candidate: Field): boolean => !isRunOptions(candidate)

/**
 * Runs one Effect program under one kernel (R2: every clock the program can
 * reach is the kernel's virtual clock). A second run started while one is
 * active fails immediately instead of sharing the global hooks.
 */
export const run: {
  <A, E>(program: Effect.Effect<A, E>, options?: RunOptions): Promise<RunResult<A, E>>
  (options?: RunOptions): <A, E>(program: Effect.Effect<A, E>) => Promise<RunResult<A, E>>
} = dual(
  (args: IArguments): boolean => args.length > 0 && isProgram(args[0]),
  runKernel,
)

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
