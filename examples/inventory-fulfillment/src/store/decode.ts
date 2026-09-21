import { Effect, Schema as S } from 'effect'
import { type CreditAccount, CustomerTier } from '../fulfillment/credit.schema.js'
import type { AuditPayload } from '../fulfillment/event.schema.js'
import type { LotAllocation, StockLot, WarehouseStockPartition } from '../inventory/inventory.schema.js'
import {
  AuditPayloadFromRow,
  CreditAccountFromRow,
  LotAllocationFromRow,
  StockLotFromRow,
  WarehouseStockPartitionFromRow,
} from './rows.schema.js'

export const decodeStockLot = <R = unknown>(row: R): Effect.Effect<StockLot, S.SchemaError> =>
  S.decodeUnknownEffect(StockLotFromRow)(row)

export const decodeWarehouseStockPartition = <R = unknown>(
  row: R,
): Effect.Effect<WarehouseStockPartition, S.SchemaError> => S.decodeUnknownEffect(WarehouseStockPartitionFromRow)(row)

export const decodeLotAllocation = <R = unknown>(row: R): Effect.Effect<LotAllocation, S.SchemaError> =>
  S.decodeUnknownEffect(LotAllocationFromRow)(row)

export const decodeCreditAccount = <R = unknown>(row: R): Effect.Effect<CreditAccount, S.SchemaError> =>
  S.decodeUnknownEffect(CreditAccountFromRow)(row)

export const decodeCustomerTier = <R = unknown>(row: R): Effect.Effect<CustomerTier, S.SchemaError> =>
  S.decodeUnknownEffect(CustomerTier)(row)

export const decodeAuditPayload = <R = unknown>(row: R): Effect.Effect<AuditPayload, S.SchemaError> =>
  S.decodeUnknownEffect(AuditPayloadFromRow)(row)
