import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect, Layer, Queue, Schema } from 'effect'
import {
  interruptOnEffectRuntime,
  probeYieldedGuard,
  raceFinalizerProgram,
  sendUnderTimeoutProgram,
} from './__fixtures__/finalizerFixtures.js'
import { sweepLostWakeups } from './__fixtures__/queueFixtures.js'
import type { Take } from './__fixtures__/queueFixtures.js'

const Feature = makeFeature({ it })

const waits: ReadonlyArray<{ readonly wait: string; readonly take: Take }> = [
  { wait: 'takes one message', take: (queue) => Effect.ignore(Queue.take(queue)) },
  { wait: 'takes a fixed number of messages', take: (queue) => Effect.ignore(Queue.takeN(queue, 1)) },
  { wait: 'takes every waiting message', take: (queue) => Effect.ignore(Queue.takeAll(queue)) },
  { wait: 'takes between one and five messages', take: (queue) => Effect.ignore(Queue.takeBetween(queue, 1, 5)) },
  { wait: 'looks at the next message', take: (queue) => Effect.ignore(Queue.peek(queue)) },
]

const collectWhile = (observe: (record: (value: string) => void) => Effect.Effect<void>): Effect.Effect<
  ReadonlyArray<string>
> =>
  Effect.gen(function*() {
    const seen: Array<string> = []
    yield* observe((value) => {
      seen.push(value)
    })
    return seen
  })

interface StopObservation {
  readonly step: number
  readonly observed: ReadonlyArray<string>
}

/**
 * Stops a program's root at every step of the run it takes uncut, so the step
 * the lost resume needs is derived from the run rather than pinned.
 */
const interruptedAtEveryStep = (
  program: (observed: (value: string) => void) => Effect.Effect<void>,
): Effect.Effect<{ readonly uncut: ReadonlyArray<string>; readonly rows: ReadonlyArray<StopObservation> }> =>
  Effect.gen(function*() {
    const uncut: Array<string> = []
    const counted = yield* Effect.promise(() =>
      Kernel.run(program((value) => {
        uncut.push(value)
      }))
    )
    const rows = yield* Effect.forEach(counted.steps, (step) =>
      Effect.promise(() => {
        const observed: Array<string> = []
        return Kernel.run(
          program((value) => {
            observed.push(value)
          }),
          { interrupt: { atStep: step.step } },
        )
          .then(() => ({ step: step.step, observed }))
      }))
    return { uncut, rows }
  })

const stepsObservingOther = (
  rows: ReadonlyArray<StopObservation>,
  winner: string,
): ReadonlyArray<number> => rows.filter((row) => row.observed.some((value) => value !== winner)).map((row) => row.step)

const firstResumedStep = (rows: ReadonlyArray<StopObservation>): number | undefined =>
  rows.find((row) => row.observed.length > 0)?.step

Feature('Running Effect programs the way Effect does')
  .live(
    'each scenario drives the simulation kernel or a live Effect runtime, and neither can run inside the feature runtime',
  )
  .withLayer(Layer.empty)
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      'A reader that <wait> gets a message offered while it was pausing to wait',
      waits,
      (row) =>
        Gherkin.Do.pipe(
          Given(`a reader that ${row.wait}, paused just before it starts waiting`)(
            'take',
            () => Effect.succeed(row.take),
          ),
          When('a message is offered during the pause, at every point the pause can fall')(
            'stranded',
            (s) => Effect.promise(() => sweepLostWakeups(s.take)),
          ),
          Then('no reader is left waiting beside a message already in its queue')((s, expect) =>
            expect(s.stranded).toEqual([])
          ),
        ),
    )

    scenario(
      'A cleanup racing a fast send against a slow one keeps the fast send whenever the root stops inside it',
      Gherkin.Do.pipe(
        Given('a program whose cleanup races a fast send against a slow one')(
          'observe',
          () => Effect.succeed(raceFinalizerProgram),
        ),
        When('the kernel stops the root at every step of the run it takes uncut')(
          'sweep',
          (s) => interruptedAtEveryStep(s.observe),
        ),
        Then('every stop that resumes the cleanup lets the fast send win, and stopped runs do resume it')((s, expect) =>
          expect({
            uncut: s.sweep.uncut,
            otherWinnerAt: stepsObservingOther(s.sweep.rows, 'won'),
            resumedAt: firstResumedStep(s.sweep.rows),
          }).toMatchObject({
            uncut: ['won'],
            otherWinnerAt: [],
            resumedAt: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
      ),
    )

    scenario(
      'A cleanup sending under a time limit completes whenever the root stops inside it',
      Gherkin.Do.pipe(
        Given('a program whose cleanup sends under a time limit longer than the send')(
          'observe',
          () => Effect.succeed(sendUnderTimeoutProgram),
        ),
        When('the kernel stops the root at every step of the run it takes uncut')(
          'sweep',
          (s) => interruptedAtEveryStep(s.observe),
        ),
        Then('every stop that resumes the cleanup lets the send complete, and stopped runs do resume it')((s, expect) =>
          expect({
            uncut: s.sweep.uncut,
            otherWinnerAt: stepsObservingOther(s.sweep.rows, 'sent'),
            resumedAt: firstResumedStep(s.sweep.rows),
          }).toMatchObject({
            uncut: ['sent'],
            otherWinnerAt: [],
            resumedAt: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
      ),
    )

    scenario(
      "Effect's own runtime resolves both stopped cleanups the same way",
      Gherkin.Do.pipe(
        Given('a program whose cleanup races a fast send against a slow one')(
          'race',
          () => Effect.succeed(raceFinalizerProgram),
        ),
        When("Effect's own runtime stops each cleanup inside its work")('seen', (s) =>
          Effect.gen(function*() {
            const raced = yield* collectWhile((record) => interruptOnEffectRuntime(s.race(record)))
            const sent = yield* collectWhile((record) => interruptOnEffectRuntime(sendUnderTimeoutProgram(record)))
            return { raced, sent }
          })),
        Then('each cleanup reports what the kernel must report')((s, expect) =>
          expect([s.seen.raced, s.seen.sent]).toEqual([['won'], ['sent']])
        ),
      ),
    )

    scenario(
      "A fiber's resume guard is present while suspended and gone after a resume",
      Gherkin.Do.pipe(
        Given('a fiber suspended on a value that has not arrived yet')(
          'observe',
          () => Effect.succeed(probeYieldedGuard),
        ),
        When('the value arrives and the fiber resumes')('guard', (s) => s.observe),
        Then('the guard was a callable while suspended and is cleared once resumed')((s, expect) =>
          expect(s.guard).toEqual({ suspended: true, cleared: true })
        ),
      ),
    )
  })
