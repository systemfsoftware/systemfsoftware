/**
 * Preemption-bounded exhaustive search (KTD3, R32, R35, KTD17). The
 * zero-preemption run replays Effect's own dispatcher order; the search then
 * explores every schedule within the preemption bound by deviating from that
 * order, and preempts only before steps that touch state the kernel observes
 * (`StepRecord.visible`) while every shared primitive the target uses stays
 * observed. Every result carries its bound, and a search that exhausts its
 * schedule budget before covering it fails as over budget. The budget is
 * counted in schedules, never in wall-clock time, so the same search reaches
 * the same verdict on a loaded machine as on an idle one.
 */
import { Effect } from 'effect'
import { dual } from 'effect/Function'

import { currentKernel } from '../internal/runMark.js'
import { installUnobserved } from '../internal/Unobserved.js'
import type { Bound, Pruning, UnobservedPrimitive } from './Bound.js'
import { pruned, unpruned } from './Bound.js'
import { run } from './Run.js'
import type { Choice, Decision, RunResult } from './Run.js'

const CompletedTag = { _tag: 'Completed' } as const
const OverBudgetTag = { _tag: 'OverBudget' } as const

type CompletedTag = typeof CompletedTag
type OverBudgetTag = typeof OverBudgetTag

export const searchTags = { completed: CompletedTag, overBudget: OverBudgetTag } as const

export interface SearchOptions<A, E> {
  readonly preemptions?: number
  readonly maxSchedules?: number
  readonly isFailure?: (result: RunResult<A, E>) => boolean
  readonly maxSteps?: number
  readonly prune?: boolean
}

export interface SearchFailure<A, E> {
  readonly path: ReadonlyArray<Decision>
  readonly preemptions: number
  readonly result: RunResult<A, E>
}

export interface SearchOutcome<A, E> extends CompletedTag {
  readonly failures: ReadonlyArray<SearchFailure<A, E>>
  readonly bound: Bound
}

export interface OverBudgetOutcome<A, E> extends OverBudgetTag {
  readonly failures: ReadonlyArray<SearchFailure<A, E>>
  readonly bound: Bound
}

type RunOptionsLike = {
  readonly choose?: (choice: Choice) => Decision | undefined
  readonly maxSteps?: number
}

const PRIMITIVES: Record<string, UnobservedPrimitive> = {
  Queue: 'Queue',
  PubSub: 'PubSub',
  Semaphore: 'Semaphore',
  Latch: 'Latch',
  'Scope finalizer': 'Scope finalizer',
}

export type SearchReport<A, E> = SearchOutcome<A, E> | OverBudgetOutcome<A, E>

const failKept = <A, E>(result: RunResult<A, E>): boolean => 'failure' in result

const DEFAULT_PREEMPTIONS = 2

const DEFAULT_MAX_SCHEDULES = 100_000

interface Schedule {
  readonly path: ReadonlyArray<Decision>
  readonly used: number
}

interface Observed<A, E> {
  readonly result: RunResult<A, E>
  readonly schedule: Schedule
  readonly unobserved: ReadonlyArray<string>
}

interface SearchState<A, E> {
  readonly program: Effect.Effect<A, E>
  /** Pending schedules, earliest deviation first, drained from `head`. */
  readonly queue: Array<Schedule>
  head: number
  schedules: number
  fibers: number
  operations: number
  readonly collected: Array<string>
  readonly preemptions: number
  readonly maxSchedules: number
  readonly isFailure: (result: RunResult<A, E>) => boolean
  readonly maxSteps: number | undefined
  readonly prune: boolean
}

const distinctFibers = <A, E>(result: RunResult<A, E>): number => new Set(result.steps.map((step) => step.fiberId)).size

const preemptionsOf = (options: SearchOptions<never, never>): number => options.preemptions ?? DEFAULT_PREEMPTIONS

const maxSchedulesOf = (options: SearchOptions<never, never>): number => options.maxSchedules ?? DEFAULT_MAX_SCHEDULES

const pruneOf = (options: SearchOptions<never, never>): boolean => options.prune ?? true

