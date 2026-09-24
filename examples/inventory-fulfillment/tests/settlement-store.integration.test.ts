import { Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Persistence, Settlement } from '@systemfsoftware/example-inventory-fulfillment'
import { Cause, Effect, Exit, Option, Ref, Result, Schema as S } from 'effect'
import { expect } from 'vitest'
import { StoreUnavailable } from '../src/fulfillment/decision.schema.js'
import {
  acrossStores,
  armSeamAlways,
  armSeamOnce,
  auditsOf,
  disarmSeam,
  exhaustedBudget,
  FIRST_CUSTOMER,
  FIRST_LOT,
  FIRST_SKU,
  keyOf,
  lotQuantityOf,
  outstandingOf,
  planOf,
  reservationsOf,
  resetPostgres,
  SECOND_CUSTOMER,
  SECOND_LOT,
  SECOND_SKU,
  settleInUnit,
  settlementStoreWorld,
  snapshotInUnit,
} from './__fixtures__/settlement-store.fixture.js'
import type { OrderInput } from './__fixtures__/settlement-store.fixture.js'

const Feature = makeFeature({ it, layer })

type SettlementStore = Settlement.Store.SettlementStore
type OrderSnapshot = Settlement.Unit.OrderSnapshot

const FIRST_ORDER: OrderInput = {
  orderId: 'order-first',
  customerId: FIRST_CUSTOMER,
  sku: FIRST_SKU,
  lotId: FIRST_LOT,
  quantity: 3,
  charge: 9,
}

const SECOND_ORDER: OrderInput = {
  orderId: 'order-second',
  customerId: SECOND_CUSTOMER,
  sku: SECOND_SKU,
  lotId: SECOND_LOT,
  quantity: 5,
  charge: 8,
}

const FIRST_ORDER_FREE: OrderInput = { ...FIRST_ORDER, charge: undefined }

const balanceOf = (snapshot: OrderSnapshot): number => snapshot.account.outstandingBalance

const chargeAndReread = (
  store: Settlement.Store.SettlementStoreService,
  input: OrderInput,
): Effect.Effect<
  { readonly outstandingBalance: number; readonly lotQuantity: number; readonly owner: Option.Option<string> },
  Settlement.Unit.SettlementFailure
> =>
  Effect.gen(function*() {
    yield* settleInUnit(store, input)
    const after = yield* snapshotInUnit(store, input)
    return {
      outstandingBalance: balanceOf(after),
      lotQuantity: lotQuantityOf(after.stock, input.lotId),
      owner: after.reservedBy,
    }
  })

const readAfterWrite = Effect.flatMap(Settlement.Store.SettlementStore, (store) => chargeAndReread(store, FIRST_ORDER))

const settleWithoutCharge = Effect.flatMap(Settlement.Store.SettlementStore, (store) =>
  Effect.gen(function*() {
    yield* settleInUnit(store, FIRST_ORDER_FREE)
    const after = yield* snapshotInUnit(store, FIRST_ORDER_FREE)
    return {
      outstandingBalance: balanceOf(after),
      lotQuantity: lotQuantityOf(after.stock, FIRST_LOT),
    }
  }))

const repeatedRead = Effect.flatMap(Settlement.Store.SettlementStore, (store) =>
  Effect.gen(function*() {
    const settled = yield* store.unitOfWork((unit) =>
      Effect.gen(function*() {
        const first = yield* Settlement.Unit.load(unit, keyOf(FIRST_ORDER))
        const second = yield* Settlement.Unit.load(unit, keyOf(FIRST_ORDER))
        return { first, second }
      })
    )
    const after = yield* snapshotInUnit(store, FIRST_ORDER)
    return { ...settled, after }
  }))

interface FullState {
  readonly outstandingOne: number
  readonly outstandingTwo: number
  readonly quantityOne: number
  readonly quantityTwo: number
}

const fullState = (
  store: Settlement.Store.SettlementStoreService,
): Effect.Effect<FullState, Settlement.Unit.SettlementFailure> =>
  Effect.gen(function*() {
    const one = yield* snapshotInUnit(store, { ...FIRST_ORDER, orderId: 'order-probe-one' })
    const two = yield* snapshotInUnit(store, { ...SECOND_ORDER, orderId: 'order-probe-two' })
    return {
      outstandingOne: balanceOf(one),
      outstandingTwo: balanceOf(two),
      quantityOne: lotQuantityOf(one.stock, FIRST_LOT),
      quantityTwo: lotQuantityOf(two.stock, SECOND_LOT),
    }
  })

