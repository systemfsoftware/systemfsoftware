import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect, Exit, Fiber, Queue, Ref } from 'effect'

export const checkThenSet: Effect.Effect<ReadonlyArray<boolean>> = Effect.gen(function*() {
  const holder = yield* Ref.make<string | null>(null)
  const tryAcquire = (who: string) =>
    Effect.gen(function*() {
      const current = yield* Ref.get(holder)
      if (current !== null) return false
      yield* Ref.set(holder, who)
      return true
    })
  const first = yield* Effect.forkChild(tryAcquire('a'))
  const second = yield* Effect.forkChild(tryAcquire('b'))
  const firstResult = yield* Fiber.join(first)
  const secondResult = yield* Fiber.join(second)
  return [firstResult, secondResult]
})

export const queueProgram: Effect.Effect<number> = Effect.gen(function*() {
  const queue = yield* Queue.unbounded<number>()
  yield* Queue.offer(queue, 1)
  return yield* Queue.take(queue)
})

export const scopedProgram: Effect.Effect<ReadonlyArray<string>> = Effect.gen(function*() {
  const events: Array<string> = []
  const acquire = Effect.sync(() => {
    events.push('acquired')
    return 'resource'
  })
  const release = () =>
    Effect.sync(() => {
      events.push('released')
    })
  yield* Effect.scoped(Effect.acquireRelease(acquire, release))
  return events
})

export const isOverBudget = <A, E>(outcome: Kernel.SearchReport<A, E>): boolean => 'limit' in outcome

export const budgetLimitOf = <A, E>(outcome: Kernel.SearchReport<A, E>): Kernel.BudgetLimit | undefined =>
  'limit' in outcome ? outcome.limit : undefined

export const outcomeBound = <A, E>(outcome: Kernel.SearchReport<A, E>): Kernel.Bound => outcome.bound

export const outcomeFailures = <A, E>(outcome: Kernel.SearchReport<A, E>): ReadonlyArray<Kernel.SearchFailure<A, E>> =>
  outcome.failures

const exitOf = <A, E>(result: Kernel.RunResult<A, E>): Exit.Exit<A, E> | undefined =>
  'exit' in result ? result.exit : undefined

export const firstFailureValue = <A, E>(outcome: Kernel.SearchReport<A, E>): A | undefined => {
  const first = outcome.failures[0]
  if (first === undefined) return undefined
  const exit = exitOf(first.result)
  return exit !== undefined && Exit.isSuccess(exit) ? exit.value : undefined
}

export const replayValueOf = <A, E>(outcome: Kernel.ShrinkOutcome<A, E>): A | undefined => {
  const exit = exitOf(outcome.result)
  return exit !== undefined && Exit.isSuccess(exit) ? exit.value : undefined
}

export const deviationCountOf = <A, E>(result: Kernel.RunResult<A, E>): number =>
  result.steps.filter((step) => step.deviation).length

/** The race the check-then-set workers lose: both report taking the slot. */
export const raceDetected = (result: Kernel.RunResult<ReadonlyArray<boolean>, never>): boolean => {
  const exit = exitOf(result)
  if (exit === undefined || !Exit.isSuccess(exit)) return false
  const value = exit.value
  return value[0] === true && value[1] === true
}

const PICKED_STEPS = 60

type RaceRun = Kernel.RunResult<ReadonlyArray<boolean>, never>
type SparsePath = ReadonlyArray<number | undefined>

interface Detour {
  readonly position: number
  readonly choice: number
}

const deviationEntriesOf = (run: RaceRun): SparsePath =>
  run.steps.map((step) => (step.deviation ? step.choice : undefined))

const racePositionOf = (run: RaceRun): number => run.steps.findIndex((step) => step.deviation)

const detoursAt = (step: Kernel.StepRecord, position: number): ReadonlyArray<Detour> =>
  Array.from({ length: step.options }, (_value, choice) => ({ position, choice })).filter(
    (detour) => detour.choice !== step.fallback,
  )

const strayDetoursOf = (run: RaceRun): ReadonlyArray<Detour> => {
  const race = racePositionOf(run)
  return run.steps.flatMap((step, position) => (position > race ? detoursAt(step, position) : []))
}

const detourPairsOf = (detours: ReadonlyArray<Detour>): ReadonlyArray<readonly [Detour, Detour]> =>
  detours.flatMap((first, index) =>
    detours.slice(index + 1).filter((second) => second.position !== first.position).map((second) =>
      [first, second] as const
    )
  )

const withDetours = (entries: SparsePath, pair: readonly [Detour, Detour]): SparsePath =>
  entries.map((entry, position) => pair.find((detour) => detour.position === position)?.choice ?? entry)

const threeDetours = (run: RaceRun): boolean => raceDetected(run) && deviationCountOf(run) === 3

const triedPair = (entries: SparsePath, pair: readonly [Detour, Detour]): Promise<RaceRun | undefined> =>
  Kernel.run(checkThenSet, { path: withDetours(entries, pair) }).then((run) => (threeDetours(run) ? run : undefined))

const firstThreeDetourRun = (failing: RaceRun): Promise<RaceRun | undefined> => {
  const entries = deviationEntriesOf(failing)
  return detourPairsOf(strayDetoursOf(failing)).reduce<Promise<RaceRun | undefined>>(
    (pending, pair) => pending.then((found) => found ?? triedPair(entries, pair)),
    Promise.resolve(undefined),
  )
}

const oneDetourFailure = (): Promise<RaceRun> =>
  Kernel.search(checkThenSet, { preemptions: 1, isFailure: raceDetected }).then((outcome) => {
    const failure = outcome.failures[0]
    if (failure === undefined) throw new Error('expected the race to be found at one preemption')
    return Kernel.run(checkThenSet, { path: failure.path })
  })

export const threeDeviationPath = (): Promise<ReadonlyArray<number>> =>
  oneDetourFailure().then(firstThreeDetourRun).then((run) => {
    if (run === undefined) throw new Error('no pair of later detours kept the race lost with exactly three detours')
    return run.decisions
  })

export interface SeedReplays {
  readonly first: Kernel.RunResult<ReadonlyArray<boolean>, never>
  readonly second: Kernel.RunResult<ReadonlyArray<boolean>, never>
}

/** Two full runs steered by the same seed, each with its own chooser. */
export const seededTwice = (seed: number): Promise<SeedReplays> => {
  const first = Kernel.run(checkThenSet, { choose: Kernel.pick({ seed, depth: Kernel.pctDepth, steps: PICKED_STEPS }) })
  return first.then((firstRun) =>
    Kernel.run(checkThenSet, { choose: Kernel.pick({ seed, depth: Kernel.pctDepth, steps: PICKED_STEPS }) }).then(
      (secondRun) => ({ first: firstRun, second: secondRun }),
    )
  )
}

export const nightlySeeds = (): number => Kernel.seedsFor({ fibers: 3, steps: 400 }, 'nightly')

export const perChangeSeeds = (): number => Kernel.seedsFor({ fibers: 3, steps: 400 }, 'per-change')