const searchState = <A, E>(program: Effect.Effect<A, E>, options: SearchOptions<A, E>): SearchState<A, E> => ({
  program,
  queue: [{ path: [], used: 0 }],
  head: 0,
  schedules: 0,
  fibers: 0,
  operations: 0,
  collected: [],
  preemptions: preemptionsOf(options),
  maxSchedules: maxSchedulesOf(options),
  isFailure: options.isFailure ?? failKept,
  maxSteps: options.maxSteps,
  prune: pruneOf(options),
})

const namedPrimitives = (collected: ReadonlyArray<string>): ReadonlyArray<UnobservedPrimitive> =>
  [...new Set(collected)]
    .sort((left, right) => (left < right ? -1 : 1))
    .flatMap((name) => {
      const primitive = PRIMITIVES[name]
      return primitive === undefined ? [] : [primitive]
    })

const pruningLive = <A, E>(state: SearchState<A, E>): boolean => state.prune && state.collected.length === 0

const pruningSkipped = <A, E>(state: SearchState<A, E>): boolean => !pruningLive(state)

const disabledPruning = <A, E>(state: SearchState<A, E>): Pruning => unpruned(namedPrimitives(state.collected))

const pruningOf = <A, E>(state: SearchState<A, E>): Pruning => {
  if (pruningSkipped(state)) return disabledPruning(state)
  return pruned
}

const boundOf = <A, E>(state: SearchState<A, E>): Bound => ({
  fibers: state.fibers,
  operations: state.operations,
  preemptions: state.preemptions,
  depth: state.preemptions,
  runs: state.schedules,
  pruning: pruningOf(state),
})

const drainNow = (collected: Array<string>): void => {
  const kernel = currentKernel()
  if (kernel !== undefined) collected.push(...kernel.takeUnobserved())
}

const chooserFor = (
  schedule: Schedule,
  collected: Array<string>,
): (choice: Choice) => Decision | undefined => {
  const recorded = (choice: Choice): Decision | undefined => schedule.path[choice.index]
  return (choice: Choice): Decision | undefined => {
    drainNow(collected)
    return recorded(choice)
  }
}

const runOptions = <A, E>(
  state: SearchState<A, E>,
  choose: (choice: Choice) => Decision | undefined,
): RunOptionsLike => {
  const maxSteps = state.maxSteps
  if (maxSteps === undefined) return { choose }
  return { choose, maxSteps }
}

const deviationsBefore = (steps: ReadonlyArray<{ readonly deviation: boolean }>): ReadonlyArray<number> => {
  let spent = 0
  return steps.map((step) => {
    const before = spent
    spent += Number(step.deviation)
    return before
  })
}

const indices = (count: number): ReadonlyArray<number> => Array.from({ length: count }, (_value, index) => index)

const preemptableStep = <A, E>(state: SearchState<A, E>, visible: boolean): boolean =>
  pruningLive(state) ? visible : true

const branchCost = (fallback: Decision, alt: number, spent: number): number => alt === fallback ? spent : spent + 1

const altBranch = <A, E>(
  state: SearchState<A, E>,
  fallback: Decision,
  position: number,
  choices: ReadonlyArray<Decision>,
  spent: number,
  alt: number,
): Schedule | undefined => {
  const cost = branchCost(fallback, alt, spent)
  return cost <= state.preemptions ? { path: [...choices.slice(0, position), alt], used: cost } : undefined
}

const branchSkipped = (
  step: { readonly visible: boolean; readonly choice: Decision },
  alt: number,
  preemptable: boolean,
): boolean => alt === step.choice || !preemptable

const visibleBranch = <A, E>(
  state: SearchState<A, E>,
  step: { readonly visible: boolean; readonly fallback: Decision; readonly choice: Decision; readonly options: number },
  position: number,
  choices: ReadonlyArray<Decision>,
  spent: number,
  alt: number,
): Schedule | undefined => {
  if (branchSkipped(step, alt, preemptableStep(state, step.visible))) return undefined
  return altBranch(state, step.fallback, position, choices, spent, alt)
}

