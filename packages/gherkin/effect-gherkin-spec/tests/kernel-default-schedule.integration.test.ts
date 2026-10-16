import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { KernelCase, TaskRef } from '@systemfsoftware/effect-spec-runtime'
import { Clock, Duration, Effect, Fiber, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import { Shelf, shelfLayer } from './__fixtures__/clerk-shelf.fixture.js'

const Feature = makeFeature({ it })

const CLOSING_TIME = Duration.seconds(1000)
const CLOSING_MILLIS = 1_000_000

Feature('A checkout opens under the shop clock')
  .withScenarioLayer(shelfLayer)
  .body(({ scenario }) => {
    scenario(
      'A shopper opens a fresh checkout at the start of the trading day',
      Gherkin.Do.pipe(
        Given('a fresh basket on the counter')('basket', () => Effect.succeed({ owner: 'the visiting shopper' })),
        When('the clerk opens the basket onto the shelf')(
          'opened',
          (s) => Effect.flatMap(Shelf, (shelf) => Effect.as(shelf.place(s.basket), s.basket)),
        ),
        Then('the shelf reopens the same shopper and the shop clock still reads the start of the day')((s, expect) =>
          Effect.gen(function*() {
            const shelf = yield* Shelf
            const reopened = yield* shelf.reopen
            const now = yield* Clock.currentTimeMillis
            return { reopened: reopened.owner, opened: s.opened.owner, now }
          }).pipe(
            Effect.map((observation) =>
              expect(observation).toEqual({
                reopened: 'the visiting shopper',
                opened: 'the visiting shopper',
                now: 0,
              })
            ),
          )
        ),
      ),
    )

    scenario(
      'A worker who naps until closing time wakes when the shop clock moves',
      Gherkin.Do.pipe(
        Given('a ledger the worker writes after their nap')('ledger', () => Ref.make('asleep')),
        When('the shop clock is moved to closing time')('closing', (s) =>
          Effect.gen(function*() {
            const worker = yield* Effect.forkChild(
              Effect.andThen(Effect.sleep(CLOSING_TIME), Ref.set(s.ledger, 'woke')),
            )
            yield* TestClock.adjust(CLOSING_TIME)
            yield* Fiber.join(worker)
            return yield* Clock.currentTimeMillis
          })),
        Then('the worker has woken and the shop clock reads closing time')((s, expect) =>
          Ref.get(s.ledger).pipe(
            Effect.map((state) =>
              expect({ state, closing: s.closing }).toEqual({ state: 'woke', closing: CLOSING_MILLIS })
            ),
          )
        ),
      ),
    )

    scenario(
      'The front desk reads the real wall clock instead of the shop clock',
      { live: 'the front desk reads the real wall clock, which the shop clock cannot move' },
      Gherkin.Do.pipe(
        Given('a front desk that reports the wall clock outside the shop')(
          'frontDesk',
          () => Effect.succeed({ readTime: Clock.currentTimeMillis }),
        ),
        When('the front desk reads the time')('now', (s) => s.frontDesk.readTime),
        Then('the reading is a real date, not the start of the trading day')((s, expect) =>
          expect(s.now).toBeGreaterThan(CLOSING_MILLIS)
        ),
      ),
    )

    scenario(
      'A live case is announced once with the reason it stays on the wall clock',
      { live: 'the announcement is recorded once, so replaying it per schedule would duplicate it' },
      Gherkin.Do.pipe(
        Given('a notebook the run report writes into')('notebook', () => {
          const entries: Array<string> = []
          return Effect.succeed({
            record: (message: string) => {
              entries.push(message)
            },
            entries,
          })
        }),
        When('the case announces why it stays on the wall clock')((s) =>
          Effect.provideService(
            KernelCase.announceLive(
              'the announcement is recorded once, so replaying it per schedule would duplicate it',
            ),
            TaskRef.RawVitestTaskRef,
            { annotate: s.notebook.record },
          )
        ),
        Then('the notebook holds the announcement once')((s, expect) =>
          expect(s.notebook.entries).toEqual([
            'live case: the announcement is recorded once, so replaying it per schedule would duplicate it',
          ])
        ),
      ),
    )
  })
