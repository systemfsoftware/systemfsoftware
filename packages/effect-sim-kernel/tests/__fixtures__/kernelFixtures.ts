import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Exit } from 'effect'

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
export type RaceRun = Kernel.RunResult<ReadonlyArray<string>, never>

const isCompletedRun = <A, E>(result: Kernel.RunResult<A, E>): result is Kernel.RunCompleted<A, E> => 'exit' in result

const isFailedRun = <A, E>(
  result: Kernel.RunResult<A, E>,
): result is Kernel.RunFailed & Kernel.RunResult<A, E> => 'failure' in result

export const completedRunOf = <A, E>(result: Kernel.RunResult<A, E>): Kernel.RunCompleted<A, E> => {
  if (!isCompletedRun(result)) throw new Error('expected a completed run, got a failure')
  return result
}

export const failedRunOf = <A, E>(result: Kernel.RunResult<A, E>): Kernel.RunFailed => {
  if (!isFailedRun(result)) throw new Error('expected a failed run, got a completed exit')
  return result
}

export const completedValueOf = <A, E>(result: Kernel.RunResult<A, E>): A => {
  const exit = completedRunOf(result).exit
  if (!Exit.isSuccess(exit)) throw new Error('expected a successful exit, got an interrupted one')
  return exit.value
}

export const failureOf = <A, E>(result: Kernel.RunResult<A, E>): Kernel.RunFailure => failedRunOf(result).failure

const isEscapeFailure = (failure: Kernel.RunFailure): failure is Kernel.EscapeFailure => 'site' in failure
const isDeadlockFailure = (failure: Kernel.RunFailure): failure is Kernel.DeadlockFailure => 'suspended' in failure
const isBlockedFailure = (failure: Kernel.RunFailure): failure is Kernel.BlockedFailure => 'on' in failure
const isRunawayFailure = (failure: Kernel.RunFailure): failure is Kernel.RunawayFailure => 'steps' in failure

const escapeOrThrow = (failure: Kernel.RunFailure): Kernel.EscapeFailure => {
  if (!isEscapeFailure(failure)) throw new Error('expected a timer escape, got another failure')
  return failure
}

const deadlockOrThrow = (failure: Kernel.RunFailure): Kernel.DeadlockFailure => {
  if (!isDeadlockFailure(failure)) throw new Error('expected a deadlock, got another failure')
  return failure
}

const blockedOrThrow = (failure: Kernel.RunFailure): Kernel.BlockedFailure => {
  if (!isBlockedFailure(failure)) throw new Error('expected a blocked run, got another failure')
  return failure
}

const runawayOrThrow = (failure: Kernel.RunFailure): Kernel.RunawayFailure => {
  if (!isRunawayFailure(failure)) throw new Error('expected a runaway run, got another failure')
  return failure
}

export const escapeOf = <A, E>(result: Kernel.RunResult<A, E>): Kernel.EscapeFailure => escapeOrThrow(failureOf(result))

export const deadlockOf = <A, E>(result: Kernel.RunResult<A, E>): Kernel.DeadlockFailure =>
  deadlockOrThrow(failureOf(result))

export const blockedFailureOf = <A, E>(result: Kernel.RunResult<A, E>): Kernel.BlockedFailure =>
  blockedOrThrow(failureOf(result))

export const runawayFailureOf = <A, E>(result: Kernel.RunResult<A, E>): Kernel.RunawayFailure =>
  runawayOrThrow(failureOf(result))

const competingOption = (choice: Kernel.Choice): Kernel.ChoiceOption | undefined =>
  choice.options.length > 1 ? choice.options.find((option) => option.isDefault === false) : undefined

const deviationOf = (
  choice: Kernel.Choice,
  take: (choice: Kernel.Choice) => Kernel.ChoiceOption | undefined,
): Kernel.ChoiceOption | undefined => {
  if (take(choice) === undefined) return undefined
  return take(choice)
}

const nextDeviation = (
  choice: Kernel.Choice,
  take: (choice: Kernel.Choice) => Kernel.ChoiceOption | undefined,
  mark: () => void,
): Kernel.Decision | undefined => {
  const alternative = deviationOf(choice, take)
  if (alternative === undefined) return undefined
  mark()
  return choice.options.indexOf(alternative)
}

export const deviateOnceAt = (
  take: (choice: Kernel.Choice) => Kernel.ChoiceOption | undefined,
): () => (choice: Kernel.Choice) => Kernel.Decision | undefined =>
() => {
  let deviated = false
  return (choice: Kernel.Choice): Kernel.Decision | undefined => {
    if (deviated) return undefined
    return nextDeviation(choice, take, () => {
      deviated = true
    })
  }
}

/** A chooser that deviates at the first step where another fiber's task competes with the default. */
export const deviateAtFirstChoice = deviateOnceAt(competingOption)

/** Takes the last pending task at every explored step. */
export const alwaysLast = (choice: Kernel.Choice): Kernel.Decision => choice.options.length - 1

const ordinalOf = (known: Map<number, number>, id: number): number => {
  const mapped = known.get(id)
  if (mapped !== undefined) return mapped
  const next = known.size + 1
  known.set(id, next)
  return next
}

/** Which fiber ran at each step, as first-seen ordinals — stable across runs. */
export const fiberPatternOf = (steps: ReadonlyArray<Kernel.StepRecord>): ReadonlyArray<number | undefined> => {
  const known = new Map<number, number>()
  return steps.map((step) => (step.fiberId === undefined ? undefined : ordinalOf(known, step.fiberId)))
}

/** Step records without Effect's process-global fiber numbering. */
export const stepsWithoutFiberIds = (
  steps: ReadonlyArray<Kernel.StepRecord>,
): ReadonlyArray<Omit<Kernel.StepRecord, 'fiberId'>> => steps.map(({ fiberId: _fiberId, ...rest }) => rest)