const stepBranches = <A, E>(
  state: SearchState<A, E>,
  result: RunResult<A, E>,
  position: number,
  spent: number,
): ReadonlyArray<Schedule> => {
  const step = result.steps[position]
  if (step === undefined) return []
  return indices(step.options).flatMap((alt) => {
    const branch = visibleBranch(state, step, position, result.decisions, spent, alt)
    return branch === undefined ? [] : [branch]
  })
}

const branchesOf = <A, E>(
  state: SearchState<A, E>,
  result: RunResult<A, E>,
  explored: number,
): ReadonlyArray<Schedule> => {
  const spent = deviationsBefore(result.steps)
  return result.decisions.slice(explored).flatMap((_decision, offset) =>
    stepBranches(state, result, explored + offset, spent[explored + offset] ?? 0)
  )
}

const absorb = <A, E>(state: SearchState<A, E>, observed: Observed<A, E>): void => {
  state.schedules += 1
  state.collected.push(...observed.unobserved)
  state.fibers = Math.max(state.fibers, distinctFibers(observed.result))
  state.operations = Math.max(state.operations, observed.result.steps.length)
}

const found = <A, E>(state: SearchState<A, E>, observed: Observed<A, E>): SearchOutcome<A, E> => ({
  ...searchTags.completed,
  failures: [
    { path: observed.result.decisions, preemptions: observed.schedule.used, result: observed.result },
  ],
  bound: boundOf(state),
})

const observe = <A, E>(state: SearchState<A, E>, observed: Observed<A, E>): Promise<SearchReport<A, E>> => {
  absorb(state, observed)
  if (state.isFailure(observed.result)) return Promise.resolve(found(state, observed))
  return expand(state, observed)
}

const completedOutcome = <A, E>(state: SearchState<A, E>): SearchOutcome<A, E> => ({
  ...searchTags.completed,
  failures: [],
  bound: boundOf(state),
})

const overBudget = <A, E>(state: SearchState<A, E>): OverBudgetOutcome<A, E> => ({
  ...searchTags.overBudget,
  failures: [],
  bound: boundOf(state),
})

const scheduleHalt = <A, E>(state: SearchState<A, E>): OverBudgetOutcome<A, E> | undefined => {
  if (state.schedules < state.maxSchedules) return undefined
  return overBudget(state)
}

const pendingSchedule = <A, E>(state: SearchState<A, E>): Schedule | undefined => {
  const schedule = state.queue[state.head]
  if (schedule !== undefined) state.head += 1
  return schedule
}

const exploreNext = <A, E>(state: SearchState<A, E>): Promise<SearchReport<A, E>> => {
  const schedule = pendingSchedule(state)
  if (schedule === undefined) return Promise.resolve(completedOutcome(state))
  const collected: Array<string> = []
  return run<A, E>(state.program, runOptions(state, chooserFor(schedule, collected))).then((result) =>
    observe(state, { result, schedule, unobserved: collected })
  )
}

const driveSearch = <A, E>(state: SearchState<A, E>): Promise<SearchReport<A, E>> => {
  const halted = scheduleHalt(state)
  if (halted !== undefined) return Promise.resolve(halted)
  return exploreNext(state)
}

const expand = <A, E>(state: SearchState<A, E>, observed: Observed<A, E>): Promise<SearchReport<A, E>> => {
  const explored = observed.schedule.path.length
  const fresh = branchesOf(state, observed.result, explored)
  for (const branch of fresh) state.queue.push(branch)
  return driveSearch(state)
}

const searchImpl = <A, E>(
  program: Effect.Effect<A, E>,
  options: SearchOptions<A, E> = {},
): Promise<SearchReport<A, E>> => {
  installUnobserved()
  const state = searchState(program, options)
  return driveSearch(state)
}

export const search: {
  <A, E>(program: Effect.Effect<A, E>, options?: SearchOptions<A, E>): Promise<SearchReport<A, E>>
  <A, E>(options?: SearchOptions<A, E>): (program: Effect.Effect<A, E>) => Promise<SearchReport<A, E>>
} = dual(
  (args: IArguments): boolean => args.length === 2 || Effect.isEffect(args[0]),
  searchImpl,
)
