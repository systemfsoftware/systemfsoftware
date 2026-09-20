import { Effect, Schema as S } from 'effect'
import { type CreditAccount, CustomerTier } from '../domain/credit.schema.js'
import type { AuditPayload } from '../domain/event.schema.js'
import type { LotAllocation, StockLot, WarehouseStockPartition } from '../domain/inventory.schema.js'
import {
  AuditPayloadFromRow,
  CreditAccountFromRow,
  LotAllocationFromRow,
  StockLotFromRow,
  WarehouseStockPartitionFromRow,
} from './rows.schema.js'

export const decodeStockLot = (row: unknown): Effect.Effect<StockLot, S.SchemaError> =>
  S.decodeUnknownEffect(StockLotFromRow)(row)

export const decodeWarehouseStockPartition = (
  row: unknown,
): Effect.Effect<WarehouseStockPartition, S.SchemaError> => S.decodeUnknownEffect(WarehouseStockPartitionFromRow)(row)

export const decodeLotAllocation = (row: unknown): Effect.Effect<LotAllocation, S.SchemaError> =>
  S.decodeUnknownEffect(LotAllocationFromRow)(row)

export const decodeCreditAccount = (row: unknown): Effect.Effect<CreditAccount, S.SchemaError> =>
  S.decodeUnknownEffect(CreditAccountFromRow)(row)

export const decodeCustomerTier = (row: unknown): Effect.Effect<CustomerTier, S.SchemaError> =>
  S.decodeUnknownEffect(CustomerTier)(row)

export const decodeAuditPayload = (row: unknown): Effect.Effect<AuditPayload, S.SchemaError> =>
  S.decodeUnknownEffect(AuditPayloadFromRow)(row)
