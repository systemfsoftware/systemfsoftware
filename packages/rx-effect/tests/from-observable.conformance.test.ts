import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Cause, Duration, Effect, Exit, Stream } from 'effect'
import { UnknownError } from 'effect/Cause'
import type { Observable } from 'rxjs'

import { fromObservable } from '@systemfsoftware/rx-effect'

import { type SourceEnding, type SubscribedSource, subscribedSource } from './__fixtures__/observable-release.model.js'

const Feature = makeFeature({ it })

const bridging = (source: Observable<number>): Stream.Stream<number, UnknownError> =>
  fromObservable((error) => new UnknownError(error))(source)

const readingOne = (source: Observable<number>): Effect.Effect<void, UnknownError> =>
  Stream.runDrain(bridging(source).pipe(Stream.take(1)))

const endingInAFailure = (source: Observable<number>): Effect.Effect<void> =>
  Effect.flatMap(
    Effect.exit(Stream.runDrain(bridging(source))),
    (exit) =>
      Exit.isFailure(exit) && Cause.hasFails(exit.cause)
        ? Effect.void
        : Effect.die(new Error('the source failure never reached the reader as a typed failure')),
  )

const endingInCompletion = (source: Observable<number>): Effect.Effect<void> =>
  Effect.flatMap(Effect.exit(Stream.runDrain(bridging(source))), (exit) =>
    Exit.isSuccess(exit)
      ? Effect.void
      : Effect.die(new Error('the source completion never reached the reader')))

const nobodySubscribed = (world: SubscribedSource): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.mapError(world.check.probe, (refusal) => Conformance.RuleBroken.make({ message: refusal.reason }))

const restartedAfter = (
  read: (world: SubscribedSource) => Effect.Effect<void, UnknownError>,
): (world: SubscribedSource) => Effect.Effect<void, UnknownError> =>
(world) => Effect.andThen(world.processRestarted, read(world))

const sourceFactory = (ending: SourceEnding) => (): SubscribedSource => subscribedSource(ending)

Feature('Letting go of a source subscription when the reader stops')
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A reader stopped at each step leaves nobody subscribed to the observable',
      Gherkin.Do.pipe(
        Given('an observable that keeps each reader subscribed until that reader lets go')(
          'make',
          () => Effect.succeed(sourceFactory('open')),
        ),
        When("Ada's reader takes one value and is stopped at each step of reading, one stop per run")(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: fromObservable,
              world: Effect.sync(() => s.make()),
              program: (world) => readingOne(world.source),
              restart: restartedAfter((world) => readingOne(world.source)),
              rule: nobodySubscribed,
              stopWithin: Duration.zero,
            }),
        ),
        Then('nobody is left subscribed after any stop')((s, expect) =>
          expect(s.checked, Conformance.render(s.checked)).toMatchObject({ _tag: 'Pass' })
        ),
      ),
    )

    scenario(
      'A reader stopped at each step of an observable that fails leaves nobody subscribed to it',
      Gherkin.Do.pipe(
        Given('an observable that hands every reader one value and then fails')(
          'make',
          () => Effect.succeed(sourceFactory('erroring')),
        ),
        When("Ada's reader drains the source up to its failure and is stopped at each step, one stop per run")(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: fromObservable,
              world: Effect.sync(() => s.make()),
              program: (world) => endingInAFailure(world.source),
              restart: restartedAfter((world) => endingInAFailure(world.source)),
              rule: nobodySubscribed,
              stopWithin: Duration.zero,
            }),
        ),
        Then('nobody is left subscribed after any stop')((s, expect) =>
          expect(s.checked, Conformance.render(s.checked)).toMatchObject({ _tag: 'Pass' })
        ),
      ),
    )

    scenario(
      'A reader stopped at each step of an observable that completes leaves nobody subscribed to it',
      Gherkin.Do.pipe(
        Given('an observable that hands every reader one value and then completes')(
          'make',
          () => Effect.succeed(sourceFactory('completing')),
        ),
        When("Ada's reader drains the source up to its completion and is stopped at each step, one stop per run")(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: fromObservable,
              world: Effect.sync(() => s.make()),
              program: (world) => endingInCompletion(world.source),
              restart: restartedAfter((world) => endingInCompletion(world.source)),
              rule: nobodySubscribed,
              stopWithin: Duration.zero,
            }),
        ),
        Then('nobody is left subscribed after any stop')((s, expect) =>
          expect(s.checked, Conformance.render(s.checked)).toMatchObject({ _tag: 'Pass' })
        ),
      ),
    )
  })
