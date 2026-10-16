import { Effect } from 'effect'
import { dual } from 'effect/Function'

import { run } from './Run.js'
import type { Decision, RunOptions, RunResult, StepRecord } from './Run.js'

const failKept = <A, E>(result: RunResult<A, E>): boolean => 'failure' in result

export interface ShrinkOptions<A, E> {
  readonly path: ReadonlyArray<Decision>
  readonly isFailure?: (result: RunResult<A, E>) => boolean
  readonly maxSteps?: number
}

export interface ShrinkOutcome<A, E> {
  readonly path: ReadonlyArray<Decision>
  readonly deviations: number
  readonly result: RunResult<A, E>
}

/**
 * One shrink round: the schedule as deviation entries, where a `undefined`
 * entry resets that step to Effect's order — so resetting a deviation deletes
 * its entry, and a kept reset strictly shrinks the entry count.
 */
interface Round<A, E> {
  readonly program: Effect.Effect<A, E>
  readonly path: ReadonlyArray<Decision | undefined>
  readonly isFailure: (result: RunResult<A, E>) => boolean
  readonly maxSteps: number | undefined
}

const withoutSteps = <A, E>(state: Round<A, E>): RunOptions => {
  const maxSteps = state.maxSteps
  if (maxSteps === undefined) return {}
  return { maxSteps }
}

const withSteps = <A, E>(state: Round<A, E>): RunOptions => {
  const maxSteps = state.maxSteps
  if (maxSteps === undefined) return { path: state.path }
  return { path: state.path, maxSteps }
}

const optionsOf = <A, E>(state: Round<A, E>): RunOptions => {
  if (state.path.length === 0) return withoutSteps<A, E>(state)
  return withSteps<A, E>(state)
}

const runRound = <A, E>(state: Round<A, E>): Promise<RunResult<A, E>> =>
  run<A, E>(state.program, optionsOf<A, E>(state))

const indices = (count: number): ReadonlyArray<number> => Array.from({ length: count }, (_value, index) => index)

const entryAt = (path: ReadonlyArray<Decision | undefined>, index: number): Decision | undefined => path[index]

const clonedEntries = (path: ReadonlyArray<Decision | undefined>): Array<Decision | undefined> => {
  const clone: Array<Decision | undefined> = []
  for (const index of indices(path.length)) clone[index] = entryAt(path, index)
  return clone
}

const withoutAt = (
  path: ReadonlyArray<Decision | undefined>,
  position: number,
): ReadonlyArray<Decision | undefined> => {
  const candidate = clonedEntries(path)
  candidate[position] = undefined
  return candidate
}

const withoutFrom = (
  path: ReadonlyArray<Decision | undefined>,
  position: number,
): ReadonlyArray<Decision | undefined> => clonedEntries(path).slice(0, position)

const deviationAt = (step: StepRecord): boolean => step.deviation

const nextOffset = <A, E>(result: RunResult<A, E>, from: number): number =>
  result.steps.slice(from).findIndex(deviationAt)

const nextPosition = <A, E>(result: RunResult<A, E>, from: number): number | undefined => {
  const offset = nextOffset(result, from)
  return offset < 0 ? undefined : from + offset
}

const notedEntry = (entries: Array<Decision | undefined>, step: StepRecord): void => {
  if (deviationAt(step)) entries[step.step - 1] = step.choice
}

const deviationEntriesOf = <A, E>(result: RunResult<A, E>): ReadonlyArray<Decision | undefined> => {
  const entries: Array<Decision | undefined> = []
  for (const step of result.steps) notedEntry(entries, step)
  return entries
}

interface Attempt {
  readonly kept: ReadonlyArray<Decision | undefined> | undefined
}

const PASS_LIMIT = 256

interface PassState<A, E> {
  readonly state: Round<A, E>
  readonly path: ReadonlyArray<Decision | undefined>
  readonly result: RunResult<A, E>
  readonly from: number
  readonly passes: number
}

const attemptPath = <A, E>(
  progress: PassState<A, E>,
  candidate: ReadonlyArray<Decision | undefined>,
): Promise<Attempt> =>
  runRound<A, E>({ ...progress.state, path: candidate }).then(
    (reset) => (progress.state.isFailure(reset) ? { kept: candidate } : { kept: undefined }),
  )

/**
 * Deviations can hold each other up: a later detour that only matters because
 * of an earlier one survives every single reset, yet the schedule fails
 * without either. Resetting a deviation together with every later one first
 * clears such a chain in one attempt; the single reset follows only when
 * later deviations exist, since otherwise both candidates are the same.
 */
const singleAfterMissedSuffix = <A, E>(
  progress: PassState<A, E>,
  position: number,
  suffix: Attempt,
): Promise<Attempt> => {
  if (nextPosition(progress.result, position + 1) === undefined) return Promise.resolve(suffix)
  return attemptPath<A, E>(progress, withoutAt(progress.path, position))
}

const attemptSingleAfterSuffix = <A, E>(
  progress: PassState<A, E>,
  position: number,
  suffix: Attempt,
): Promise<Attempt> =>
  suffix.kept === undefined ? singleAfterMissedSuffix<A, E>(progress, position, suffix) : Promise.resolve(suffix)

const attemptReset = <A, E>(progress: PassState<A, E>, position: number): Promise<Attempt> =>
  attemptPath<A, E>(progress, withoutFrom(progress.path, position)).then((suffix) =>
    attemptSingleAfterSuffix<A, E>(progress, position, suffix)
  )

