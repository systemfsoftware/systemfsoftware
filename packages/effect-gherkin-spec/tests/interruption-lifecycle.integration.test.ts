import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Ref } from 'effect'

const Feature = makeFeature({ it })

Feature('Step lifecycle finalizers and fiber supervision')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Scoped resource finalizers run in reverse order upon step failure',
      Gherkin.Do.pipe(
        Given('a scoped pipeline whose downstream step fails catastrophically')(
          'observed',
          () =>
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
              const history = yield* Ref.get(finalizerLog)
              return { outcome: exit._tag, history }
            }),
        ),
        Then('the run failed and both handles were released newest first')((s, expect) =>
          expect(s.observed).toEqual({
            outcome: 'Failure',
            history: ['acquired:db', 'acquired:tx', 'released:tx', 'released:db'],
          })
        ),
      ),
    )
  })
