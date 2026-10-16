import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Deferred, Effect, Fiber } from 'effect'
import type { SavedBasket } from './__fixtures__/clerk-shelf.fixture.js'
import { Shelf, shelfLayer } from './__fixtures__/clerk-shelf.fixture.js'

const Feature = makeFeature({ it })

interface BellOrder {
  readonly bell: Deferred.Deferred<void>
  readonly first: SavedBasket
  readonly second: SavedBasket
}

const bellOrderOf = (): Effect.Effect<BellOrder> =>
  Effect.map(Deferred.make<void>(), (bell) => ({
    bell,
    first: { owner: 'the first clerk' },
    second: { owner: 'the second clerk' },
  }))
const shelveThenRing = (order: BellOrder): Effect.Effect<void, never, Shelf> =>
  Effect.gen(function*() {
    const shelf = yield* Shelf
    yield* shelf.place(order.first)
    yield* Deferred.complete(order.bell, Effect.void)
  })
const shelveAfterTheBell = (order: BellOrder): Effect.Effect<void, never, Shelf> =>
  Effect.gen(function*() {
    const shelf = yield* Shelf
    const waiter = yield* Effect.forkChild(
      Effect.andThen(Deferred.await(order.bell), shelf.place(order.second)),
    )
    yield* Fiber.join(waiter)
  })

Feature('A bell settles who shelves first')
  .withScenarioLayer(shelfLayer)
  .body(({ scenario }) => {
    scenario(
      'Two clerks shelve in bell order and the second basket is on top',
      Gherkin.Do.pipe(
        Given('a service bell and two full baskets')('order', () => bellOrderOf()),
        When('the first clerk shelves the first basket and rings the bell')(
          'firstShelved',
          (s) => shelveThenRing(s.order),
        ),
        When('the second clerk shelves after hearing the bell')('shelved', (s) => shelveAfterTheBell(s.order)),
        Then('the basket on top of the shelf is the second clerk’s')((_s, expect) =>
          Shelf.pipe(
            Effect.flatMap((shelf) => shelf.reopen),
            Effect.map((reopened) => expect(reopened.owner).toBe('the second clerk')),
          )
        ),
      ),
    )
  })
