import { expect } from '@effect/vitest'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Deferred, Effect, Exit, Fiber, Layer, Ref } from 'effect'
import {
  alwaysLast,
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
import { stepsLeavingTheSourceOpen } from './__fixtures__/openSourceFixtures.js'

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

const depthProgram = (
  live: Ref.Ref<number>,
  peak: Ref.Ref<number>,
): Effect.Effect<string> =>
  Effect.gen(function*() {
    const inside = yield* Ref.updateAndGet(live, (running) => running + 1)
    yield* Ref.update(peak, (highest) => Math.max(highest, inside))
    yield* Effect.yieldNow
    yield* Ref.update(live, (running) => running - 1)
    return `finished at depth ${inside}`
  })

const someStepOfferedAChoice = (steps: ReadonlyArray<Kernel.StepRecord>): boolean =>
  steps.some((step) => step.options > 1)

const everyWorkerHasFrames = (workers: ReadonlyArray<Kernel.SuspendedFiber>): boolean =>
  workers.every((worker) => worker.frames.length > 0)

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
                Kernel.run(s.contest, { choose: deviateAtFirstChoice() }).then((wokenFirst) => ({
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
          expect(completedRunOf(s.run).steps).toSatisfy(someStepOfferedAChoice)
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
          expect(suspended).toSatisfy(everyWorkerHasFrames)
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
          expect(completedRunOf(s.run).exit).toSatisfy(Exit.hasInterrupts)
        }),
      ),
    )

    scenario(
      'A reader stopped at any step of its run still lets go of the source it opened',
      Gherkin.Do.pipe(
        Given('a source that stays open until its reader lets go, and a reader that takes one value from it')(
          'check',
          () => Effect.succeed(stepsLeavingTheSourceOpen),
        ),
        When('the reader is stopped after each step, one run for every step')(
          'leftOpen',
          (s) => Effect.promise(s.check),
        ),
        Then('no run leaves the source open')((s) => {
          expect(s.leftOpen).toEqual([])
        }),
      ),
    )

    scenario(
      'A run that starts beside a live one waits for it instead of being refused',
      Gherkin.Do.pipe(
        Given('a program that can never finish')(
          'program',
          () => Effect.succeed(Effect.never),
        ),
        When('that program starts, and a run that finishes starts beside it')(
          'runs',
          (s): Effect.Effect<
            {
              readonly stalled: Kernel.RunResult<never, never>
              readonly queued: Kernel.RunResult<string, never>
            },
            never,
            never
          > =>
            Effect.gen(function*() {
              const stalled = Kernel.run(s.program)
              const queued = Kernel.run(Effect.succeed('the waiting run finished'))
              return {
                stalled: yield* Effect.promise(() => stalled),
                queued: yield* Effect.promise(() => queued),
              }
            }),
        ),
        Then('the program that can never finish reports its own stall')((s) => {
          expect(deadlockOf(s.runs.stalled).suspended.length).toBeGreaterThan(0)
        }),
        And('the run that waited completes with its own answer')((s) => {
          expect(completedValueOf(s.runs.queued)).toBe('the waiting run finished')
        }),
      ),
    )

    scenario(
      'Two runs that start together never overlap and each keeps its own schedule',
      Gherkin.Do.pipe(
        Given('a program that reports the depth it was running at, and counters that track it')(
          'counters',
          () => Effect.all({ live: Ref.make(0), peak: Ref.make(0) }),
        ),
        When('the program runs alone, and then two runs start together')(
          'runs',
          (s) =>
            Effect.gen(function*() {
              const program = depthProgram(s.counters.live, s.counters.peak)
              const alone = yield* Effect.promise(() => Kernel.run(program))
              const together = yield* Effect.promise(() => Promise.all([Kernel.run(program), Kernel.run(program)]))
              return { alone, together, deepest: yield* Ref.get(s.counters.peak) }
            }),
        ),
        Then('no two runs were ever inside the program at once')((s) => {
          expect(s.runs.deepest).toBe(1)
        }),
        And('each run that started together returns what the run alone returned')((s) => {
          const [first, second] = s.runs.together
          expect(completedValueOf(first)).toBe(completedValueOf(s.runs.alone))
          expect(completedValueOf(second)).toBe(completedValueOf(s.runs.alone))
          expect(first.decisions).toEqual(s.runs.alone.decisions)
          expect(second.decisions).toEqual(s.runs.alone.decisions)
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