const settled = <A, E>(progress: PassState<A, E>): Promise<ReadonlyArray<Decision | undefined>> =>
  Promise.resolve(progress.path)

const adoptedPass = <A, E>(
  progress: PassState<A, E>,
  kept: ReadonlyArray<Decision | undefined>,
): Promise<ReadonlyArray<Decision | undefined>> =>
  runRound<A, E>({ ...progress.state, path: kept }).then((replay) =>
    pass<A, E>({ state: progress.state, path: kept, result: replay, from: 0, passes: progress.passes + 1 })
  )

const advance = <A, E>(progress: PassState<A, E>, attempt: Attempt): Promise<ReadonlyArray<Decision | undefined>> => {
  if (attempt.kept !== undefined) return adoptedPass<A, E>(progress, attempt.kept)
  return pass<A, E>({ ...progress, from: progress.from + 1 })
}

const resetStep = <A, E>(progress: PassState<A, E>, position: number): Promise<ReadonlyArray<Decision | undefined>> =>
  attemptReset<A, E>(progress, position).then((attempt) => advance<A, E>(progress, attempt))

const resumePass = <A, E>(progress: PassState<A, E>): Promise<ReadonlyArray<Decision | undefined>> => {
  const position = nextPosition(progress.result, progress.from)
  return position === undefined ? settled<A, E>(progress) : resetStep<A, E>(progress, position)
}

const pass = <A, E>(progress: PassState<A, E>): Promise<ReadonlyArray<Decision | undefined>> => {
  if (progress.passes >= PASS_LIMIT) return settled<A, E>(progress)
  return resumePass<A, E>(progress)
}

const deviationsOf = <A, E>(result: RunResult<A, E>): number => result.steps.filter(deviationAt).length

const shrunkOf = <A, E>(
  state: Round<A, E>,
  path: ReadonlyArray<Decision | undefined>,
): Promise<ShrinkOutcome<A, E>> =>
  runRound<A, E>({ ...state, path }).then((replay) => ({
    path: replay.decisions,
    deviations: deviationsOf(replay),
    result: replay,
  }))

const shrinkImpl = <A, E>(
  program: Effect.Effect<A, E>,
  options: ShrinkOptions<A, E>,
): Promise<ShrinkOutcome<A, E>> => {
  const state: Round<A, E> = {
    program,
    path: options.path,
    isFailure: options.isFailure ?? failKept,
    maxSteps: options.maxSteps,
  }
  return runRound<A, E>(state).then((failing) =>
    pass<A, E>({ state, path: deviationEntriesOf(failing), result: failing, from: 0, passes: 0 }).then((path) =>
      shrunkOf<A, E>({ ...state, path }, path)
    )
  )
}

export const shrink: {
  <A, E>(options: ShrinkOptions<A, E>): (program: Effect.Effect<A, E>) => Promise<ShrinkOutcome<A, E>>
  <A, E>(program: Effect.Effect<A, E>, options: ShrinkOptions<A, E>): Promise<ShrinkOutcome<A, E>>
} = dual(2, shrinkImpl)

const withoutIndex = <C>(commands: ReadonlyArray<C>, index: number): ReadonlyArray<C> => [
  ...commands.slice(0, index),
  ...commands.slice(index + 1),
]

const COMMAND_PASS_LIMIT = 64

interface CommandsState<C> {
  readonly commands: ReadonlyArray<C>
  readonly stillFails: (candidate: ReadonlyArray<C>) => Promise<boolean>
  readonly passes: number
}

const restartCommands = <C>(state: CommandsState<C>, candidate: ReadonlyArray<C>): Promise<ReadonlyArray<C>> =>
  commandsPass<C>({ commands: candidate, stillFails: state.stillFails, passes: state.passes + 1 })

const tryIndex = <C>(state: CommandsState<C>, index: number): Promise<ReadonlyArray<C>> => {
  const candidate = withoutIndex(state.commands, index)
  return state.stillFails(candidate).then((failed) => {
    if (failed) return restartCommands<C>(state, candidate)
    return tryNext<C>(state, index)
  })
}

const tryNext = <C>(state: CommandsState<C>, index: number): Promise<ReadonlyArray<C>> => {
  const next = index + 1
  if (next >= state.commands.length) return Promise.resolve(state.commands)
  return tryIndex<C>(state, next)
}

const commandsPass = <C>(state: CommandsState<C>): Promise<ReadonlyArray<C>> => {
  if (state.passes >= COMMAND_PASS_LIMIT) return Promise.resolve(state.commands)
  return tryIndex<C>(state, 0)
}

const shrinkCommandsImpl = <C>(
  commands: ReadonlyArray<C>,
  stillFails: (candidate: ReadonlyArray<C>) => Promise<boolean>,
): Promise<ReadonlyArray<C>> => commandsPass<C>({ commands, stillFails, passes: 0 })

export const shrinkCommands: {
  <C>(
    commands: ReadonlyArray<C>,
    stillFails: (candidate: ReadonlyArray<C>) => Promise<boolean>,
  ): Promise<ReadonlyArray<C>>
  <C>(
    stillFails: (candidate: ReadonlyArray<C>) => Promise<boolean>,
  ): (commands: ReadonlyArray<C>) => Promise<ReadonlyArray<C>>
} = dual((args: IArguments): boolean => Array.isArray(args[0]), shrinkCommandsImpl)
