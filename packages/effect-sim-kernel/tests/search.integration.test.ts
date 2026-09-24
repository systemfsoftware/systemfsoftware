import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { ConfigProvider, Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { fiberPatternOf } from './__fixtures__/kernelFixtures.js'
import {
  checkThenSet,
  firstFailureValue,
  isOverBudget,
  outcomeBound,
  queueProgram,
  raceDetected,
  replayValueOf,
  scopedProgram,
  sharedScopeProgram,
} from './__fixtures__/searchFixtures.js'

const Feature = makeFeature({ it })

const TEST_FIBERS = 3
const TEST_STEPS = 400
const THREE_WORKERS_STEP_COUNT = 60

type SparsePath = ReadonlyArray<number | undefined>

interface StrayDetour {
  readonly position: number
  readonly choice: number
}

const deviationEntriesOf = (run: Kernel.RunResult<ReadonlyArray<boolean>, never>): SparsePath =>
  run.steps.map((step) => (step.deviation ? step.choice : undefined))

const racePositionOf = (run: Kernel.RunResult<ReadonlyArray<boolean>, never>): number =>
  run.steps.findIndex((step) => step.deviation)

const detoursAt = (step: Kernel.StepRecord, position: number): ReadonlyArray<StrayDetour> =>
  Array.from({ length: step.options }, (_value, choice) => ({ position, choice })).filter(
    (detour) => detour.choice !== step.fallback,
  )

const strayDetoursOf = (run: Kernel.RunResult<ReadonlyArray<boolean>, never>): ReadonlyArray<StrayDetour> => {
  const race = racePositionOf(run)
  return run.steps.flatMap((step, position) => (position > race ? detoursAt(step, position) : []))
}

const detourPairsOf = (detours: ReadonlyArray<StrayDetour>): ReadonlyArray<readonly [StrayDetour, StrayDetour]> =>
  detours.flatMap((first, index) =>
    detours.slice(index + 1).filter((second) => second.position !== first.position).map((second) =>
      [first, second] as const
    )
  )

const withDetours = (entries: SparsePath, pair: readonly [StrayDetour, StrayDetour]): SparsePath =>
  entries.map((entry, position) => pair.find((detour) => detour.position === position)?.choice ?? entry)

const threeDetours = (run: Kernel.RunResult<ReadonlyArray<boolean>, never>): boolean =>
  raceDetected(run) && run.steps.filter((step) => step.deviation).length === 3

const triedPair = (
  entries: SparsePath,
  pair: readonly [StrayDetour, StrayDetour],
): Promise<Kernel.RunResult<ReadonlyArray<boolean>, never> | undefined> =>
  Kernel.run(checkThenSet, { path: withDetours(entries, pair) }).then((run) => (threeDetours(run) ? run : undefined))

const firstThreeDetourRun = (
  failing: Kernel.RunResult<ReadonlyArray<boolean>, never>,
): Promise<Kernel.RunResult<ReadonlyArray<boolean>, never> | undefined> => {
  const entries = deviationEntriesOf(failing)
  return detourPairsOf(strayDetoursOf(failing)).reduce<
    Promise<Kernel.RunResult<ReadonlyArray<boolean>, never> | undefined>
  >(
    (pending, pair) => pending.then((found) => found ?? triedPair(entries, pair)),
    Promise.resolve(undefined),
  )
}

const oneDetourFailure = (): Promise<Kernel.RunResult<ReadonlyArray<boolean>, never>> =>
  Kernel.search(checkThenSet, { preemptions: 1, isFailure: raceDetected }).then((outcome) => {
    const failure = outcome.failures[0]
    if (failure === undefined) throw new Error('expected the race to be found with one pause')
    return Kernel.run(checkThenSet, { path: failure.path })
  })

const threeDetourPath = (): Promise<ReadonlyArray<number>> =>
  oneDetourFailure().then(firstThreeDetourRun).then((run) => {
    if (run === undefined) throw new Error('expected a pair of stray detours to keep the race lost')
    return run.decisions
  })

const twiceWithSeed = (
  seed: number,
): Promise<{
  readonly first: Kernel.RunResult<ReadonlyArray<boolean>, never>
  readonly second: Kernel.RunResult<ReadonlyArray<boolean>, never>
}> => {
  const chooserFor = () => Kernel.pick({ seed, depth: Kernel.pctDepth, steps: THREE_WORKERS_STEP_COUNT })
  const first = Kernel.run(checkThenSet, { choose: chooserFor() })
  return first.then((firstRun) =>
    Kernel.run(checkThenSet, { choose: chooserFor() }).then((secondRun) => ({ first: firstRun, second: secondRun }))
  )
}

const resourceHolders: ReadonlyArray<{
  readonly held: string
  readonly pruning: string
  readonly program: Effect.Effect<ReadonlyArray<string>>
  readonly pruned: boolean
  readonly names: ReadonlyArray<string>
}> = [
  {
    held: 'one worker opens and closes by itself',
    pruning: 'on',
    program: scopedProgram,
    pruned: true,
    names: [],
  },
  {
    held: 'a worker opens and a helper it starts inside also holds',
    pruning: 'off, naming the shared cleanup',
    program: sharedScopeProgram,
    pruned: false,
    names: ['Scope finalizer'],
  },
]

Feature('Searching schedules until a concurrency fault shows')
  .live('drives its own simulation-kernel run')
  .withLayer(Layer.empty)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A queue the search cannot watch turns pruning off, and the result says so',
      Gherkin.Do.pipe(
        Given('a program whose shared state holds a queue')(
          'target',
          () => Effect.succeed(queueProgram),
        ),
        When('the program is searched with one pause allowed')(
          'outcome',
          (s) => Effect.promise(() => Kernel.search(s.target, { preemptions: 1 })),
        ),
        Then('the search finishes within its stated bound')((s) => {
          expect(isOverBudget(s.outcome)).toBe(false)
        }),
        And('the bound reports pruning is off and names the queue')((s) => {
          const bound = outcomeBound(s.outcome)
          expect(bound.pruning.enabled).toBe(false)
          expect(bound.pruning.disabledBy).toContain('Queue')
        }),
      ),
    )

    scenario(
      'Two workers racing for an empty slot are caught with one pause, pruned and unpruned',
      Gherkin.Do.pipe(
        Given('two workers that each take an empty slot only while it is still empty')(
          'target',
          () => Effect.succeed(checkThenSet),
        ),
        When('the same target is searched pruned and unpruned')(
          'searches',
          (s) =>
            Effect.promise(() =>
              Kernel.search(s.target, { preemptions: 1, isFailure: raceDetected }).then((pruned) =>
                Kernel.search(s.target, {
                  preemptions: 1,
                  prune: false,
                  isFailure: raceDetected,
                }).then((unpruned) => ({ pruned, unpruned }))
              )
            ),
        ),
        Then('each search finds a run where both workers believed they took the slot')((s) => {
          expect(firstFailureValue(s.searches.pruned)).toEqual([true, true])
          expect(firstFailureValue(s.searches.unpruned)).toEqual([true, true])
        }),
        And('each failing schedule spends its one pause')((s) => {
          expect(s.searches.pruned.failures[0]?.preemptions).toBe(1)
          expect(s.searches.unpruned.failures[0]?.preemptions).toBe(1)
        }),
      ),
    )

    scenario(
      'A failing schedule padded with stray detours shrinks back to the detour that matters',
      Gherkin.Do.pipe(
        Given('a recorded schedule that loses the race only after three detours')(
          'path',
          () => Effect.promise(() => threeDetourPath()),
        ),
        When('the failing schedule is shrunk')(
          'shrunk',
          (s) => Effect.promise(() => Kernel.shrink(checkThenSet, { path: s.path, isFailure: raceDetected })),
        ),
        Then('only the detour that decides the race is left')((s) => {
          expect(s.shrunk.deviations).toBe(1)
        }),
        And('the shrunk schedule still fails on replay')((s) => {
          expect(replayValueOf(s.shrunk)).toEqual([true, true])
        }),
      ),
    )

    scenario(
      'The same starting number steers two runs down the same schedule',
      Gherkin.Do.pipe(
        Given('two runs steered by one starting number')(
          'seed',
          () => Effect.succeed(7),
        ),
        When('both runs start from that number')(
          'runs',
          (s) => Effect.promise(() => twiceWithSeed(s.seed)),
        ),
        Then('both runs take the same decisions in the same order')((s) => {
          expect(s.runs.first.decisions).toEqual(s.runs.second.decisions)
        }),
        And('both runs hand control to the same workers at the same moments')((s) => {
          expect(fiberPatternOf(s.runs.first.steps)).toEqual(fiberPatternOf(s.runs.second.steps))
        }),
      ),
    )

    scenario(
      'The nightly profile budgets the derived run count while per-change keeps two hundred and fifty',
      Gherkin.Do.pipe(
        Given('a budget measured at three workers and four hundred steps')(
          'budget',
          () => Effect.succeed({ fibers: TEST_FIBERS, steps: TEST_STEPS }),
        ),
        When('the nightly and per-change run counts are read')(
          'counts',
          (s) =>
            Effect.sync(() => ({
              nightly: Kernel.seedsFor(s.budget, 'nightly'),
              perChange: Kernel.seedsFor(s.budget, 'per-change'),
            })),
        ),
        Then('the nightly count is the derived count')((s) => {
          expect(s.counts.nightly).toBe(Math.ceil(Math.log(0.01) / Math.log(1 - 1 / (3 * 400 ** 2))))
        }),
        And('the per-change count stays at two hundred and fifty')((s) => {
          expect(s.counts.perChange).toBe(250)
        }),
      ),
    )

    scenario(
      'Naming the nightly profile in the environment selects the derived count',
      Gherkin.Do.pipe(
        Given('a budget measured at three workers and four hundred steps')(
          'budget',
          () => Effect.succeed({ fibers: TEST_FIBERS, steps: TEST_STEPS }),
        ),
        When('the count is read with the nightly profile named')(
          'count',
          (s) =>
            Effect.promise(() =>
              Effect.runPromise(
                Effect.provideService(
                  Kernel.currentSeedsFor(s.budget),
                  ConfigProvider.ConfigProvider,
                  ConfigProvider.fromEnvRecord({ CONFORMANCE_PROFILE: 'nightly' }),
                ),
              )
            ),
        ),
        Then('the count is the derived count rather than the per-change count')((s) => {
          expect(s.count).toBe(Math.ceil(Math.log(0.01) / Math.log(1 - 1 / (3 * 400 ** 2))))
          expect(s.count).not.toBe(250)
        }),
      ),
    )

    scenario(
      'A search out of schedules reports it ran out before covering its bound',
      Gherkin.Do.pipe(
        Given('a search allowed a single schedule before the race can appear')(
          'target',
          () => Effect.succeed(checkThenSet),
        ),
        When('the search runs out of schedules')(
          'outcome',
          (s) =>
            Effect.promise(() => Kernel.search(s.target, { preemptions: 2, maxSchedules: 1, isFailure: raceDetected })),
        ),
        Then('the search reports it ran out before covering its bound')((s) => {
          expect(isOverBudget(s.outcome)).toBe(true)
        }),
      ),
    )

    scenarioOutline(
      'A resource <held> leaves pruning <pruning>',
      resourceHolders,
      (row) =>
        Gherkin.Do.pipe(
          Given(`a program with a resource ${row.held}`)('target', () => Effect.succeed(row.program)),
          When('the program is searched with one pause allowed')(
            'outcome',
            (s) => Effect.promise(() => Kernel.search(s.target, { preemptions: 1 })),
          ),
          Then(`the bound reports pruning ${row.pruning}`)((s) => {
            expect(outcomeBound(s.outcome).pruning.enabled).toBe(row.pruned)
          }),
          And('the bound names only the cleanup two workers share')((s) => {
            expect(outcomeBound(s.outcome).pruning.disabledBy).toEqual(row.names)
          }),
        ),
    )
  })
