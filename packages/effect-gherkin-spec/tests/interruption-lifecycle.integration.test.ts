import { expect } from '@effect/vitest'
import {
  And,
  checkSoftFailures,
  Gherkin,
  Given,
  it,
  layer,
  makeFeature,
  Then,
  When,
} from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Exit, Fiber, Layer, Ref } from 'effect'
import { TestClock } from 'effect/testing'

const Feature = makeFeature({ it, layer })

Feature('Step lifecycle finalizers and fiber supervision')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Scoped resource finalizers run in reverse order upon step failure',
      Effect.gen(function*() {
        const finalizerLog = yield* Ref.make<readonly string[]>([])

        const acquireResource = (name: string) =>
          Effect.acquireRelease(
            Ref.update(finalizerLog, (log) => [...log, `acquired:${name}`]).pipe(Effect.as(name)),
            () => Ref.update(finalizerLog, (log) => [...log, `released:${name}`]),
          )

        const pipeline = Gherkin.Do.pipe(
          Given('a first scoped database handle')('resA', () => acquireResource('db')),
          Given('a second scoped transaction handle')('resB', () => acquireResource('tx')),
          When('a downstream step fails catastrophically')('outcome', () => Effect.fail('fatal_step_error')),
        )

        const exit = yield* Effect.scoped(Effect.exit(pipeline))

        expect(exit).toSatisfy(Exit.isFailure)

        const history = yield* Ref.get(finalizerLog)
        expect(history).toEqual([
          'acquired:db',
          'acquired:tx',
          'released:tx',
          'released:db',
        ])
      }),
    )

    scenario(
      'An interrupted polling step halts background retries and cleans up fibers',
      Effect.gen(function*() {
        const pollAttempts = yield* Ref.make(0)

        const pipeline = Gherkin.Do.pipe(
          Given('a service readiness check')('active', () => Effect.succeed(true)),
          When.poll('the service state converges', {
            interval: '20 millis',
            timeout: '500 millis',
          })(() =>
            Ref.update(pollAttempts, (n) => n + 1).pipe(
              Effect.flatMap(() => Effect.fail('not_ready_yet')),
            )
          ),
        )

        const fiber = yield* Effect.forkChild(pipeline)

        yield* Effect.yieldNow
        yield* TestClock.adjust('20 millis')
        yield* Effect.yieldNow
        yield* TestClock.adjust('20 millis')
        yield* Effect.yieldNow

        const attemptsBeforeInterrupt = yield* Ref.get(pollAttempts)
        expect(attemptsBeforeInterrupt).toBeGreaterThanOrEqual(2)

        yield* Fiber.interrupt(fiber)

        yield* TestClock.adjust('100 millis')
        yield* Effect.yieldNow

        const attemptsAfterInterrupt = yield* Ref.get(pollAttempts)
        expect(attemptsAfterInterrupt).toBe(attemptsBeforeInterrupt)
      }),
    )

    scenario(
      'A soft failure does not abort resource scope until the pipeline concludes',
      Effect.gen(function*() {
        const lifecycleEvents = yield* Ref.make<readonly string[]>([])

        const acquireSession = Effect.acquireRelease(
          Ref.update(lifecycleEvents, (log) => [...log, 'session:opened']).pipe(Effect.as('sess_active')),
          () => Ref.update(lifecycleEvents, (log) => [...log, 'session:closed']),
        )

        const pipeline = Gherkin.Do.pipe(
          Given('an active managed session')('session', () => acquireSession),
          Then.soft('a first diagnostic check soft-fails')(() => {
            throw new Error('diagnostic_warning_1')
          }),
          And('the session remains valid and accessible after the soft failure')((s) =>
            Ref.update(lifecycleEvents, (log) => [...log, `session_used:${s.session}`])
          ),
          Then.soft('a second diagnostic check soft-fails')(() => {
            throw new Error('diagnostic_warning_2')
          }),
        )

        const exit = yield* Effect.scoped(Effect.exit(checkSoftFailures(pipeline.pipe(Effect.asVoid))))

        expect(exit).toSatisfy(Exit.isFailure)

        const log = yield* Ref.get(lifecycleEvents)
        expect(log).toEqual([
          'session:opened',
          'session_used:sess_active',
          'session:closed',
        ])
      }),
    )
  })
