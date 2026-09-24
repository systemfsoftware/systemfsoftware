import { Schema as S } from 'effect'
import { CreditAccount, Money } from '../fulfillment/credit.schema.js'
import { AuditPayload } from '../fulfillment/event.schema.js'
import {
  LotAllocation,
  LotId,
  Quantity,
  QuantityOnHand,
  SkuId,
  StockLot,
  Version,
  WarehouseId,
  WarehouseStockPartition,
} from '../inventory/inventory.schema.js'

const StockLotRow = S.Struct({
  lotId: LotId,
  sku: SkuId,
  warehouseId: WarehouseId,
  quantityOnHand: QuantityOnHand,
  version: Version,
  expiresAt: S.OptionFromNullOr(S.DateTimeUtcFromDate),
})

const WarehouseStockPartitionRow = S.Struct({
  warehouseId: WarehouseId,
  region: S.String,
  lots: S.Array(StockLotRow),
})

const ReservationRow = S.Struct({
  warehouseId: WarehouseId,
  lotId: LotId,
  sku: SkuId,
  quantity: Quantity,
})

const CreditAccountRow = S.Struct({
  customerId: S.String,
  creditLimit: Money,
  outstandingBalance: Money,
  overdraftPrivilege: Money,
})

const AuditEventRow = S.Struct({
  orderId: S.String,
  actorId: S.String,
  decisionTag: S.String,
  occurredAt: S.DateTimeUtcFromDate,
})

export const StockLotFromRow = StockLotRow.pipe(S.decodeTo(StockLot))

export const WarehouseStockPartitionFromRow = WarehouseStockPartitionRow.pipe(
  S.decodeTo(WarehouseStockPartition),
)

export const LotAllocationFromRow = ReservationRow.pipe(S.decodeTo(LotAllocation))

export const CreditAccountFromRow = CreditAccountRow.pipe(S.decodeTo(CreditAccount))

export const AuditPayloadFromRow = AuditEventRow.pipe(S.decodeTo(AuditPayload))
