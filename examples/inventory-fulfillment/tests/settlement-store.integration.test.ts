import { Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { SettlementStore } from '@systemfsoftware/example-inventory-fulfillment'
import type {
  Fulfillment,
  Inventory,
  SettlementOutcome,
  SettlementStoreService,
} from '@systemfsoftware/example-inventory-fulfillment'
import { Effect, Equal } from 'effect'
import { expect } from 'vitest'
import {
  acrossStores,
  FIRST_CUSTOMER,
  FIRST_LOT,
  FIRST_SKU,
  lotQuantityOf,
  lotVersionOf,
  readCreditOf,
  SECOND_CUSTOMER,
  SECOND_LOT,
  SECOND_SKU,
  settlementCommandOf,
  settlementCommandWithoutCharge,
  settlementStoreWorld,
} from './__fixtures__/settlement-store.fixture.js'
interface OrderInput {
  readonly orderId: string
  readonly customerId: string
  readonly sku: string
  readonly lotId: string
  readonly quantity: number
  readonly charge: number
}

const Feature = makeFeature({ it, layer })

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

const settleOrder = (store: SettlementStoreService, input: OrderInput): Effect.Effect<SettlementOutcome> =>
  Effect.gen(function*() {
    const credit = yield* readCreditOf(store, input.customerId)
    const stock = yield* store.readAllStock
    return yield* store.settle(settlementCommandOf({
      ...input,
      creditProof: credit.proof,
      stockProof: stock.proof,
    }))
  })

const settleWithoutCharge = (store: SettlementStoreService, input: OrderInput): Effect.Effect<SettlementOutcome> =>
  Effect.gen(function*() {
    const credit = yield* readCreditOf(store, input.customerId)
    const stock = yield* store.readAllStock
    return yield* store.settle(settlementCommandWithoutCharge({
      ...input,
      creditProof: credit.proof,
      stockProof: stock.proof,
    }))
  })

interface FullState {
  readonly outstandingOne: number
  readonly outstandingTwo: number
  readonly quantityOne: number
  readonly quantityTwo: number
  readonly versionOne: number
  readonly versionTwo: number
}

interface SettlementLaw {
  readonly outcome: SettlementOutcome
  readonly outstandingBalance: number
  readonly creditProofUnchanged: boolean
  readonly lotQuantity: number
  readonly lotVersion: number
}

interface RepeatedReadResult {
  readonly firstStock: readonly Inventory.Schema.WarehouseStockPartition[]
  readonly secondStock: readonly Inventory.Schema.WarehouseStockPartition[]
  readonly firstCredit: Fulfillment.Credit.CreditAccount
  readonly secondCredit: Fulfillment.Credit.CreditAccount
}

const fullState = (store: SettlementStoreService): Effect.Effect<FullState> =>
  Effect.gen(function*() {
    const one = yield* readCreditOf(store, FIRST_CUSTOMER)
    const two = yield* readCreditOf(store, SECOND_CUSTOMER)
    const stock = yield* store.readAllStock
    return {
      outstandingOne: one.account.outstandingBalance,
      outstandingTwo: two.account.outstandingBalance,
      quantityOne: lotQuantityOf(stock, FIRST_LOT),
      quantityTwo: lotQuantityOf(stock, SECOND_LOT),
      versionOne: lotVersionOf(stock, FIRST_LOT),
      versionTwo: lotVersionOf(stock, SECOND_LOT),
    }
  })

const readSeesTheWrite: Effect.Effect<
  {
    readonly outcome: SettlementOutcome
    readonly outstandingBalance: number
    readonly lotQuantity: number
    readonly lotVersion: number
  },
  never,
  SettlementStore
> = Effect.flatMap(SettlementStore, (store) =>
  Effect.gen(function*() {
    const outcome = yield* settleOrder(store, FIRST_ORDER)
    const after = yield* readCreditOf(store, FIRST_CUSTOMER)
    const stockAfter = yield* store.readAllStock
    return {
      outcome,
      outstandingBalance: after.account.outstandingBalance,
      lotQuantity: lotQuantityOf(stockAfter, FIRST_LOT),
      lotVersion: lotVersionOf(stockAfter, FIRST_LOT),
    }
  }))

const repeatedRead: Effect.Effect<RepeatedReadResult, never, SettlementStore> = Effect.flatMap(
  SettlementStore,
  (store) =>
    Effect.gen(function*() {
      const first = yield* store.readAllStock
      const creditFirst = yield* readCreditOf(store, FIRST_CUSTOMER)
      const second = yield* store.readAllStock
      const creditSecond = yield* readCreditOf(store, FIRST_CUSTOMER)
      return {
        firstStock: first.partitions,
        secondStock: second.partitions,
        firstCredit: creditFirst.account,
        secondCredit: creditSecond.account,
      }
    }),
)

const committedFinalState = (first: OrderInput, second: OrderInput): Effect.Effect<FullState, never, SettlementStore> =>
  Effect.flatMap(SettlementStore, (store) =>
    Effect.gen(function*() {
      yield* settleOrder(store, first)
      yield* settleOrder(store, second)
      return yield* fullState(store)
    }))

const settledWithoutCharge: Effect.Effect<SettlementLaw, never, SettlementStore> = Effect.flatMap(
  SettlementStore,
  (store) =>
    Effect.gen(function*() {
      const before = yield* readCreditOf(store, FIRST_CUSTOMER)
      const outcome = yield* settleWithoutCharge(store, FIRST_ORDER)
      const after = yield* readCreditOf(store, FIRST_CUSTOMER)
      const stock = yield* store.readAllStock
      return {
        outcome,
        outstandingBalance: after.account.outstandingBalance,
        creditProofUnchanged: Equal.equals(before.proof, after.proof),
        lotQuantity: lotQuantityOf(stock, FIRST_LOT),
        lotVersion: lotVersionOf(stock, FIRST_LOT),
      }
    }),
)

const UNCLAIMED_LOT = 'lot-vanished'
const claimedOutsideTheProof: Effect.Effect<SettlementLaw, never, SettlementStore> = Effect.flatMap(
  SettlementStore,
  (store) =>
    Effect.gen(function*() {
      const before = yield* readCreditOf(store, FIRST_CUSTOMER)
      const stock = yield* store.readAllStock
      const outcome = yield* store.settle(settlementCommandOf({
        ...FIRST_ORDER,
        lotId: UNCLAIMED_LOT,
        creditProof: before.proof,
        stockProof: stock.proof,
      }))
      const after = yield* readCreditOf(store, FIRST_CUSTOMER)
      const stockAfter = yield* store.readAllStock
      return {
        outcome,
        outstandingBalance: after.account.outstandingBalance,
        creditProofUnchanged: Equal.equals(before.proof, after.proof),
        lotQuantity: lotQuantityOf(stockAfter, FIRST_LOT),
        lotVersion: lotVersionOf(stockAfter, FIRST_LOT),
      }
    }),
)

const sameProofSettlesTwice: Effect.Effect<
  readonly [SettlementOutcome, SettlementOutcome],
  never,
  SettlementStore
> = Effect.flatMap(SettlementStore, (store) =>
  Effect.gen(function*() {
    const credit = yield* readCreditOf(store, FIRST_CUSTOMER)
    const stock = yield* store.readAllStock
    const both = (orderId: string) =>
      store.settle(settlementCommandOf({
        ...FIRST_ORDER,
        orderId,
        creditProof: credit.proof,
        stockProof: stock.proof,
      }))
    const first = yield* both('order-first')
    const second = yield* both('order-second')
    return [first, second] as const
  }))

const anotherCustomersProof: Effect.Effect<SettlementOutcome, never, SettlementStore> = Effect.flatMap(
  SettlementStore,
  (store) =>
    Effect.gen(function*() {
      const credit = yield* readCreditOf(store, FIRST_CUSTOMER)
      const stock = yield* store.readAllStock
      return yield* store.settle(settlementCommandOf({
        ...FIRST_ORDER,
        orderId: 'order-other',
        customerId: SECOND_CUSTOMER,
        creditProof: credit.proof,
        stockProof: stock.proof,
      }))
    }),
)

const staleStockProof: Effect.Effect<SettlementOutcome, never, SettlementStore> = Effect.flatMap(
  SettlementStore,
  (store) =>
    Effect.gen(function*() {
      const credit = yield* readCreditOf(store, FIRST_CUSTOMER)
      const stock = yield* store.readAllStock
      yield* store.settle(settlementCommandOf({
        ...FIRST_ORDER,
        creditProof: credit.proof,
        stockProof: stock.proof,
      }))
      const refreshed = yield* readCreditOf(store, FIRST_CUSTOMER)
      return yield* store.settle(settlementCommandOf({
        ...FIRST_ORDER,
        orderId: 'order-second',
        creditProof: refreshed.proof,
        stockProof: stock.proof,
      }))
    }),
)

Feature('Settlement stores keep their promises in memory and in Postgres')
  .withScenarioLayer(settlementStoreWorld)
  .body(({ scenario }) => {
    scenario(
      'A settlement that commits is visible to the next read',
      Gherkin.Do.pipe(
        Given('two customers with clean accounts and a stocked warehouse')(
          'outcome',
          () => acrossStores(readSeesTheWrite),
        ),
        Then('the charge, the new balance and the moved stock show up, either way')((s) => {
          const expected = { outcome: 'Committed', outstandingBalance: 9, lotQuantity: 7, lotVersion: 2 }
          expect(s.outcome).toEqual({ memory: expected, postgres: expected })
        }),
      ),
    )

    scenario(
      'A reservation without a charge moves stock but leaves the account alone',
      Gherkin.Do.pipe(
        Given('two customers with clean accounts and a stocked warehouse')(
          'outcome',
          () => acrossStores(settledWithoutCharge),
        ),
        Then('the stock moves while the account balance and its standing stay put, either way')((s) => {
          const expected = {
            outcome: 'Committed',
            outstandingBalance: 0,
            creditProofUnchanged: true,
            lotQuantity: 7,
            lotVersion: 2,
          }
          expect(s.outcome).toEqual({ memory: expected, postgres: expected })
        }),
      ),
    )

    scenario(
      'Reading twice does not move anything',
      Gherkin.Do.pipe(
        Given('two customers with clean accounts and a stocked warehouse')('outcome', () => acrossStores(repeatedRead)),
        Then('both reads see the same account and the same stock')((s) => {
          expect(s.outcome.memory.secondStock).toEqual(s.outcome.memory.firstStock)
          expect(s.outcome.memory.secondCredit).toEqual(s.outcome.memory.firstCredit)
          expect(s.outcome.postgres.secondStock).toEqual(s.outcome.postgres.firstStock)
          expect(s.outcome.postgres.secondCredit).toEqual(s.outcome.postgres.firstCredit)
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
      'Two settlements on the same account state cannot both commit',
      Gherkin.Do.pipe(
        Given('two customers with clean accounts and a stocked warehouse')(
          'outcome',
          () => acrossStores(sameProofSettlesTwice),
        ),
        Then('exactly one of the two settlements commits for each store')((s) => {
          expect(s.outcome).toEqual({ memory: ['Committed', 'Conflict'], postgres: ['Committed', 'Conflict'] })
        }),
      ),
    )

    scenario(
      "A settlement holding another customer's account proof is turned away",
      Gherkin.Do.pipe(
        Given('two customers with clean accounts and a stocked warehouse')(
          'outcome',
          () => acrossStores(anotherCustomersProof),
        ),
        Then('the settlement conflicts for each store')((s) => {
          expect(s.outcome).toEqual({ memory: 'Conflict', postgres: 'Conflict' })
        }),
      ),
    )

    scenario(
      'A settlement whose stock moved after the read is turned away',
      Gherkin.Do.pipe(
        Given('two customers with clean accounts and a stocked warehouse')(
          'outcome',
          () => acrossStores(staleStockProof),
        ),
        Then('the settlement conflicts for each store')((s) => {
          expect(s.outcome).toEqual({ memory: 'Conflict', postgres: 'Conflict' })
        }),
      ),
    )

    scenario(
      'A reservation for a lot the read never vouched for is turned away',
      Gherkin.Do.pipe(
        Given('two customers with clean accounts and a stocked warehouse')(
          'outcome',
          () => acrossStores(claimedOutsideTheProof),
        ),
        Then('the settlement conflicts and nothing moves for each store')((s) => {
          const expected = {
            outcome: 'Conflict',
            outstandingBalance: 0,
            creditProofUnchanged: true,
            lotQuantity: 10,
            lotVersion: 1,
          }
          expect(s.outcome).toEqual({ memory: expected, postgres: expected })
        }),
      ),
    )
  })
