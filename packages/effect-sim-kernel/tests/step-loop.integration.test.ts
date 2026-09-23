import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { beginExploration, runKernel } from '@systemfsoftware/effect-sim-kernel'
import { Deferred, Effect, Exit, Fiber, Layer } from 'effect'
import { expect } from 'vitest'
import {
  alwaysLast,
  attemptConcurrentRun,
  callHostTimeout,
  callOnNextMicrotask,
  completedRunOf,
  completedValueOf,
  deadlockOf,
  deviateAtFirstChoice,
  escapeOf,
  fiberPatternOf,
  replayRaceTwice,
  stepsWithoutFiberIds,
} from './__fixtures__/kernelFixtures.js'
import type { RaceReplays } from './__fixtures__/kernelFixtures.js'

const Feature = makeFeature({ it, layer })

const raceProgram = Effect.gen(function*() {
  const writes: Array<string> = []
  const yieldingFiber = Effect.gen(function*() {
    yield* Effect.sync(() => {})
    yield* Effect.sync(() => {
      writes.push('yielding fiber')
    })
  })
  const waiting = yield* Effect.forkChild(yieldingFiber)
  yield* Effect.promise(() => Promise.resolve('the finished task'))
  yield* Effect.sync(() => {
    writes.push('waiting fiber')
  })
  yield* Fiber.join(waiting)
  return writes
})

const timerProgram = Effect.gen(function*() {
  yield* Effect.sync(() => callHostTimeout(() => {}))
  return 'kept running past the timer'
})

const microtaskProgram = Effect.gen(function*() {
  const writes: Array<string> = []
  const woken = Effect.gen(function*() {
    yield* Effect.callback<void>((resume) => {
      callOnNextMicrotask(() => {
        resume(Effect.void)
      })
    })
    yield* Effect.sync(() => {
      writes.push('woken by in-process work')
    })
  })
  const fiber = yield* Effect.forkChild(woken)
  yield* Effect.yieldNow
  yield* Fiber.join(fiber)
  return writes
})

const deadlockedProgram = Effect.gen(function*() {
  const first = yield* Deferred.make<void>()
  const second = yield* Deferred.make<void>()
  const handoff = (mine: Deferred.Deferred<void>, theirs: Deferred.Deferred<void>) =>
    Effect.gen(function*() {
      yield* Deferred.await(mine)
      yield* Deferred.complete(theirs, Effect.void)
    })
  yield* Effect.forkChild(handoff(first, second))
  yield* Effect.forkChild(handoff(second, first))
  return yield* Effect.never
})

const interruptedProgram = (receipts: Array<string>) =>
  Effect.gen(function*() {
    yield* Effect.forkChild(
      Effect.gen(function*() {
        yield* Effect.yieldNow
        return yield* Effect.never
      }),
    )
    return yield* Effect.ensuring(
      Effect.never,
      Effect.sync(() => {
        receipts.push('cleanup ran')
      }),
    )
  })

const bodyProgram = Effect.gen(function*() {
  yield* Effect.forkChild(Effect.never)
  yield* Effect.yieldNow
  yield* beginExploration
  yield* Effect.yieldNow
  return yield* Effect.never
})

