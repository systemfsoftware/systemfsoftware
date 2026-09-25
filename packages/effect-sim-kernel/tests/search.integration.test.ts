import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect, Layer } from 'effect'
import { fiberPatternOf } from './__fixtures__/kernelFixtures.js'
import {
  allThreeClaimed,
  checkThenSet,
  firstFailureValue,
  outcomeBound,
  queueProgram,
  raceDetected,
  replayValueOf,
  scopedProgram,
  sharedScopeProgram,
  threeWorkerClaim,
} from './__fixtures__/searchFixtures.js'

const Feature = makeFeature({ it })

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
        Then('the search finishes within its stated bound, naming the queue among the primitives it cannot watch')(
          (s, expect) => {
            const bound = outcomeBound(s.outcome)
            return expect({ tag: s.outcome._tag, enabled: bound.pruning.enabled, disabledBy: bound.pruning.disabledBy })
              .toMatchObject({
                tag: 'Completed',
                enabled: false,
                disabledBy: expect.arrayContaining(['Queue']),
              })
          },
        ),
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
        Then('each search finds a run where both workers took the slot, spending its one pause')((s, expect) =>
          expect({
            pruned: firstFailureValue(s.searches.pruned),
            unpruned: firstFailureValue(s.searches.unpruned),
            prunedPauses: s.searches.pruned.failures[0]?.preemptions,
            unprunedPauses: s.searches.unpruned.failures[0]?.preemptions,
          }).toMatchObject({
            pruned: [true, true],
            unpruned: [true, true],
            prunedPauses: 1,
            unprunedPauses: 1,
          })
        ),
      ),
    )

    scenario(
      'Three workers racing for one empty slot need two pauses to all believe they won',
      Gherkin.Do.pipe(
        Given('three workers that each take the empty slot only while it is still empty')(
          'target',
          () => Effect.succeed(threeWorkerClaim),
        ),
        When('the same target is searched with one and then two pauses allowed')(
          'searches',
          (s) =>
            Effect.promise(() =>
              Kernel.search(s.target, { preemptions: 1, isFailure: allThreeClaimed }).then((onePause) =>
                Kernel.search(s.target, { preemptions: 2, isFailure: allThreeClaimed }).then((twoPauses) => ({
                  onePause,
                  twoPauses,
                }))
              )
            ),
        ),
        Then('one pause finds nothing, and two pauses catch a run that spent both of them')((s, expect) =>
          expect({
            onePauseTag: s.searches.onePause._tag,
            onePauseFailures: s.searches.onePause.failures,
            twoPauseValue: firstFailureValue(s.searches.twoPauses),
            twoPausePauses: s.searches.twoPauses.failures[0]?.preemptions,
          }).toMatchObject({
            onePauseTag: 'Completed',
            onePauseFailures: [],
            twoPauseValue: [true, true, true],
            twoPausePauses: 2,
          })
        ),
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
        Then('only the detour that decides the race is left, and the shrunk schedule still fails on replay')(
          (s, expect) =>
            expect({ deviations: s.shrunk.deviations, replay: replayValueOf(s.shrunk) }).toMatchObject({
              deviations: 1,
              replay: [true, true],
            }),
        ),
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
        Then('both runs take the same decisions and hand control to the same workers at the same moments')((
          s,
          expect,
        ) =>
          expect({
            firstDecisions: s.runs.first.decisions,
            secondDecisions: s.runs.second.decisions,
            firstFibers: fiberPatternOf(s.runs.first.steps),
            secondFibers: fiberPatternOf(s.runs.second.steps),
          }).toEqual({
            firstDecisions: s.runs.second.decisions,
            secondDecisions: s.runs.second.decisions,
            firstFibers: fiberPatternOf(s.runs.second.steps),
            secondFibers: fiberPatternOf(s.runs.second.steps),
          })
        ),
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
        Then('the search reports it ran out before covering its bound')((s, expect) =>
          expect(s.outcome).toMatchObject({
            _tag: 'OverBudget',
            failures: [],
            bound: expect.objectContaining({ preemptions: 2 }),
          })
        ),
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
          Then(`the bound reports pruning ${row.pruning} and names only the cleanup two workers share`)(
            (s, expect) => {
              const bound = outcomeBound(s.outcome)
              return expect({ enabled: bound.pruning.enabled, disabledBy: bound.pruning.disabledBy }).toMatchObject({
                enabled: row.pruned,
                disabledBy: row.names,
              })
            },
          ),
        ),
    )
  })
