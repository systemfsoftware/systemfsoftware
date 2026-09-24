import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Cause, Effect, Exit, Match, Schema, Stream } from 'effect'
import { UnknownError } from 'effect/Cause'
import type { Observable } from 'rxjs'

import { fromObservable } from '@systemfsoftware/rx-effect'

import { subscribedSource } from './__fixtures__/observable-release.model.js'

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

const stopsSearched = (report: Conformance.Report<never, never>): number =>
  Match.value(report).pipe(
    Match.tag('Pass', (passed) => passed.histories),
    Match.orElse(() => 0),
  )

Feature('Letting go of a source subscription when the reader stops')
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A reader stopped at each step leaves nobody subscribed to the observable',
      Gherkin.Do.pipe(
        Given('an observable that keeps each reader subscribed until that reader lets go')(
          'bridge',
          () => Effect.sync(() => subscribedSource()),
        ),
        When("Ada's reader takes one value and is stopped at each step of reading, one stop per run")(
          'checked',
          (s) => Conformance.released(readingOne(s.bridge.source), s.bridge.check),
        ),
        Then('nobody is left subscribed after any stop, and the seeded search tries at least one')((s, expect) =>
          expect({ report: s.checked, stops: stopsSearched(s.checked) }).toMatchObject({
            report: { _tag: 'Pass' },
            stops: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
      ),
    )

    scenario(
      'A reader stopped at each step of an observable that fails leaves nobody subscribed to it',
      Gherkin.Do.pipe(
        Given('an observable that hands every reader one value and then fails')(
          'bridge',
          () => Effect.sync(() => subscribedSource('erroring')),
        ),
        When("Ada's reader drains the source up to its failure and is stopped at each step, one stop per run")(
          'checked',
          (s) => Conformance.released(endingInAFailure(s.bridge.source), s.bridge.check),
        ),
        Then(
          "nobody is left subscribed after any stop, Ada's reader is handed the failure, and the seeded search tries at least one",
        )((s, expect) =>
          expect({ report: s.checked, stops: stopsSearched(s.checked) }).toMatchObject({
            report: { _tag: 'Pass' },
            stops: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
      ),
    )

    scenario(
      'A reader stopped at each step of an observable that completes leaves nobody subscribed to it',
      Gherkin.Do.pipe(
        Given('an observable that hands every reader one value and then completes')(
          'bridge',
          () => Effect.sync(() => subscribedSource('completing')),
        ),
        When("Ada's reader drains the source up to its completion and is stopped at each step, one stop per run")(
          'checked',
          (s) => Conformance.released(endingInCompletion(s.bridge.source), s.bridge.check),
        ),
        Then(
          "nobody is left subscribed after any stop, Ada's reader reaches the end, and the seeded search tries at least one",
        )((s, expect) =>
          expect({ report: s.checked, stops: stopsSearched(s.checked) }).toMatchObject({
            report: { _tag: 'Pass' },
            stops: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
      ),
    )
  })
