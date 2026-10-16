import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect, Layer } from 'effect'
import { outcomeBound, queueProgram } from './__fixtures__/searchFixtures.js'
import { latchProgram, pubSubProgram, semaphoreProgram } from './__fixtures__/unobservedInstallFixtures.js'

const Feature = makeFeature({ it })

const watchedPrimitives: ReadonlyArray<{
  readonly built: string
  readonly program: Effect.Effect<void>
  readonly named: string
}> = [
  { built: 'a semaphore granting one permit at a time', program: semaphoreProgram, named: 'Semaphore' },
  { built: 'a latch a worker waits on', program: latchProgram, named: 'Latch' },
  { built: 'a message board one worker publishes to', program: pubSubProgram, named: 'PubSub' },
]

Feature('Watching the shared primitives a run touches')
  .live('drives its own simulation-kernel run')
  .withLayer(Layer.empty)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'The pinned Effect passes the whole watch and the bound still names the queue',
      Gherkin.Do.pipe(
        Given('a program whose shared state holds a queue')('target', () => Effect.succeed(queueProgram)),
        When('the program is searched with one pause allowed')(
          'outcome',
          (s) => Effect.promise(() => Kernel.search(s.target, { preemptions: 1 })),
        ),
        Then('the search finishes within its bound, naming the queue among the primitives the kernel cannot watch')(
          (s, expect) =>
            expect({ tag: s.outcome._tag, disabledBy: outcomeBound(s.outcome).pruning.disabledBy }).toMatchObject({
              tag: 'Completed',
              disabledBy: expect.arrayContaining(['Queue']),
            }),
        ),
      ),
    )

    scenarioOutline(
      'A primitive <built> inside the run is named by the bound',
      watchedPrimitives,
      (row) =>
        Gherkin.Do.pipe(
          Given(`a program whose shared state holds ${row.built}`)('target', () => Effect.succeed(row.program)),
          When('the program is searched with one pause allowed')(
            'outcome',
            (s) => Effect.promise(() => Kernel.search(s.target, { preemptions: 1 })),
          ),
          Then('the bound reports pruning is off and names the primitive the kernel cannot watch')((s, expect) => {
            const bound = outcomeBound(s.outcome)
            return expect({ tag: s.outcome._tag, enabled: bound.pruning.enabled, disabledBy: bound.pruning.disabledBy })
              .toMatchObject({
                tag: 'Completed',
                enabled: false,
                disabledBy: expect.arrayContaining([row.named]),
              })
          }),
        ),
    )
  })
