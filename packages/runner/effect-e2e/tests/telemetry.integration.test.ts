import { Telemetry } from '@systemfsoftware/effect-e2e/run'
import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Tracer from 'effect/Tracer'

const Feature = makeFeature({ it })

const recordingTracer = (opened: Array<Tracer.NativeSpan>) =>
  Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      opened.push(span)
      return span
    },
  })

Feature('Staying silent when no collector is configured')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A failing step fails exactly as it would without telemetry',
      Gherkin.Do.pipe(
        Given('a step that fails, with and without the default sink')('exits', () =>
          Effect.gen(function*() {
            const telemetry = yield* Telemetry
            const failing: Effect.Effect<number, string> = Effect.fail('boom')
            const watched = telemetry.span('e2e.act', { 'e2e.test': 'login', 'e2e.step.index': 0 }, () => failing)
            return { bare: yield* Effect.exit(failing), watched: yield* Effect.exit(watched) }
          })),
        Then('both runs end with the same failure')((s, expect) => expect(s.exits.watched).toStrictEqual(s.exits.bare)),
      ),
    )

    scenario(
      'No trace is opened for a step the silent sink watches',
      Gherkin.Do.pipe(
        Given('a tracer that records every trace it is asked to open, and the default sink')(
          'opened',
          () =>
            Effect.gen(function*() {
              const opened: Array<Tracer.NativeSpan> = []
              const telemetry = yield* Telemetry
              yield* telemetry
                .span('e2e.act', { 'e2e.test': 'login' }, (span) =>
                  Effect.sync(() =>
                    span.set('e2e.cache.outcome', 'missed')
                  ))
                .pipe(Effect.withTracer(recordingTracer(opened)))
              return { count: opened.length }
            }),
        ),
        Then('the recorder was asked for nothing')((s, expect) => expect(s.opened.count).toBe(0)),
      ),
    )
  })
