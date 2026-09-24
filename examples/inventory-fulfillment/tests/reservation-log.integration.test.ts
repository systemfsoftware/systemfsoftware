import { Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Fulfillment, Reservation } from '@systemfsoftware/example-inventory-fulfillment'
import { Effect } from 'effect'
import { expect } from 'vitest'
import {
  acrossLogs,
  findOf,
  FIRST_ORDER,
  reservationLogWorld,
  type ReservationView,
  SECOND_ORDER,
  UNKNOWN_ORDER,
} from './__fixtures__/reservation-log.fixture.js'

const Feature = makeFeature({ it, layer })

type StoreUnavailable = Fulfillment.Decision.StoreUnavailable

const askedAboutEachOrder: Effect.Effect<
  {
    readonly first: ReservationView
    readonly second: ReservationView
    readonly missing: ReservationView
  },
  StoreUnavailable,
  Reservation.Log.ReservationLog
> = Effect.flatMap(Reservation.Log.ReservationLog, (log) =>
  Effect.gen(function*() {
    const first = yield* findOf(log, FIRST_ORDER)
    const second = yield* findOf(log, SECOND_ORDER)
    const missing = yield* findOf(log, UNKNOWN_ORDER)
    return { first, second, missing }
  }))

const askedTwiceAboutOneOrder: Effect.Effect<
  { readonly first: ReservationView; readonly second: ReservationView },
  StoreUnavailable,
  Reservation.Log.ReservationLog
> = Effect.flatMap(Reservation.Log.ReservationLog, (log) =>
  Effect.gen(function*() {
    const first = yield* findOf(log, FIRST_ORDER)
    const second = yield* findOf(log, FIRST_ORDER)
    return { first, second }
  }))

const askedInBothOrders: Effect.Effect<
  {
    readonly forward: readonly [ReservationView, ReservationView]
    readonly backward: readonly [ReservationView, ReservationView]
  },
  StoreUnavailable,
  Reservation.Log.ReservationLog
> = Effect.flatMap(Reservation.Log.ReservationLog, (log) =>
  Effect.gen(function*() {
    const forward = yield* Effect.all([findOf(log, FIRST_ORDER), findOf(log, SECOND_ORDER)])
    const backward = yield* Effect.all([findOf(log, SECOND_ORDER), findOf(log, FIRST_ORDER)])
    return { forward, backward }
  }))

Feature('The reservation log keeps its word in memory and in Postgres')
  .withScenarioLayer(reservationLogWorld)
  .body(({ scenario }) => {
    scenario(
      'A reservation the log holds is found by its order',
      Gherkin.Do.pipe(
        Given('two orders with reservations in the log')('answers', () => acrossLogs(askedAboutEachOrder)),
        Then('each written order comes back with its allocations and a missing order comes back empty')((s) => {
          expect(s.answers.memory.first).toEqual({
            found: true,
            orderId: FIRST_ORDER,
            customerId: 'customer-one',
            allocations: [
              { warehouseId: 'warehouse-central', lotId: 'lot-kettle-a', sku: 'sku-kettle', quantity: 2 },
              { warehouseId: 'warehouse-central', lotId: 'lot-teapot-a', sku: 'sku-teapot', quantity: 1 },
            ],
            occurredAtMillis: Date.parse('2026-01-01T00:00:00.000Z'),
          })
          expect(s.answers.memory.second).toEqual({
            found: true,
            orderId: SECOND_ORDER,
            customerId: 'customer-two',
            allocations: [{ warehouseId: 'warehouse-north', lotId: 'lot-mug-a', sku: 'sku-mug', quantity: 3 }],
            occurredAtMillis: Date.parse('2026-01-01T00:00:00.000Z'),
          })
          expect(s.answers.memory.missing.found).toBe(false)
          expect(s.answers.postgres).toEqual(s.answers.memory)
        }),
      ),
    )

    scenario(
      'Asking the log twice about the same order changes nothing',
      Gherkin.Do.pipe(
        Given('two orders with reservations in the log')('answers', () => acrossLogs(askedTwiceAboutOneOrder)),
        Then('both answers are the same reservation')((s) => {
          expect(s.answers.memory.first).toEqual(s.answers.memory.second)
          expect(s.answers.postgres.first).toEqual(s.answers.postgres.second)
          expect(s.answers.postgres.first).toEqual(s.answers.memory.first)
        }),
      ),
    )

    scenario(
      'Orders that share nothing can be asked about in either order',
      Gherkin.Do.pipe(
        Given('two orders with reservations in the log')('answers', () => acrossLogs(askedInBothOrders)),
        Then('the answers come back the same whichever order was asked')((s) => {
          expect(s.answers.memory.forward[0]).toEqual(s.answers.memory.backward[1])
          expect(s.answers.memory.forward[1]).toEqual(s.answers.memory.backward[0])
          expect(s.answers.postgres.forward).toEqual(s.answers.memory.forward)
          expect(s.answers.postgres.backward).toEqual(s.answers.memory.backward)
        }),
      ),
    )
  })
