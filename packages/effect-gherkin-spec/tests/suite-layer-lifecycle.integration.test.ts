import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer } from 'effect'
import { afterAll, expect } from 'vitest'

interface SharedSession {
  readonly openCount: Effect.Effect<number>
}

class SharedSessionStore extends Context.Service<SharedSessionStore, SharedSession>()(
  '@systemfsoftware/effect-gherkin-spec/tests/fixtures/SharedSessionStore',
) {}

const acquisitions = { opened: 0, closed: 0 }

const sharedSessionLayer = Layer.effect(
  SharedSessionStore,
  Effect.acquireRelease(
    Effect.sync(() => {
      acquisitions.opened += 1
      return { openCount: Effect.sync(() => acquisitions.opened) }
    }),
    () =>
      Effect.sync(() => {
        acquisitions.closed += 1
      }),
  ),
)

const Feature = makeFeature({ it, layer })

Feature('A shared suite fixture is opened once for the whole suite')
  .withLayer(sharedSessionLayer)
  .body(({ scenario }) => {
    scenario(
      'The first scenario of the suite sees a single open',
      Gherkin.Do.pipe(
        Given('a shared session store for the suite')('store', () => SharedSessionStore),
        When('the first scenario reads how many times the store was opened')((s) =>
          Effect.gen(function*() {
            expect(yield* s.store.openCount).toBe(1)
          })
        ),
        Then('the store remains open while the suite is still running')(() =>
          Effect.sync(() => {
            expect(acquisitions.closed).toBe(0)
          })
        ),
      ),
    )

    scenario(
      'A later scenario of the suite still sees that single open',
      Gherkin.Do.pipe(
        Given('the same shared session store for the suite')('store', () => SharedSessionStore),
        When('a later scenario reads how many times the store was opened')((s) =>
          Effect.gen(function*() {
            expect(yield* s.store.openCount).toBe(1)
          })
        ),
        Then('the store is still open for the running suite')(() =>
          Effect.sync(() => {
            expect(acquisitions.closed).toBe(0)
          })
        ),
      ),
    )
  })

afterAll(() => {
  expect(acquisitions.opened).toBe(1)
  expect(acquisitions.closed).toBe(1)
})
