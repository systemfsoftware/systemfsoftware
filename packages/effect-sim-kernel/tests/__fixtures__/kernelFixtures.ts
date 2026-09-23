import { runKernel } from '@systemfsoftware/effect-sim-kernel'
import type {
  BlockedFailure,
  Choice,
  ChoiceOption,
  DeadlockFailure,
  Decision,
  EscapeFailure,
  RunawayFailure,
  RunCompleted,
  RunFailed,
  RunFailure,
  RunResult,
  StepRecord,
} from '@systemfsoftware/effect-sim-kernel'
import { Effect, Exit } from 'effect'

/** A value read from code this file does not own, narrowed by predicates. */
type Field<A = unknown> = A

type HostTimeout = (handler: () => void, timeout: number) => Field
type MicrotaskSchedule = (callback: () => void) => Field

const isHostTimeout = (candidate: unknown): candidate is HostTimeout => typeof candidate === 'function'
const isMicrotaskSchedule = (candidate: unknown): candidate is MicrotaskSchedule => typeof candidate === 'function'

/**
 * Reaches the host timer the way a port module does — through the global object
 * at call time — so the kernel must catch it wherever the call is made from.
 */
export const callHostTimeout = (handler: () => void): void => {
  const candidate: Field = Reflect.get(globalThis, 'setTimeout')
  if (isHostTimeout(candidate)) candidate(handler, 0)
}

/** Schedules in-process work on the microtask queue, which is never an escape. */
export const callOnNextMicrotask = (callback: () => void): void => {
  const candidate: Field = Reflect.get(globalThis, 'queueMicrotask')
  if (isMicrotaskSchedule(candidate)) candidate(callback)
}

/** A finished run of the racing program: what each fiber wrote, in order. */
export type RaceRun = RunResult<ReadonlyArray<string>, never>

export interface RaceReplays {
  readonly second: RaceRun
  readonly third: RaceRun
}

const isCompletedRun = <A, E>(result: RunResult<A, E>): result is RunCompleted<A, E> => 'exit' in result

const isFailedRun = <A, E>(result: RunResult<A, E>): result is RunFailed & RunResult<A, E> => 'failure' in result

export const completedRunOf = <A, E>(result: RunResult<A, E>): RunCompleted<A, E> => {
  if (!isCompletedRun(result)) throw new Error('expected a completed run, got a failure')
  return result
}

export const failedRunOf = <A, E>(result: RunResult<A, E>): RunFailed => {
  if (!isFailedRun(result)) throw new Error('expected a failed run, got a completed exit')
  return result
}

export const completedValueOf = <A, E>(result: RunResult<A, E>): A => {
  const exit = completedRunOf(result).exit
  if (!Exit.isSuccess(exit)) throw new Error('expected a successful exit, got an interrupted one')
  return exit.value
}

export const failureOf = <A, E>(result: RunResult<A, E>): RunFailure => failedRunOf(result).failure

const isEscapeFailure = (failure: RunFailure): failure is EscapeFailure => 'site' in failure
const isDeadlockFailure = (failure: RunFailure): failure is DeadlockFailure => 'suspended' in failure
const isBlockedFailure = (failure: RunFailure): failure is BlockedFailure => 'on' in failure
const isRunawayFailure = (failure: RunFailure): failure is RunawayFailure => 'steps' in failure

const escapeOrThrow = (failure: RunFailure): EscapeFailure => {
  if (!isEscapeFailure(failure)) throw new Error('expected a timer escape, got another failure')
  return failure
}

const deadlockOrThrow = (failure: RunFailure): DeadlockFailure => {
  if (!isDeadlockFailure(failure)) throw new Error('expected a deadlock, got another failure')
  return failure
}

const blockedOrThrow = (failure: RunFailure): BlockedFailure => {
  if (!isBlockedFailure(failure)) throw new Error('expected a blocked run, got another failure')
  return failure
}

const runawayOrThrow = (failure: RunFailure): RunawayFailure => {
  if (!isRunawayFailure(failure)) throw new Error('expected a runaway run, got another failure')
  return failure
}

export const escapeOf = <A, E>(result: RunResult<A, E>): EscapeFailure => escapeOrThrow(failureOf(result))

export const deadlockOf = <A, E>(result: RunResult<A, E>): DeadlockFailure => deadlockOrThrow(failureOf(result))

export const blockedFailureOf = <A, E>(result: RunResult<A, E>): BlockedFailure => blockedOrThrow(failureOf(result))

export const runawayFailureOf = <A, E>(result: RunResult<A, E>): RunawayFailure => runawayOrThrow(failureOf(result))

const competingOption = (choice: Choice): ChoiceOption | undefined =>
  choice.options.length > 1 ? choice.options.find((option) => option.isDefault === false) : undefined

const deviationOf = (
  choice: Choice,
  take: (choice: Choice) => ChoiceOption | undefined,
): ChoiceOption | undefined => {
  if (take(choice) === undefined) return undefined
  return take(choice)
}

const nextDeviation = (
  choice: Choice,
  take: (choice: Choice) => ChoiceOption | undefined,
  mark: () => void,
): Decision | undefined => {
  const alternative = deviationOf(choice, take)
  if (alternative === undefined) return undefined
  mark()
  return choice.options.indexOf(alternative)
}

export const deviateOnceAt = (
  take: (choice: Choice) => ChoiceOption | undefined,
): (choice: Choice) => Decision | undefined => {
  let deviated = false
  return (choice: Choice): Decision | undefined => {
    if (deviated) return undefined
    return nextDeviation(choice, take, () => {
      deviated = true
    })
  }
}

/** Deviates at the first step where another fiber's task competes with the default. */
export const deviateAtFirstChoice = deviateOnceAt(competingOption)

/** Takes the last pending task at every explored step. */
export const alwaysLast = (choice: Choice): Decision => choice.options.length - 1

/** Runs the program twice more on a recorded path, one run after the other. */
export const replayRaceTwice = (
  program: Effect.Effect<ReadonlyArray<string>>,
  path: ReadonlyArray<Decision>,
): Promise<RaceReplays> => {
  const second = runKernel(program, { path })
  return second.then((secondRun) => runKernel(program, { path }).then((third) => ({ second: secondRun, third })))
}

const ordinalOf = (known: Map<number, number>, id: number): number => {
  const mapped = known.get(id)
  if (mapped !== undefined) return mapped
  const next = known.size + 1
  known.set(id, next)
  return next
}

/** Which fiber ran at each step, as first-seen ordinals — stable across runs. */
export const fiberPatternOf = (steps: ReadonlyArray<StepRecord>): ReadonlyArray<number | undefined> => {
  const known = new Map<number, number>()
  return steps.map((step) => (step.fiberId === undefined ? undefined : ordinalOf(known, step.fiberId)))
}

/** Step records without Effect's process-global fiber numbering. */
export const stepsWithoutFiberIds = (steps: ReadonlyArray<StepRecord>): ReadonlyArray<Omit<StepRecord, 'fiberId'>> =>
  steps.map(({ fiberId: _fiberId, ...rest }) => rest)

/** Attempts to start a run while another is live, and reports the thrown error. */
export const attemptConcurrentRun = (program: Effect.Effect<void>): Error | undefined => {
  try {
    void runKernel(program).catch(() => undefined)
    return undefined
  } catch (error) {
    return error instanceof Error ? error : new Error('a non-error was thrown', { cause: error })
  }
}
