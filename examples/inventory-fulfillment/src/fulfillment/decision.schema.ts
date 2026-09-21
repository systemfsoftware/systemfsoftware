import { Schema as S } from 'effect'
import { LotAllocation, SkuId } from '../inventory/inventory.schema.js'
import { Money } from './credit.schema.js'
import { OrderLine } from './order.schema.js'

const FulfillmentDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/FulfillmentDecision',
)
export type FulfillmentDecisionTypeId = typeof FulfillmentDecisionTypeId

const FulfillmentErrorTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/FulfillmentError',
)
export type FulfillmentErrorTypeId = typeof FulfillmentErrorTypeId

export class AllocatedSplit extends S.TaggedClass<AllocatedSplit>()('AllocatedSplit', {
  orderId: S.String,
  allocations: S.Array(LotAllocation),
}) {
  readonly [FulfillmentDecisionTypeId] = FulfillmentDecisionTypeId
}

export class AllocatedWithOverdraft extends S.TaggedClass<AllocatedWithOverdraft>()('AllocatedWithOverdraft', {
  orderId: S.String,
  allocations: S.Array(LotAllocation),
  overdraftAmount: Money,
}) {
  readonly [FulfillmentDecisionTypeId] = FulfillmentDecisionTypeId
}

export class Backordered extends S.TaggedClass<Backordered>()('Backordered', {
  orderId: S.String,
  allocations: S.Array(LotAllocation),
  backorderedLines: S.Array(OrderLine),
}) {
  readonly [FulfillmentDecisionTypeId] = FulfillmentDecisionTypeId
}

export class CreditHold extends S.TaggedClass<CreditHold>()('CreditHold', {
  orderId: S.String,
  shortfall: Money,
  requiredDownpayment: Money,
}) {
  readonly [FulfillmentDecisionTypeId] = FulfillmentDecisionTypeId
}

export class ConflictRollback extends S.TaggedClass<ConflictRollback>()('ConflictRollback', {
  orderId: S.String,
  attempts: S.Int,
}) {
  readonly [FulfillmentDecisionTypeId] = FulfillmentDecisionTypeId
}

export const CoreFulfillmentDecision = S.Union([AllocatedSplit, AllocatedWithOverdraft, Backordered, CreditHold])
export type CoreFulfillmentDecision = S.Schema.Type<typeof CoreFulfillmentDecision>

export const FulfillmentDecision = S.Union([
  AllocatedSplit,
  AllocatedWithOverdraft,
  Backordered,
  CreditHold,
  ConflictRollback,
])
export type FulfillmentDecision = S.Schema.Type<typeof FulfillmentDecision>

export class InsufficientStock extends S.TaggedError<InsufficientStock>()('InsufficientStock', {
  sku: SkuId,
  requested: S.Int,
  available: S.Int,
}) {
  readonly [FulfillmentErrorTypeId] = FulfillmentErrorTypeId
}

export class CreditLimitExceeded extends S.TaggedError<CreditLimitExceeded>()('CreditLimitExceeded', {
  customerId: S.String,
  requested: Money,
  available: Money,
}) {
  readonly [FulfillmentErrorTypeId] = FulfillmentErrorTypeId
}

export class Unauthorized extends S.TaggedError<Unauthorized>()('Unauthorized', {
  reason: S.String,
}) {
  readonly [FulfillmentErrorTypeId] = FulfillmentErrorTypeId
}

export class Forbidden extends S.TaggedError<Forbidden>()('Forbidden', {
  resource: S.String,
  reason: S.String,
}) {
  readonly [FulfillmentErrorTypeId] = FulfillmentErrorTypeId
}

export class DuplicateOrder extends S.TaggedError<DuplicateOrder>()('DuplicateOrder', {
  orderId: S.String,
  reason: S.String,
}) {
  readonly [FulfillmentErrorTypeId] = FulfillmentErrorTypeId
}

export class CreditAccountNotFound extends S.TaggedError<CreditAccountNotFound>()('CreditAccountNotFound', {
  customerId: S.String,
  reason: S.String,
}) {
  readonly [FulfillmentErrorTypeId] = FulfillmentErrorTypeId
}

export class AuthServiceUnavailable extends S.TaggedError<AuthServiceUnavailable>()('AuthServiceUnavailable', {
  reason: S.String,
}) {
  readonly [FulfillmentErrorTypeId] = FulfillmentErrorTypeId
}
export class OptimisticConflict extends S.TaggedError<OptimisticConflict>()('OptimisticConflict', {}) {
  readonly [FulfillmentErrorTypeId] = FulfillmentErrorTypeId
}

export const FulfillmentError = S.Union([InsufficientStock, CreditLimitExceeded, Unauthorized, Forbidden])
export type FulfillmentError = S.Schema.Type<typeof FulfillmentError>
