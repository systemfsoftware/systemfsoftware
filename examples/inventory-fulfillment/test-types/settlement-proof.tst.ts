import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core'
import { Effect, Option } from 'effect'
import type { SchemaError } from 'effect/Schema'
import { describe, expect, it } from 'tstyche'
import type { CreditAccount, CustomerTier, Money } from '../src/fulfillment/credit.schema.js'
import { CreditAccountNotFound } from '../src/fulfillment/decision.schema.js'
import type { AuditPayload, InventoryReservationEvents } from '../src/fulfillment/event.schema.js'
import type { WarehouseStockPartition } from '../src/inventory/inventory.schema.js'
import type {
  CreditObservation,
  CreditProof,
  SettlementOutcome,
  SettlementStoreService,
  StockObservation,
  StockProof,
} from '../src/ports/SettlementStore.js'

declare const store: SettlementStoreService
declare const customerId: string
declare const orderId: string
declare const events: readonly InventoryReservationEvents[]
declare const audit: AuditPayload
declare const amount: Money
declare const creditProof: CreditProof
declare const stockProof: StockProof

describe('SettlementStore.readCredit', () => {
  it('returns the account, the tier and a proof of the read', () => {
    expect(store.readCredit(customerId)).type.toBe<
      Effect.Effect<CreditObservation, CreditAccountNotFound | SchemaError | EffectDrizzleQueryError>
    >()
  })
})

describe('SettlementStore.readAllStock', () => {
  it('returns the partitions and a proof of the read', () => {
    expect(store.readAllStock).type.toBe<Effect.Effect<StockObservation>>()
  })
})

describe('SettlementStore.settle', () => {
  it('answers whether the settlement committed or conflicted', () => {
    expect(store.settle({
      orderId,
      customerId,
      events,
      audit,
      stock: stockProof,
      charge: Option.some({ amount, proof: creditProof }),
    })).type.toBe<Effect.Effect<SettlementOutcome>>()
  })

  it('settles a command carrying both store proofs', () => {
    expect(store.settle).type.toBeCallableWith({
      orderId,
      customerId,
      events,
      audit,
      stock: stockProof,
      charge: Option.some({ amount, proof: creditProof }),
    })
  })

  it('rejects a charge without the credit proof', () => {
    expect(store.settle).type.not.toBeCallableWith({
      orderId,
      customerId,
      events,
      audit,
      stock: stockProof,
      charge: Option.some({ amount }),
    })
  })

  it('rejects a hand-built credit proof', () => {
    expect(store.settle).type.not.toBeCallableWith({
      orderId,
      customerId,
      events,
      audit,
      stock: stockProof,
      charge: Option.some({ amount, proof: { customerId, version: 1 } }),
    })
  })

  it('rejects the stock proof in the credit slot', () => {
    expect(store.settle).type.not.toBeCallableWith({
      orderId,
      customerId,
      events,
      audit,
      stock: stockProof,
      charge: Option.some({ amount, proof: stockProof }),
    })
  })

  it('rejects a hand-built stock proof', () => {
    expect(store.settle).type.not.toBeCallableWith({
      orderId,
      customerId,
      events,
      audit,
      stock: { versions: { 'lot-1': 1 } },
      charge: Option.some({ amount, proof: creditProof }),
    })
  })

  it('settles proofs that came from this store reads', () => {
    const settled = Effect.gen(function*() {
      const credit = yield* store.readCredit(customerId)
      const stock = yield* store.readAllStock
      return yield* store.settle({
        orderId,
        customerId,
        events,
        audit,
        stock: stock.proof,
        charge: Option.some({ amount, proof: credit.proof }),
      })
    })
    expect(settled).type.toBe<
      Effect.Effect<SettlementOutcome, CreditAccountNotFound | SchemaError | EffectDrizzleQueryError>
    >()
  })
})

describe('settlement observation shapes', () => {
  it('names the proof in the credit read', () => {
    expect(store.readCredit(customerId)).type.toBe<
      Effect.Effect<
        { readonly account: CreditAccount; readonly tier: CustomerTier; readonly proof: CreditProof },
        CreditAccountNotFound | SchemaError | EffectDrizzleQueryError
      >
    >()
  })

  it('carries the observed lot versions in the stock read', () => {
    expect(store.readAllStock).type.toBe<
      Effect.Effect<{
        readonly partitions: readonly WarehouseStockPartition[]
        readonly proof: StockProof
      }>
    >()
  })
})
