import { Fulfillment, Inventory, SettlementStore } from '@systemfsoftware/example-inventory-fulfillment'
import type {
  CreditObservation,
  SettlementCommand,
  SettlementStoreSeed,
  StockObservation,
} from '@systemfsoftware/example-inventory-fulfillment'
import { Contract, Observation, ObservationWindow, Rel, Stimulus } from '@systemfsoftware/trace-spec'
import { Context, DateTime, Effect, FileSystem, Layer, Option, Result, Schema as S } from 'effect'
import type { DateTime as DateTimeUtc } from 'effect'
import { dual } from 'effect/Function'

const SKU = 'sku-porcelain-mug'
const WAREHOUSE = 'warehouse-north'
const ORDERED_QUANTITY = 2
const STOCKED_QUANTITY = 10
const FRAUD_RISK = 10
const CONTENDED_CUSTOMER = 'customer-in-good-standing'

export interface SettlementRequest {
  readonly order: Fulfillment.Order.Order
  readonly kits: readonly Inventory.Schema.KitDefinition[]
  readonly fraudRisk: Fulfillment.Credit.FraudRiskScore
}

export const settlementRequest: {
  (customerId: string): (orderId: string) => SettlementRequest
  (orderId: string, customerId: string): SettlementRequest
} = dual(
  2,
  (orderId: string, customerId: string): SettlementRequest => ({
    order: Result.getOrThrow(
      S.decodeResult(Fulfillment.Order.Order)({
        orderId,
        customerId,
        lines: [{ sku: SKU, quantity: ORDERED_QUANTITY }],
      }),
    ),
    kits: [],
    fraudRisk: Result.getOrThrow(S.decodeResult(Fulfillment.Credit.FraudRiskScore)(FRAUD_RISK)),
  }),
)

export const settlementSeed = (): SettlementStoreSeed => ({
  warehouses: [{ warehouseId: WAREHOUSE, region: 'north' }],
  lots: [
    { lotId: 'lot-1', sku: SKU, warehouseId: WAREHOUSE, quantityOnHand: STOCKED_QUANTITY, version: 1 },
  ],
  customers: [
    {
      customerId: CONTENDED_CUSTOMER,
      tier: 'Standard',
      creditLimit: 1000,
      outstandingBalance: 0,
      overdraftPrivilege: 0,
    },
    {
      customerId: 'customer-without-credit',
      tier: 'Standard',
      creditLimit: 0,
      outstandingBalance: 0,
      overdraftPrivilege: 0,
    },
  ],
})

const money = (value: number): Fulfillment.Credit.Money =>
  Result.getOrThrow(S.decodeResult(Fulfillment.Credit.Money)(value))

/**
 * A competing settlement commits between this order's read and its settle, so
 * the proofs the order holds no longer describe the store and the commit
 * conflicts for real — no double is asked to return a conflict.
 */
const competingSettlementOf = (
  credit: CreditObservation,
  stock: StockObservation,
  now: DateTimeUtc.Utc,
): SettlementCommand => ({
  orderId: 'competing-order',
  customerId: CONTENDED_CUSTOMER,
  events: [
    new Fulfillment.Event.StockReserved({
      orderId: 'competing-order',
      allocations: [
        Result.getOrThrow(
          S.decodeResult(Inventory.Schema.LotAllocation)({
            warehouseId: WAREHOUSE,
            lotId: 'lot-1',
            sku: SKU,
            quantity: 1,
            version: 1,
          }),
        ),
      ],
      occurredAt: now,
    }),
  ],
  audit: new Fulfillment.Event.AuditPayload({
    orderId: 'competing-order',
    actorId: CONTENDED_CUSTOMER,
    decisionTag: 'AllocatedSplit',
    occurredAt: now,
  }),
  stock: stock.proof,
  charge: Option.some({ amount: money(1), proof: credit.proof }),
})

const contestedSettlementStore: Layer.Layer<SettlementStore> = SettlementStore.memory(settlementSeed()).pipe(
  Layer.flatMap((context) => {
    const store = Context.get(context, SettlementStore)
    return Layer.effect(
      SettlementStore,
      Effect.gen(function*() {
        const credit = yield* Effect.orDie(store.readCredit(CONTENDED_CUSTOMER))
        const stock = yield* store.readAllStock
        const now = yield* DateTime.now
        const competing = competingSettlementOf(credit, stock, now)
        return {
          readCredit: store.readCredit,
          readAllStock: store.readAllStock,
          settle: (command: SettlementCommand) => Effect.flatMap(store.settle(competing), () => store.settle(command)),
        }
      }),
    )
  }),
)

export const recordingFileSystem = Layer.effect(
  FileSystem.FileSystem,
  Effect.sync(() => {
    const files = new Map<string, string>()
    return FileSystem.makeNoop({
      makeDirectory: () => Effect.void,
      writeFileString: (path, data) =>
        Effect.sync(() => {
          files.set(path, data)
        }),
      readFileString: (path) => Effect.succeed(files.get(path) ?? ''),
    })
  }),
)

const observationLayers = Layer.mergeAll(
  ObservationWindow.make('inventory-fulfillment').layer,
  recordingFileSystem,
)

export const settlementLayers: Layer.Layer<
  SettlementStore | Observation.Observation | FileSystem.FileSystem
> = Layer.mergeAll(SettlementStore.memory(settlementSeed()), observationLayers)

export const contestedSettlementLayers: Layer.Layer<
  SettlementStore | Observation.Observation | FileSystem.FileSystem
> = Layer.mergeAll(contestedSettlementStore, observationLayers)

export const settlement = Stimulus.make({
  name: Fulfillment.FulfillmentSettle.id,
  run: ({ input }: { readonly input: SettlementRequest }) => Effect.result(Fulfillment.fulfillmentCell.run(input)),
})

export const allocateContract = Contract.of(Fulfillment.fulfillmentTaxonomy)
  .stimulate(settlement)
  .holds(
    Rel.all(
      Rel.exists(Fulfillment.FulfillmentSettle),
      Rel.exists(Fulfillment.ReservationCommit),
      Rel.exists(Fulfillment.CreditCharge),
      Rel.fromTaxonomy(Fulfillment.fulfillmentTaxonomy, { path: 'allocate' }),
    ),
  )

export const creditHoldContract = Contract.of(Fulfillment.fulfillmentTaxonomy)
  .stimulate(settlement)
  .holds(
    Rel.all(
      Rel.exists(Fulfillment.FulfillmentSettle),
      Rel.absent(Fulfillment.CreditCharge),
      Rel.fromTaxonomy(Fulfillment.fulfillmentTaxonomy, { path: 'hold' }),
    ),
  )

export const disparityOf = (failure: Contract.CheckFailure<never>): Contract.TraceDisparityError => {
  if (!S.is(Contract.TraceDisparityError)(failure)) {
    throw new Error('the refusal was not a trace disparity')
  }
  return failure
}
