import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Fulfillment, Reservation } from '@systemfsoftware/example-inventory-fulfillment'
import { Effect } from 'effect'
import {
  acrossLogs,
  findOf,
  FIRST_ORDER,
  reservationLogWorld,
  type ReservationView,
  SECOND_ORDER,
  UNKNOWN_ORDER,
} from './__fixtures__/reservation-log.fixture.js'

const Feature = makeFeature({ it })

type StoreUnavailable = Fulfillment.Decision.StoreUnavailable

const OCCURRED_AT_MILLIS = Date.parse('2026-01-01T00:00:00.000Z')

const FIRST_VIEW: ReservationView = {
  found: true,
  orderId: FIRST_ORDER,
  customerId: 'customer-one',
  allocations: [
    { warehouseId: 'warehouse-central', lotId: 'lot-kettle-a', sku: 'sku-kettle', quantity: 2 },
    { warehouseId: 'warehouse-central', lotId: 'lot-teapot-a', sku: 'sku-teapot', quantity: 1 },
  ],
  occurredAtMillis: OCCURRED_AT_MILLIS,
}

const SECOND_VIEW: ReservationView = {
  found: true,
  orderId: SECOND_ORDER,
  customerId: 'customer-two',
  allocations: [{ warehouseId: 'warehouse-north', lotId: 'lot-mug-a', sku: 'sku-mug', quantity: 3 }],
  occurredAtMillis: OCCURRED_AT_MILLIS,
}

const ABSENT_VIEW: ReservationView = {
  found: false,
  orderId: '',
  customerId: '',
  allocations: [],
  occurredAtMillis: 0,
}

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

Feature('The reservation log keeps its word in memory and in Postgres', { timeout: 120_000 })
  .withScenarioLayer(reservationLogWorld)
  .live('the Postgres side runs through in-process PGlite, whose file reads the simulation kernel cannot observe')
  .body(({ scenario }) => {
    scenario(
      'A reservation the log holds is found by its order',
      Gherkin.Do.pipe(
        Given('two orders with reservations in the log')('answers', () => acrossLogs(askedAboutEachOrder)),
        Then('each written order comes back with its allocations and a missing order comes back empty')((s, expect) =>
          expect(s.answers).toEqual({
            memory: { first: FIRST_VIEW, second: SECOND_VIEW, missing: ABSENT_VIEW },
            postgres: { first: FIRST_VIEW, second: SECOND_VIEW, missing: ABSENT_VIEW },
          })
        ),
      ),
    )

    scenario(
      'Asking the log twice about the same order changes nothing',
      Gherkin.Do.pipe(
        Given('two orders with reservations in the log')('answers', () => acrossLogs(askedTwiceAboutOneOrder)),
        Then('both answers are the same reservation')((s, expect) =>
          expect(s.answers).toEqual({
            memory: { first: FIRST_VIEW, second: FIRST_VIEW },
            postgres: { first: FIRST_VIEW, second: FIRST_VIEW },
          })
        ),
      ),
    )

    scenario(
      'Orders that share nothing can be asked about in either order',
      Gherkin.Do.pipe(
        Given('two orders with reservations in the log')('answers', () => acrossLogs(askedInBothOrders)),
        Then('the answers come back the same whichever order was asked')((s, expect) =>
          expect(s.answers).toEqual({
            memory: { forward: [FIRST_VIEW, SECOND_VIEW], backward: [SECOND_VIEW, FIRST_VIEW] },
            postgres: { forward: [FIRST_VIEW, SECOND_VIEW], backward: [SECOND_VIEW, FIRST_VIEW] },
          })
        ),
      ),
    )
  })
