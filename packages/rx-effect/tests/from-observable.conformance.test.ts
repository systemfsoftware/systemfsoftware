import { Conformance } from '@systemfsoftware/conformance-spec'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Match, Stream } from 'effect'
import { UnknownError } from 'effect/Cause'
import type { Observable } from 'rxjs'

import { fromObservable } from '@systemfsoftware/rx-effect'

import { subscribedSource } from './__fixtures__/observable-release.model.js'

const Feature = makeFeature({ it })

const readingOne = (source: Observable<number>): Effect.Effect<void, UnknownError> =>
  Stream.runDrain(fromObservable((error) => new UnknownError(error))(source).pipe(Stream.take(1)))

const passing = (report: Conformance.Report<never, never>): Conformance.Pass =>
  Match.value(report).pipe(
    Match.tag('Pass', (pass) => pass),
    Match.orElse(() => {
      throw new Error(`expected the check to pass, but it read: ${Conformance.render(report)}`)
    }),
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
        Then('nobody is left subscribed to the observable after any stop')((s) => {
          passing(s.checked)
        }),
        And('at least one stop was tried')((s) => {
          if (passing(s.checked).histories <= 0) {
            throw new Error('expected the check to have tried at least one stop')
          }
        }),
      ),
    )
  })
