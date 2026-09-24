import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
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
  stepsWithoutFiberIds,
} from './__fixtures__/kernelFixtures.js'

const Feature = makeFeature({ it })

const raceProgram = Effect.gen(function*() {
  const writes: Array<string> = []
  const yielding = Effect.gen(function*() {
    yield* Effect.sync(() => {})
    yield* Effect.sync(() => {
      writes.push('yielding worker')
    })
  })
  const waiting = yield* Effect.forkChild(yielding)
  yield* Effect.promise(() => Promise.resolve('the finished task'))
  yield* Effect.sync(() => {
    writes.push('waiting worker')
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

const handoffProgram = Effect.gen(function*() {
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

const setupProgram = Effect.gen(function*() {
  yield* Effect.forkChild(Effect.never)
  yield* Effect.yieldNow
  yield* Kernel.beginExploration
  yield* Effect.yieldNow
  return yield* Effect.never
})

interface ConcurrentAttempt {
  readonly rejected: Error | undefined
  readonly stalledResult: Kernel.RunResult<never, never>
}

const replayTwice = (
  program: typeof raceProgram,
  path: ReadonlyArray<Kernel.Decision>,
): Promise<{
  readonly second: Kernel.RunResult<ReadonlyArray<string>, never>
  readonly third: Kernel.RunResult<ReadonlyArray<string>, never>
}> => {
  const second = Kernel.run(program, { path })
  return second.then((secondRun) => Kernel.run(program, { path }).then((third) => ({ second: secondRun, third })))
}

Feature('Running one program again under a chosen schedule')
  .live('drives its own simulation-kernel run')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Waking the waiting worker first swaps which worker writes last',
      Gherkin.Do.pipe(
        Given('a race between a worker waiting on a finished task and a worker that writes once first')(
          'contest',
          () => Effect.succeed(raceProgram),
        ),
        When('the contest runs, then runs again with the waiting worker woken first')(
          'runs',
          (s) =>
            Effect.promise(() =>
              Kernel.run(s.contest).then((defaultRun) =>
                Kernel.run(s.contest, { choose: deviateAtFirstChoice }).then((wokenFirst) => ({
                  defaultRun,
                  wokenFirst,
                }))
              )
            ),
        ),
        Then('on the default schedule the writing worker writes last')((s) => {
          expect(completedValueOf(s.runs.defaultRun)).toEqual(['waiting worker', 'yielding worker'])
        }),
        And('with the waiting worker woken first the waiting worker writes last')((s) => {
          expect(completedValueOf(s.runs.wokenFirst)).toEqual(['yielding worker', 'waiting worker'])
        }),
      ),
    )

    scenario(
      'A program that reaches a real timer fails the run and names where it reached it',
      Gherkin.Do.pipe(
        Given('a program that sets a real timer while its work runs')(
          'contest',
          () => Effect.succeed(timerProgram),
        ),
        When('the program runs')(
          'run',
          (s) => Effect.promise(() => Kernel.run(s.contest)),
        ),
        Then('the run fails naming the escaped timer')((s) => {
          expect(escapeOf(s.run).timer).toBe('setTimeout')
        }),
        And('the failure names the call site outside the run')((s) => {
          expect(escapeOf(s.run).site).toContain('step-loop.integration.test.ts')
        }),
      ),
    )

    scenario(
      'In-process work that wakes a worker hands the schedule its next choice',
      Gherkin.Do.pipe(
        Given('a worker waiting for in-process work, beside a worker that writes first')(
          'contest',
          () => Effect.succeed(microtaskProgram),
        ),
        When('the contest runs')(
          'run',
          (s) => Effect.promise(() => Kernel.run(s.contest)),
        ),
        Then('the woken worker finishes once the schedule picks it')((s) => {
          expect(completedValueOf(s.run)).toEqual(['woken by in-process work'])
        }),
        And('at least one step offered more than one choice')((s) => {
          expect(completedRunOf(s.run).steps.some((step) => step.options > 1)).toBe(true)
        }),
      ),
    )

    scenario(
      'Two handoffs that each wait for the other are reported as stuck',
      Gherkin.Do.pipe(
        Given('two handoffs that each wait for the other to move first')(
          'contest',
          () => Effect.succeed(handoffProgram),
        ),
        When('the handoffs run')(
          'run',
          (s) => Effect.promise(() => Kernel.run(s.contest)),
        ),
        Then('the run fails naming at least the two stuck handoffs')((s) => {
          expect(deadlockOf(s.run).suspended.length).toBeGreaterThanOrEqual(2)
        }),
        And('every stuck worker is listed once with the frames it stopped in')((s) => {
          const suspended = deadlockOf(s.run).suspended
          expect(suspended.every((worker) => worker.frames.length > 0)).toBe(true)
          expect(new Set(suspended.map((worker) => worker.id)).size).toBe(suspended.length)
        }),
      ),
    )

    scenario(
      'The same recorded schedule replayed twice agrees with itself on the outcome and the history',
      Gherkin.Do.pipe(
        Given('a race that has already run, with its schedule recorded')(
          'contest',
          () => Effect.succeed(raceProgram),
        ),
        When('the race runs once and the recorded schedule replays twice more')(
          'runs',
          (s) =>
            Effect.promise(() =>
              Kernel.run(s.contest).then((firstRun) =>
                replayTwice(s.contest, firstRun.decisions).then((replays) => ({ firstRun, ...replays }))
              )
            ),
        ),
        Then('both replays take the recorded schedule')((s) => {
          const second = completedRunOf(s.runs.second)
          expect(second.steps.map((step) => step.choice)).toEqual([...s.runs.firstRun.decisions])
        }),
        And('both replays agree on the outcome and the step history')((s) => {
          const second = completedRunOf(s.runs.second)
          const third = completedRunOf(s.runs.third)
          expect(stepsWithoutFiberIds(third.steps)).toEqual(stepsWithoutFiberIds(second.steps))
          expect(fiberPatternOf(third.steps)).toEqual(fiberPatternOf(second.steps))
          expect(third.decisions).toEqual(second.decisions)
          expect(completedValueOf(s.runs.third)).toEqual(completedValueOf(s.runs.second))
        }),
      ),
    )

    scenario(
      'A worker interrupted at a chosen step cleans up before the run exits interrupted',
      Gherkin.Do.pipe(
        Given('a suspended worker whose cleanup writes a receipt')(
          'receipts',
          () => Effect.succeed<Array<string>>([]),
        ),
        When('the worker runs and is interrupted after the eleventh step')(
          'run',
          (s) => Effect.promise(() => Kernel.run(interruptedProgram(s.receipts), { interrupt: { atStep: 11 } })),
        ),
        Then('the cleanup ran')((s) => {
          expect(s.receipts).toEqual(['cleanup ran'])
        }),
        And('the run exits with the interruption')((s) => {
          expect(Exit.hasInterrupts(completedRunOf(s.run).exit)).toBe(true)
        }),
      ),
    )

    scenario(
      'A second run is refused while another run owns the schedule',
      Gherkin.Do.pipe(
        Given('no run owns the schedule')(
          'program',
          () => Effect.succeed(Effect.never),
        ),
        When('one run stalls and a second run starts beside it')(
          'attempt',
          (s): Effect.Effect<ConcurrentAttempt, never, never> =>
            Effect.gen(function*() {
              const stalled = Kernel.run(s.program)
              const rejected = attemptConcurrentRun(Effect.void)
              const stalledResult = yield* Effect.promise(() => stalled)
              return { rejected, stalledResult }
            }),
        ),
        Then('the second run is refused immediately')((s) => {
          expect(s.attempt.rejected?.message).toContain('already active')
        }),
        And('the first run still reports its own stall')((s) => {
          expect(deadlockOf(s.attempt.stalledResult).suspended.length).toBeGreaterThan(0)
        }),
      ),
    )

    scenario(
      'Setup before the body stays outside the explored schedule',
      Gherkin.Do.pipe(
        Given('a program whose setup pauses before the body starts')(
          'contest',
          () => Effect.succeed(setupProgram),
        ),
        When('the program runs pinned and fully explored')(
          'runs',
          (s) =>
            Effect.gen(function*() {
              const pinned = yield* Effect.promise(() => Kernel.run(s.contest, { explore: 'body', choose: alwaysLast }))
              const explored = yield* Effect.promise(() =>
                Kernel.run(s.contest, { explore: 'all', choose: alwaysLast })
              )
              return { pinned, explored }
            }),
        ),
        Then('the setup steps keep the default choice')((s) => {
          expect(s.runs.pinned.steps[0]?.deviation).toBe(false)
        }),
        And('the setup steps stay out of the recorded choices')((s) => {
          expect(s.runs.pinned.decisions.length).toBeLessThan(s.runs.pinned.steps.length)
          expect(s.runs.explored.decisions.length).toBe(s.runs.explored.steps.length)
        }),
      ),
    )
  })
