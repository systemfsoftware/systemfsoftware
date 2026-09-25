import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Deferred, Effect, Fiber, Layer, Ref, Schema } from 'effect'
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
        Then('the default schedule writes waiting then yielding, and waking first reverses them')((s, expect) =>
          expect({
            defaultRun: completedValueOf(s.runs.defaultRun),
            wokenFirst: completedValueOf(s.runs.wokenFirst),
          }).toMatchObject({
            defaultRun: ['waiting worker', 'yielding worker'],
            wokenFirst: ['yielding worker', 'waiting worker'],
          })
        ),
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
        Then('the run fails naming the escaped timer and the call site outside the run')((s, expect) =>
          expect({ timer: escapeOf(s.run).timer, site: escapeOf(s.run).site }).toMatchObject({
            timer: 'setTimeout',
            site: expect.stringContaining('step-loop.integration.test.ts'),
          })
        ),
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
        Then('the woken worker finishes once the schedule picks it, at a step that offered more than one choice')(
          (s, expect) => {
            const steps = completedRunOf(s.run).steps
            return expect({
              value: completedValueOf(s.run),
              mostOptions: Math.max(...steps.map((step) => step.options)),
            }).toMatchObject({
              value: ['woken by in-process work'],
              mostOptions: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(1)))),
            })
          },
        ),
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
        Then('the run fails naming at least two stuck handoffs, each listed once with the frames it stopped in')(
          (s, expect) => {
            const suspended = deadlockOf(s.run).suspended
            const ids = suspended.map((worker) => worker.id).sort((left, right) => left - right)
            return expect({ workers: suspended, total: suspended.length, ids }).toMatchObject({
              workers: expect.schemaMatching(
                Schema.Array(Schema.Struct({ frames: Schema.NonEmptyArray(Schema.Unknown) })),
              ),
              total: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(2)))),
              ids: [...new Set(ids)],
            })
          },
        ),
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
        Then('both replays take the recorded schedule and agree on the outcome and the step history')((s, expect) => {
          const second = completedRunOf(s.runs.second)
          const third = completedRunOf(s.runs.third)
          return expect({
            replayChoices: second.steps.map((step) => step.choice),
            secondSteps: stepsWithoutFiberIds(second.steps),
            thirdSteps: stepsWithoutFiberIds(third.steps),
            secondFibers: fiberPatternOf(second.steps),
            thirdFibers: fiberPatternOf(third.steps),
            secondDecisions: second.decisions,
            thirdDecisions: third.decisions,
            secondValue: completedValueOf(s.runs.second),
            thirdValue: completedValueOf(s.runs.third),
          }).toEqual({
            replayChoices: [...s.runs.firstRun.decisions],
            secondSteps: stepsWithoutFiberIds(second.steps),
            thirdSteps: stepsWithoutFiberIds(second.steps),
            secondFibers: fiberPatternOf(second.steps),
            thirdFibers: fiberPatternOf(second.steps),
            secondDecisions: second.decisions,
            thirdDecisions: second.decisions,
            secondValue: completedValueOf(s.runs.second),
            thirdValue: completedValueOf(s.runs.second),
          })
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
        Then('the cleanup ran and the run exits with the interruption')((s, expect) =>
          expect({ receipts: s.receipts, exit: completedRunOf(s.run).exit }).toMatchObject({
            receipts: ['cleanup ran'],
            exit: { _tag: 'Failure', cause: { reasons: [{ _tag: 'Interrupt' }] } },
          })
        ),
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
        Then('no run leaves the source open')((s, expect) => expect(s.leftOpen).toEqual([])),
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
        Then('the program that can never finish reports its own stall, and the run that waited completes')((
          s,
          expect,
        ) =>
          expect({ stalled: deadlockOf(s.runs.stalled).suspended, queued: completedValueOf(s.runs.queued) })
            .toMatchObject({
              stalled: expect.schemaMatching(Schema.NonEmptyArray(Schema.Unknown)),
              queued: 'the waiting run finished',
            })
        ),
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
        Then(
          'no two runs were inside the program at once, and each run that started together returned what the run alone returned',
        )(
          (s, expect) => {
            const [first, second] = s.runs.together
            return expect({
              deepest: s.runs.deepest,
              first: completedValueOf(first),
              second: completedValueOf(second),
              firstDecisions: first.decisions,
              secondDecisions: second.decisions,
            }).toEqual({
              deepest: 1,
              first: completedValueOf(s.runs.alone),
              second: completedValueOf(s.runs.alone),
              firstDecisions: s.runs.alone.decisions,
              secondDecisions: s.runs.alone.decisions,
            })
          },
        ),
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
        Then('the setup steps keep the default choice and stay out of the recorded choices')((s, expect) =>
          expect({
            firstDeviation: s.runs.pinned.steps[0]?.deviation,
            pinnedGap: s.runs.pinned.steps.length - s.runs.pinned.decisions.length,
            exploredGap: s.runs.explored.decisions.length - s.runs.explored.steps.length,
          }).toMatchObject({
            firstDeviation: false,
            pinnedGap: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
            exploredGap: 0,
          })
        ),
      ),
    )
  })