const committedFinalState = (
  first: OrderInput,
  second: OrderInput,
): Effect.Effect<FullState, Settlement.Unit.SettlementFailure, SettlementStore> =>
  Effect.flatMap(Settlement.Store.SettlementStore, (store) =>
    Effect.gen(function*() {
      yield* settleInUnit(store, first)
      yield* settleInUnit(store, second)
      return yield* fullState(store)
    }))

const refusedSecondSettle = Effect.flatMap(Settlement.Store.SettlementStore, (store) =>
  Effect.gen(function*() {
    yield* settleInUnit(store, FIRST_ORDER)
    const second = yield* Effect.result(settleInUnit(store, { ...FIRST_ORDER, quantity: 1, charge: 1 }))
    const after = yield* snapshotInUnit(store, FIRST_ORDER)
    return {
      refused: Result.isFailure(second),
      outstandingBalance: balanceOf(after),
      lotQuantity: lotQuantityOf(after.stock, FIRST_LOT),
      owner: after.reservedBy,
    }
  }))

const failedUnitWritesNothing = Effect.flatMap(Settlement.Store.SettlementStore, (store) =>
  Effect.gen(function*() {
    const failed = yield* Effect.result(
      store.unitOfWork((unit) =>
        Effect.gen(function*() {
          yield* Settlement.Unit.load(unit, keyOf(FIRST_ORDER))
          yield* Settlement.Unit.settle(unit, planOf(FIRST_ORDER))
          return yield* Effect.fail('a business refusal after the settle')
        })
      ),
    )
    const afterFailure = yield* snapshotInUnit(store, FIRST_ORDER)
    const rerun = yield* Effect.result(settleInUnit(store, FIRST_ORDER))
    const afterRerun = yield* snapshotInUnit(store, FIRST_ORDER)
    return {
      failed: Result.isFailure(failed),
      pristineBalance: balanceOf(afterFailure),
      pristineLot: lotQuantityOf(afterFailure.stock, FIRST_LOT),
      rerunCommitted: Result.isSuccess(rerun),
      finalBalance: balanceOf(afterRerun),
      finalLot: lotQuantityOf(afterRerun.stock, FIRST_LOT),
      owner: afterRerun.reservedBy,
    }
  }))

const contendedMemorySeed = (): Settlement.Store.SettlementStoreSeed => ({
  warehouses: [{ warehouseId: 'warehouse-central', region: 'central' }],
  lots: [
    { lotId: FIRST_LOT, sku: FIRST_SKU, warehouseId: 'warehouse-central', quantityOnHand: 100, version: 1 },
  ],
  customers: [
    {
      customerId: FIRST_CUSTOMER,
      tier: 'Standard',
      creditLimit: 100,
      outstandingBalance: 0,
      overdraftPrivilege: 0,
    },
  ],
})

const contendedCharge = Effect.flatMap(Settlement.Store.SettlementStore, (store) =>
  Effect.gen(function*() {
    const attempt = (orderId: string) =>
      store.unitOfWork((unit) =>
        Effect.gen(function*() {
          const snapshot = yield* Settlement.Unit.load(unit, { orderId, customerId: FIRST_CUSTOMER, skus: [FIRST_SKU] })
          const headroom = snapshot.account.creditLimit - snapshot.account.outstandingBalance
          const granted = headroom >= 60
          const input: OrderInput = {
            orderId,
            customerId: FIRST_CUSTOMER,
            sku: FIRST_SKU,
            lotId: FIRST_LOT,
            quantity: 60,
            charge: granted ? 60 : undefined,
          }
          const settled = granted ? planOf(input) : { ...planOf(input), events: [] }
          yield* Settlement.Unit.settle(unit, settled)
          return granted
        })
      )
    const [first, second] = yield* Effect.all([attempt('order-contend-a'), attempt('order-contend-b')], {
      concurrency: 'unbounded',
    })
    const after = yield* snapshotInUnit(store, { ...FIRST_ORDER, orderId: 'order-probe' })
    return {
      first,
      second,
      outstandingBalance: balanceOf(after),
      lotQuantity: lotQuantityOf(after.stock, FIRST_LOT),
    }
  }))

