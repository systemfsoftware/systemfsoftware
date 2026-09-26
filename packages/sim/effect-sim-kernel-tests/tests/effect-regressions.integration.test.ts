import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect, Layer, Queue } from 'effect'
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

/**
 * The step the minimal repro names: the first step where a resume left behind by
 * an earlier suspension is applied to a fiber that has since suspended elsewhere.
 */
const DEFECT_STEP = 19

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

const stoppedAtDefectStep = (program: Effect.Effect<void>): Effect.Effect<void> =>
  Effect.promise(() => Kernel.run(program, { interrupt: { atStep: DEFECT_STEP } })).pipe(Effect.asVoid)

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
      'A cleanup racing a fast send against a slow one keeps the fast send when the root stops inside it',
      Gherkin.Do.pipe(
        Given('a program whose cleanup races a fast send against a slow one')(
          'observe',
          () => Effect.succeed(raceFinalizerProgram),
        ),
        When('the kernel stops the root at the step the lost resume is applied')(
          'seen',
          (s) => collectWhile((record) => stoppedAtDefectStep(s.observe(record))),
        ),
        Then('the cleanup reports the fast send winning the race')((s, expect) => expect(s.seen).toEqual(['won'])),
      ),
    )

    scenario(
      'A cleanup sending under a time limit completes when the root stops inside it',
      Gherkin.Do.pipe(
        Given('a program whose cleanup sends under a time limit longer than the send')(
          'observe',
          () => Effect.succeed(sendUnderTimeoutProgram),
        ),
        When('the kernel stops the root at the step the lost resume is applied')(
          'seen',
          (s) => collectWhile((record) => stoppedAtDefectStep(s.observe(record))),
        ),
        Then('the cleanup reports the send completing')((s, expect) => expect(s.seen).toEqual(['sent'])),
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