Feature('Running Effect programs again under a chosen schedule')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'The yielding fiber writes last until the schedule wakes the waiting fiber first',
      Gherkin.Do.pipe(
        Given('a race between a fiber waiting on a finished task and a fiber that yields once first')(
          'defaultRun',
          () => Effect.promise(() => runKernel(raceProgram)),
        ),
        When('the schedule takes one deviation at the first contention')(
          'deviatedRun',
          () => Effect.promise(() => runKernel(raceProgram, { choose: deviateAtFirstChoice })),
        ),
        Then('the yielding fiber writes last on the default schedule')((s) => {
          expect(completedValueOf(s.defaultRun)).toEqual(['waiting fiber', 'yielding fiber'])
        }),
        Then('the waiting fiber writes last after the one deviation')((s) => {
          expect(completedValueOf(s.deviatedRun)).toEqual(['yielding fiber', 'waiting fiber'])
        }),
      ),
    )

    scenario(
      'A program that reaches a real timer fails the run and names where it reached it',
      Gherkin.Do.pipe(
        Given('a program that sets a real timer while its work runs')(
          'run',
          () => Effect.promise(() => runKernel(timerProgram)),
        ),
        Then('the run fails because the timer escaped the controlled schedule')((s) => {
          expect(escapeOf(s.run).timer).toBe('setTimeout')
        }),
        Then('the failure names the call site outside the kernel')((s) => {
          expect(escapeOf(s.run).site).toContain('step-loop.integration.test.ts')
        }),
      ),
    )

    scenario(
      'In-process work that wakes a fiber hands the schedule its next choice',
      Gherkin.Do.pipe(
        Given('a fiber waiting for in-process work, beside a fiber that yields first')(
          'run',
          () => Effect.promise(() => runKernel(microtaskProgram)),
        ),
        Then('the woken fiber finishes once the schedule picks it')((s) => {
          expect(completedValueOf(s.run)).toEqual(['woken by in-process work'])
        }),
        Then('at least one step offered more than one choice')((s) => {
          expect(completedRunOf(s.run).steps.some((step) => step.options > 1)).toBe(true)
        }),
      ),
    )

    scenario(
      'Two fibers each waiting for the other to finish are reported as deadlocked',
      Gherkin.Do.pipe(
        Given('two fibers whose handoffs each wait for the other to move first')(
          'run',
          () => Effect.promise(() => runKernel(deadlockedProgram)),
        ),
        Then('the run fails as a deadlock naming the fibers it waits on')((s) => {
          expect(deadlockOf(s.run).suspended.length).toBeGreaterThanOrEqual(2)
        }),
        Then('the report lists each suspended fiber with the frames it stopped in')((s) => {
          const suspended = deadlockOf(s.run).suspended
          expect(suspended.every((fiber) => fiber.frames.length > 0)).toBe(true)
          expect(new Set(suspended.map((fiber) => fiber.id)).size).toBe(suspended.length)
        }),
      ),
    )

    scenario(
      'The same schedule replayed twice agrees with itself on the outcome and the history',
      Gherkin.Do.pipe(
        Given('a race that has already run, with its schedule recorded')(
          'firstRun',
          () => Effect.promise(() => runKernel(raceProgram)),
        ),
        When('the recorded schedule runs the race twice more')(
          'replays',
          (s): Effect.Effect<RaceReplays, never, never> =>
            Effect.promise(() => replayRaceTwice(raceProgram, s.firstRun.decisions)),
        ),
        Then('both replays take the recorded schedule')((s) => {
          const second = completedRunOf(s.replays.second)
          expect(second.steps.map((step) => step.choice)).toEqual([...s.firstRun.decisions])
        }),
        Then('both replays agree on the outcome and the step history')((s) => {
          const second = completedRunOf(s.replays.second)
          const third = completedRunOf(s.replays.third)
          expect(stepsWithoutFiberIds(third.steps)).toEqual(stepsWithoutFiberIds(second.steps))
          expect(fiberPatternOf(third.steps)).toEqual(fiberPatternOf(second.steps))
          expect(third.decisions).toEqual(second.decisions)
          expect(completedValueOf(s.replays.third)).toEqual(completedValueOf(s.replays.second))
        }),
      ),
    )

    scenario(
      'A fiber interrupted at a chosen step cleans up before the run exits interrupted',
      Gherkin.Do.pipe(
        Given('a suspended fiber whose cleanup writes a receipt')(
          'receipts',
          () => Effect.succeed<Array<string>>([]),
        ),
        When('the schedule interrupts it after the seventh step')(
          'run',
          (s) => Effect.promise(() => runKernel(interruptedProgram(s.receipts), { interrupt: { atStep: 7 } })),
        ),
        Then('the cleanup ran')((s) => {
          expect(s.receipts).toEqual(['cleanup ran'])
        }),
        Then('the run exits with the interruption')((s) => {
          expect(Exit.hasInterrupts(completedRunOf(s.run).exit)).toBe(true)
        }),
      ),
    )

    scenario(
      'A second run is refused while another run owns the schedule',
      Gherkin.Do.pipe(
        Given('a run that stalls because nothing can wake it')(
          'attempt',
          () =>
            Effect.gen(function*() {
              const stalled = runKernel(Effect.never)
              const rejected = attemptConcurrentRun(Effect.void)
              const stalledResult = yield* Effect.promise(() => stalled)
              return { rejected, stalledResult }
            }),
        ),
        Then('the second run is refused immediately')((s) => {
          expect(s.attempt.rejected?.message).toContain('already active')
        }),
        Then('the first run still reports its own stall')((s) => {
          expect(deadlockOf(s.attempt.stalledResult).suspended.length).toBeGreaterThan(0)
        }),
      ),
    )

    scenario(
      'Setup before the body stays outside exploration',
      Gherkin.Do.pipe(
        Given('a program whose setup suspends before the body starts')(
          'program',
          () => Effect.succeed(bodyProgram),
        ),
        When('exploration begins at the body')(
          'runs',
          (s) =>
            Effect.gen(function*() {
              const pinned = yield* Effect.promise(() => runKernel(s.program, { explore: 'body', choose: alwaysLast }))
              const explored = yield* Effect.promise(() => runKernel(s.program, { explore: 'all', choose: alwaysLast }))
              return { pinned, explored }
            }),
        ),
        Then('the setup steps keep the default choice')((s) => {
          expect(s.runs.pinned.steps[0]?.deviation).toBe(false)
        }),
        Then('the setup steps stay out of the recorded choices')((s) => {
          expect(s.runs.pinned.decisions.length).toBeLessThan(s.runs.pinned.steps.length)
          expect(s.runs.explored.decisions.length).toBe(s.runs.explored.steps.length)
        }),
      ),
    )
  })