const retriedOnce = Effect.gen(function*() {
  yield* resetPostgres
  const store = yield* Settlement.Store.SettlementStore
  const db = yield* Persistence.DrizzleSession.DrizzleSession
  yield* armSeamOnce
  const attempts = yield* Ref.make(0)
  const settled = yield* Effect.result(
    store.unitOfWork((unit) =>
      Effect.gen(function*() {
        yield* Ref.update(attempts, (count) => count + 1)
        yield* Effect.flatMap(
          Settlement.Unit.load(unit, keyOf(FIRST_ORDER)),
          () => Settlement.Unit.settle(unit, planOf(FIRST_ORDER)),
        )
      })
    ),
  )
  const tries = yield* Ref.get(attempts)
  yield* disarmSeam
  const outstandingBalance = yield* outstandingOf(db, FIRST_CUSTOMER)
  const reservationCount = yield* reservationsOf(db, FIRST_ORDER.orderId)
  const auditCount = yield* auditsOf(db, FIRST_ORDER.orderId)
  return {
    committed: Result.isSuccess(settled),
    tries,
    outstandingBalance,
    reservationCount,
    auditCount,
  }
})
const exhaustedBudgetFails = Effect.gen(function*() {
  yield* resetPostgres
  const store = yield* Settlement.Store.SettlementStore
  const db = yield* Persistence.DrizzleSession.DrizzleSession
  yield* armSeamAlways
  const attempts = yield* Ref.make(0)
  const settled = yield* Effect.result(
    store.unitOfWork((unit) =>
      Effect.gen(function*() {
        yield* Ref.update(attempts, (count) => count + 1)
        yield* Effect.flatMap(
          Settlement.Unit.load(unit, { ...keyOf(FIRST_ORDER), orderId: 'order-exhausted' }),
          () => Settlement.Unit.settle(unit, planOf({ ...FIRST_ORDER, orderId: 'order-exhausted' })),
        )
      })
    ),
  )
  const tries = yield* Ref.get(attempts)
  yield* disarmSeam
  const outstandingBalance = yield* outstandingOf(db, FIRST_CUSTOMER)
  const reservationCount = yield* reservationsOf(db, 'order-exhausted')
  const auditCount = yield* auditsOf(db, 'order-exhausted')
  return { settled, tries, outstandingBalance, reservationCount, auditCount }
})

const checkedWrite = Effect.gen(function*() {
  yield* resetPostgres
  const store = yield* Settlement.Store.SettlementStore
  const db = yield* Persistence.DrizzleSession.DrizzleSession
  const attempts = yield* Ref.make(0)
  const settled = yield* Effect.result(
    store.unitOfWork((unit) =>
      Effect.gen(function*() {
        yield* Ref.update(attempts, (count) => count + 1)
        yield* Effect.flatMap(
          Settlement.Unit.load(unit, { ...keyOf(FIRST_ORDER), orderId: 'order-overdraw' }),
          () =>
            Settlement.Unit.settle(
              unit,
              planOf({ ...FIRST_ORDER, orderId: 'order-overdraw', quantity: 20, charge: 20 }),
            ),
        )
      })
    ),
  )
  const tries = yield* Ref.get(attempts)
  const outstandingBalance = yield* outstandingOf(db, FIRST_CUSTOMER)
  return { settled, tries, outstandingBalance }
})

const keptUnitAfterItsEnd = Effect.flatMap(Settlement.Store.SettlementStore, (store) =>
  Effect.gen(function*() {
    const kept = yield* store.unitOfWork((unit) => Effect.succeed(unit))
    const readExit = yield* Effect.exit(Settlement.Unit.load(kept, keyOf(FIRST_ORDER)))
    const settleExit = yield* Effect.exit(Settlement.Unit.settle(kept, planOf(FIRST_ORDER)))
    const after = yield* snapshotInUnit(store, FIRST_ORDER)
    return {
      readDefects: Exit.isFailure(readExit) ? Cause.prettyErrors(readExit.cause) : [],
      settleDefects: Exit.isFailure(settleExit) ? Cause.prettyErrors(settleExit.cause) : [],
      outstandingBalance: balanceOf(after),
      lotQuantity: lotQuantityOf(after.stock, FIRST_LOT),
    }
  }))

