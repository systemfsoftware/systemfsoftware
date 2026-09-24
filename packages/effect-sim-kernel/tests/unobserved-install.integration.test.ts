import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import type * as EffectModule from 'effect'
import { Cause, Effect, Exit, Layer } from 'effect'
import { expect, vi } from 'vitest'
import { isOverBudget, outcomeBound, queueProgram } from './__fixtures__/searchFixtures.js'
import {
  DriftedSemaphore,
  isMessaged,
  latchProgram,
  pubSubProgram,
  semaphoreProgram,
} from './__fixtures__/unobservedInstallFixtures.js'

const watch = { driftedSemaphore: false }

vi.mock('effect', (importOriginal) =>
  importOriginal<typeof EffectModule>().then((actual) => ({
    ...actual,
    Semaphore: {
      ...actual.Semaphore,
      makeUnsafe: (permits: number) =>
        watch.driftedSemaphore ? new DriftedSemaphore(permits) : actual.Semaphore.makeUnsafe(permits),
    },
  })))

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
      'An Effect semaphore that lost its watched methods stops the run with a named complaint',
      Gherkin.Do.pipe(
        Given('the pinned Effect ships a semaphore whose constructor no longer defines the watched methods')(
          'world',
          () => Effect.succeed('drifted'),
        ),
        When('a semaphore-passing program is searched')(
          'exit',
          () =>
            Effect.gen(function*() {
              watch.driftedSemaphore = true
              const exit = yield* Effect.exit(
                Effect.promise(() => Kernel.search(semaphoreProgram, { preemptions: 1 })),
              )
              watch.driftedSemaphore = false
              return exit
            }),
        ),
        Then('the search dies saying which primitive lost which method')((s) => {
          if (!Exit.isFailure(s.exit)) {
            expect.fail('the search completed instead of complaining about the drifted semaphore')
          }
          const squashed = Cause.squash(s.exit.cause)
          const complaint = isMessaged(squashed) ? squashed.message : String(squashed)
          expect(complaint).toContain('Semaphore')
          expect(complaint).toContain('take')
        }),
      ),
    )

    scenario(
      'The pinned Effect passes the whole watch and the bound still names the queue',
      Gherkin.Do.pipe(
        Given('a program whose shared state holds a queue')('target', () => Effect.succeed(queueProgram)),
        When('the program is searched with one pause allowed')(
          'outcome',
          (s) => Effect.promise(() => Kernel.search(s.target, { preemptions: 1 })),
        ),
        Then('the search finishes within its bound')((s) => {
          expect(isOverBudget(s.outcome)).toBe(false)
        }),
        And('the bound names the queue among the primitives the kernel cannot watch')((s) => {
          expect(outcomeBound(s.outcome).pruning.disabledBy).toContain('Queue')
        }),
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
          Then('the bound reports pruning is off')((s) => {
            expect(isOverBudget(s.outcome)).toBe(false)
            expect(outcomeBound(s.outcome).pruning.enabled).toBe(false)
          }),
          And('the bound names the primitive the kernel cannot watch')((s) => {
            expect(outcomeBound(s.outcome).pruning.disabledBy).toContain(row.named)
          }),
        ),
    )
  })
