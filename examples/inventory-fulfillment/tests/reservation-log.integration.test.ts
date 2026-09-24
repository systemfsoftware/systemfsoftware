import { Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Fulfillment, Persistence, Reservation } from '@systemfsoftware/example-inventory-fulfillment'
import { Effect, Result } from 'effect'
import { expect } from 'vitest'
import {
  acrossLogs,
  findOf,
  FIRST_ORDER,
  reservationLogWorld,
  type ReservationView,
  rollbackAuditOf,
  rollbackRowsOf,
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

const rollbackRecordedTwice: Effect.Effect<
  {
    readonly firstAccepted: boolean
    readonly secondAccepted: boolean
    readonly before: ReservationView
    readonly after: ReservationView
  },
  StoreUnavailable,
  Reservation.Log.ReservationLog
> = Effect.flatMap(Reservation.Log.ReservationLog, (log) =>
  Effect.gen(function*() {
    const before = yield* findOf(log, FIRST_ORDER)
    const firstAttempt = yield* Effect.result(
      log.appendRollback(rollbackAuditOf({ orderId: FIRST_ORDER, actorId: 'customer-one' })),
    )
    const secondAttempt = yield* Effect.result(
      log.appendRollback(rollbackAuditOf({ orderId: FIRST_ORDER, actorId: 'customer-one' })),
    )
    const after = yield* findOf(log, FIRST_ORDER)
    return {
      firstAccepted: Result.isSuccess(firstAttempt),
      secondAccepted: Result.isSuccess(secondAttempt),
      before,
      after,
    }
  }))

const rollbackLedgerAfterRecordingTwice = Effect.gen(function*() {
  const attempts = yield* Effect.provide(rollbackRecordedTwice, Reservation.Drizzle.layer)
  const db = yield* Persistence.DrizzleSession.DrizzleSession
  const entries = yield* rollbackRowsOf(db, FIRST_ORDER)
  return { attempts, entries }
})

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
          expect(s.answers.postgres.forward[0]).toEqual(s.answers.postgres.backward[1])
          expect(s.answers.postgres.forward[1]).toEqual(s.answers.postgres.backward[0])
          expect(s.answers.postgres.forward).toEqual(s.answers.memory.forward)
        }),
      ),
    )

    scenario(
      'A rollback recorded twice for one order is accepted and leaves the reservation alone',
      Gherkin.Do.pipe(
        Given('two orders with reservations in the log')('answers', () => acrossLogs(rollbackRecordedTwice)),
        Then('both recordings succeed and the reservation is exactly what it was')((s) => {
          expect(s.answers.memory.firstAccepted && s.answers.memory.secondAccepted).toBe(true)
          expect(s.answers.postgres.firstAccepted && s.answers.postgres.secondAccepted).toBe(true)
          expect(s.answers.memory.after).toEqual(s.answers.memory.before)
          expect(s.answers.postgres.after).toEqual(s.answers.postgres.before)
        }),
      ),
    )

    scenario(
      'A rollback recorded twice for one order leaves a single entry in the rollback ledger',
      Gherkin.Do.pipe(
        Given('two orders with reservations in the warehouse ledger')(
          'ledger',
          () => rollbackLedgerAfterRecordingTwice,
        ),
        Then('an auditor reading the ledger finds one rollback entry for the order')((s) => {
          expect(s.ledger.attempts.secondAccepted).toBe(true)
          expect(s.ledger.entries).toBe(1)
        }),
      ),
    )
  })