const endedUnit = 'a SettlementUnit was used after its unit of work ended'

const markerOf = (defects: ReadonlyArray<Error>): ReadonlyArray<string> => defects.map((defect) => defect.message)

Feature('Settlement stores keep their promises in memory and in Postgres')
  .withScenarioLayer(settlementStoreWorld)
  .liveClock()
  .body(({ scenario }) => {
    scenario(
      'A settlement that commits is visible to the next read',
      Gherkin.Do.pipe(
        Given('two customers with clean accounts and a stocked warehouse')(
          'outcome',
          () => acrossStores(readAfterWrite),
        ),
        Then('the charge, the new balance, the moved stock and the owner show up, either way')((s) => {
          const expected = {
            outstandingBalance: 9,
            lotQuantity: 7,
            owner: Option.some(FIRST_CUSTOMER),
          }
          expect(s.outcome.memory).toEqual(expected)
          expect(s.outcome.postgres).toEqual(expected)
        }),
      ),
    )

    scenario(
      'A reservation without a charge moves stock but leaves the account alone',
      Gherkin.Do.pipe(
        Given('two customers with clean accounts and a stocked warehouse')(
          'outcome',
          () => acrossStores(settleWithoutCharge),
        ),
        Then('the stock moves while the account balance stays put, either way')((s) => {
          const expected = { outstandingBalance: 0, lotQuantity: 7 }
          expect(s.outcome.memory).toEqual(expected)
          expect(s.outcome.postgres).toEqual(expected)
        }),
      ),
    )

    scenario(
      'Reading twice does not move anything',
      Gherkin.Do.pipe(
        Given('two customers with clean accounts and a stocked warehouse')('outcome', () => acrossStores(repeatedRead)),
        Then('both reads see the same account and the same stock')((s) => {
          expect(s.outcome.memory.second).toEqual(s.outcome.memory.first)
          expect(s.outcome.postgres.second).toEqual(s.outcome.postgres.first)
          expect(s.outcome.postgres.after).toEqual(s.outcome.memory.after)
        }),
      ),
    )

    scenario(
      'Settlements for different customers end in the same state either way',
      Gherkin.Do.pipe(
        Given('two customers with clean accounts and a stocked warehouse')('outcome', () =>
          Effect.gen(function*() {
            const forward = yield* acrossStores(committedFinalState(FIRST_ORDER, SECOND_ORDER))
            const backward = yield* acrossStores(committedFinalState(SECOND_ORDER, FIRST_ORDER))
            return { forward, backward }
          })),
        Then('both stores end in the same state whichever settlement commits first')((s) => {
          expect(s.outcome.forward).toEqual(s.outcome.backward)
        }),
      ),
    )

    scenario(
      'Settling twice for one order is refused the second time',
      Gherkin.Do.pipe(
        Given('two customers with clean accounts and a stocked warehouse')(
          'outcome',
          () => acrossStores(refusedSecondSettle),
        ),
        Then('the second settle fails and the first settlement still stands, either way')((s) => {
          const expected = {
            refused: true,
            outstandingBalance: 9,
            lotQuantity: 7,
            owner: Option.some(FIRST_CUSTOMER),
          }
          expect(s.outcome.memory).toEqual(expected)
          expect(s.outcome.postgres).toEqual(expected)
        }),
      ),
    )

    scenario(
      'A unit that fails after its settle writes nothing and can run again',
      Gherkin.Do.pipe(
        Given('two customers with clean accounts and a stocked warehouse')(
          'outcome',
          () => acrossStores(failedUnitWritesNothing),
        ),
        Then('the failed unit leaves the account and the stock alone, and the rerun commits once')((s) => {
          const expected = {
            failed: true,
            pristineBalance: 0,
            pristineLot: 10,
            rerunCommitted: true,
            finalBalance: 9,
            finalLot: 7,
            owner: Option.some(FIRST_CUSTOMER),
          }
          expect(s.outcome.memory).toEqual(expected)
          expect(s.outcome.postgres).toEqual(expected)
        }),
      ),
    )

    scenario(
      'Two concurrent units for one customer leave exactly one charge',
      Gherkin.Do.pipe(
        Given('a customer whose headroom fits one of two concurrent orders')(
          'outcome',
          () => Effect.provide(contendedCharge, Settlement.Memory.layer(contendedMemorySeed())),
        ),
        Then('exactly one order charges and the other settles without one')((s) => {
          expect([s.outcome.first, s.outcome.second].filter((charged) => charged)).toHaveLength(1)
          expect(s.outcome.outstandingBalance).toBe(60)
          expect(s.outcome.lotQuantity).toBe(40)
        }),
      ),
    )

    scenario(
      'A serialization failure re-runs the unit from its first read',
      Gherkin.Do.pipe(
        Given('a unit whose first settle hits an engine-raised serialization failure')(
          'outcome',
          () => Effect.provide(retriedOnce, Settlement.Drizzle.layer(exhaustedBudget)),
        ),
        Then('the unit commits exactly once: one charge, one reservation, one audit row')((s) => {
          expect(s.outcome.committed).toBe(true)
          expect(s.outcome.tries).toBe(2)
          expect(s.outcome.outstandingBalance).toBe(9)
          expect(s.outcome.reservationCount).toBe(1)
          expect(s.outcome.auditCount).toBe(1)
        }),
      ),
    )

    scenario(
      'A unit that fails on every attempt reports the store as unavailable',
      Gherkin.Do.pipe(
        Given('a unit that hits a serialization failure on every attempt, with a budget of three')(
          'outcome',
          () => Effect.provide(exhaustedBudgetFails, Settlement.Drizzle.layer(exhaustedBudget)),
        ),
        Then('the order fails as unavailable naming the serialization failure, having written nothing')((s) => {
          expect(Result.isFailure(s.outcome.settled)).toBe(true)
          const failure = Result.isFailure(s.outcome.settled) ? s.outcome.settled.failure : undefined
          expect(S.is(StoreUnavailable)(failure)).toBe(true)
          const states = failure === undefined
            ? []
            : Settlement.Drizzle.sqlStatesOf(failure)
          expect(states).toContain('40001')
          expect(s.outcome.tries).toBe(3)
          expect(s.outcome.outstandingBalance).toBe(0)
          expect(s.outcome.reservationCount).toBe(0)
          expect(s.outcome.auditCount).toBe(0)
        }),
      ),
    )

    scenario(
      'A settle that breaks the stock backstop is not retried',
      Gherkin.Do.pipe(
        Given('a settle that would drive a lot below zero')(
          'outcome',
          () => Effect.provide(checkedWrite, Settlement.Drizzle.layer(exhaustedBudget)),
        ),
        Then('the unit fails as unavailable on its first attempt and the stock is untouched')((s) => {
          expect(Result.isFailure(s.outcome.settled)).toBe(true)
          const failure = Result.isFailure(s.outcome.settled) ? s.outcome.settled.failure : undefined
          expect(S.is(StoreUnavailable)(failure)).toBe(true)
          expect(s.outcome.tries).toBe(1)
          expect(s.outcome.outstandingBalance).toBe(0)
        }),
      ),
    )

    scenario(
      'A unit of work kept past its end cannot read or settle again',
      Gherkin.Do.pipe(
        Given('a unit of work that ended while its caller kept hold of it')(
          'outcome',
          () => acrossStores(keptUnitAfterItsEnd),
        ),
        Then('reading and settling through it both stop before touching the store, and nothing is written')((s) => {
          expect(markerOf(s.outcome.memory.readDefects)).toContain(endedUnit)
          expect(markerOf(s.outcome.memory.settleDefects)).toContain(endedUnit)
          expect(markerOf(s.outcome.postgres.readDefects)).toContain(endedUnit)
          expect(markerOf(s.outcome.postgres.settleDefects)).toContain(endedUnit)
          expect(s.outcome.memory.outstandingBalance).toBe(0)
          expect(s.outcome.memory.lotQuantity).toBe(10)
          expect(s.outcome.postgres.outstandingBalance).toBe(0)
          expect(s.outcome.postgres.lotQuantity).toBe(10)
        }),
      ),
    )
  })
