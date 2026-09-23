import { CreditLedger, Fulfillment, Inventory, ReservationLog } from '@systemfsoftware/example-inventory-fulfillment'
import { Contract, Observation, ObservationWindow, Rel, Stimulus } from '@systemfsoftware/trace-spec'
import { Array as Arr, Effect, FileSystem, Layer, Option, Result, Schema as S } from 'effect'

const SKU = 'sku-porcelain-mug'
const WAREHOUSE = 'warehouse-north'
const ORDERED_QUANTITY = 2
const STOCKED_QUANTITY = 10
const FRAUD_RISK = 10

export interface SettlementRequest {
  readonly order: Fulfillment.Order.Order
  readonly kits: readonly Inventory.Schema.KitDefinition[]
  readonly fraudRisk: Fulfillment.Credit.FraudRiskScore
}

const stockLot = (): Inventory.Schema.StockLot =>
  Result.getOrThrow(
    S.decodeResult(Inventory.Schema.StockLot)({
      lotId: 'lot-1',
      sku: SKU,
      warehouseId: WAREHOUSE,
      quantityOnHand: STOCKED_QUANTITY,
      version: 1,
      expiresAt: Option.none(),
    }),
  )

export const stockPartition = (): Inventory.Schema.WarehouseStockPartition =>
  Result.getOrThrow(
    S.decodeResult(Inventory.Schema.WarehouseStockPartition)({
      warehouseId: WAREHOUSE,
      region: 'north',
      lots: [stockLot()],
    }),
  )

export const settlementRequest = (orderId: string, customerId: string): SettlementRequest => ({
  order: Result.getOrThrow(
    S.decodeResult(Fulfillment.Order.Order)({
      orderId,
      customerId,
      lines: [{ sku: SKU, quantity: ORDERED_QUANTITY }],
    }),
  ),
  kits: [],
  fraudRisk: Result.getOrThrow(S.decodeResult(Fulfillment.Credit.FraudRiskScore)(FRAUD_RISK)),
})

const partitionOffering = (
  partition: Inventory.Schema.WarehouseStockPartition,
  skus: readonly Inventory.Schema.SkuId[],
): boolean => Arr.some(partition.lots, (lot) => Arr.contains(skus, lot.sku))

export const inventoryStoreLayer = (
  partitions: readonly Inventory.Schema.WarehouseStockPartition[],
): Layer.Layer<Inventory.InventoryStore> =>
  Layer.succeed(Inventory.InventoryStore, {
    readAllStock: Effect.succeed(partitions),
    readStock: (skus) => Effect.succeed(Arr.filter(partitions, (partition) => partitionOffering(partition, skus))),
    readStockPage: () => Effect.succeed({ partitions, nextCursor: Option.none() }),
  })

const creditAccount = (customerId: string, creditLimit: number): Fulfillment.Credit.CreditAccount =>
  Result.getOrThrow(
    S.decodeResult(Fulfillment.Credit.CreditAccount)({
      customerId,
      creditLimit,
      outstandingBalance: 0,
      overdraftPrivilege: 0,
    }),
  )

export const creditLedgerLayer = (limits: Readonly<Record<string, number>>): Layer.Layer<CreditLedger> =>
  Layer.succeed(CreditLedger, {
    readCredit: (customerId) =>
      Effect.succeed({ account: creditAccount(customerId, limits[customerId] ?? 0), tier: 'Standard' }),
    charge: () => Effect.void,
  })

export type CommitOutcome = 'Committed' | 'VersionConflict'

export const reservationLogLayer = (outcomes: Readonly<Record<string, CommitOutcome>>): Layer.Layer<ReservationLog> =>
  Layer.succeed(ReservationLog, {
    findReservation: () => Effect.succeedNone,
    commit: (commit) => Effect.succeed(outcomes[commit.orderId] ?? 'Committed'),
  })

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

export const settlementLayers = (options: {
  readonly creditLimits: Readonly<Record<string, number>>
  readonly commitOutcomes: Readonly<Record<string, CommitOutcome>>
}): Layer.Layer<
  Inventory.InventoryStore | CreditLedger | ReservationLog | Observation.Observation | FileSystem.FileSystem
> =>
  Layer.mergeAll(
    inventoryStoreLayer([stockPartition()]),
    creditLedgerLayer(options.creditLimits),
    reservationLogLayer(options.commitOutcomes),
    ObservationWindow.make('inventory-fulfillment').layer,
    recordingFileSystem,
  )

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

export type CheckFailure =
  | Contract.ContractDecodeError
  | Observation.EmptyObservationError
  | Contract.TraceDisparityError

export const disparityOf = (failure: CheckFailure): Contract.TraceDisparityError => {
  if (!S.is(Contract.TraceDisparityError)(failure)) {
    throw new Error('the refusal was not a trace disparity')
  }
  return failure
}
