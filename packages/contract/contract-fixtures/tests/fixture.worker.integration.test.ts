import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { bundle, Harness, type HarnessOptions, type HarnessShape, layer } from '@systemfsoftware/effect-workerd-harness'
import { Effect, Layer, Schema } from 'effect'

const Feature = makeFeature({ it })

const worker = await Effect.runPromise(
  Effect.orDie(bundle(new URL('../src/fixture.worker.ts', import.meta.url).pathname)),
)

const options: HarnessOptions = { worker }

const withHarness = <A, E>(program: (harness: HarnessShape) => Effect.Effect<A, E, Harness>) =>
  Effect.scoped(
    Effect.gen(function*() {
      const harness = yield* Harness
      return yield* program(harness)
    }).pipe(Effect.provide(layer(options))),
  )

Feature('Serving the contract fixture Worker')
  .withScenarioLayer(Layer.empty)
  .live('a real workerd runtime bundles the fixture Worker and serves its health route')
  .body(({ scenario }) => {
    scenario(
      'the health route answers with every capability the registry builds',
      Gherkin.Do.pipe(
        When('the health route is fetched from the running Worker')(
          'health',
          () =>
            withHarness((harness) =>
              Effect.gen(function*() {
                const response = yield* harness.dispatchFetch('http://fixture/health')
                const text = yield* Effect.promise(() => response.text())
                return yield* Schema.decodeEffect(
                  Schema.fromJsonString(
                    Schema.Struct({ ok: Schema.Boolean, capabilities: Schema.Array(Schema.String) }),
                  ),
                )(text)
              })
            ),
        ),
        Then('the answer names every fixture capability and the built-in read capability')((scope, expect) =>
          expect(scope.health).toEqual({
            ok: true,
            capabilities: [
              'getBalance',
              'ping',
              'topUp',
              'runProgram',
              'quoteRate',
              'hold',
              'confirmHold',
              'transfer',
              'getStatement',
              'getOperation',
            ],
          })
        ),
      ),
    )
  })
