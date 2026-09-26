import { Cause, Schema as S } from 'effect'
import { LotAllocation, Quantity, QuantityOnHand, SkuId } from '../inventory/inventory.schema.js'
import { Money } from './credit.schema.js'
import { OrderLine } from './order.schema.js'

const FulfillmentErrorTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/FulfillmentError',
)
export type FulfillmentErrorTypeId = typeof FulfillmentErrorTypeId

export const AllocatedSplit = S.TaggedStruct('AllocatedSplit', {
  orderId: S.String,
  allocations: S.Array(LotAllocation),
})
export type AllocatedSplit = S.Schema.Type<typeof AllocatedSplit>

export const AllocatedWithOverdraft = S.TaggedStruct('AllocatedWithOverdraft', {
  orderId: S.String,
  allocations: S.Array(LotAllocation),
  overdraftAmount: Money,
})
export type AllocatedWithOverdraft = S.Schema.Type<typeof AllocatedWithOverdraft>

export const Backordered = S.TaggedStruct('Backordered', {
  orderId: S.String,
  allocations: S.Array(LotAllocation),
  backorderedLines: S.Array(OrderLine),
})
export type Backordered = S.Schema.Type<typeof Backordered>

export const CreditHold = S.TaggedStruct('CreditHold', {
  orderId: S.String,
  shortfall: Money,
  requiredDownpayment: Money,
})
export type CreditHold = S.Schema.Type<typeof CreditHold>

export const FulfillmentDecision = S.Union([
  AllocatedSplit,
  AllocatedWithOverdraft,
  Backordered,
  CreditHold,
])
export type FulfillmentDecision = S.Schema.Type<typeof FulfillmentDecision>

export class InsufficientStock extends S.TaggedError<InsufficientStock>()('InsufficientStock', {
  sku: SkuId,
  requested: Quantity,
  available: QuantityOnHand,
}) {
  readonly [FulfillmentErrorTypeId] = FulfillmentErrorTypeId

  override get message(): string {
    return `Insufficient stock for "${this.sku}": requested ${this.requested}, available ${this.available}`
  }
}

export class CreditLimitExceeded extends S.TaggedError<CreditLimitExceeded>()('CreditLimitExceeded', {
  customerId: S.String,
  requested: Money,
  available: Money,
}) {
  readonly [FulfillmentErrorTypeId] = FulfillmentErrorTypeId

  override get message(): string {
    return `Credit limit exceeded for customer "${this.customerId}": requested ${this.requested}, available ${this.available}`
  }
}

export class Unauthorized extends S.TaggedError<Unauthorized>()('Unauthorized', {
  reason: S.String,
}) {
  readonly [FulfillmentErrorTypeId] = FulfillmentErrorTypeId

  override get message(): string {
    return this.reason
  }
}

export class Forbidden extends S.TaggedError<Forbidden>()('Forbidden', {
  resource: S.String,
  reason: S.String,
}) {
  readonly [FulfillmentErrorTypeId] = FulfillmentErrorTypeId

  override get message(): string {
    return `The caller may not act on "${this.resource}": ${this.reason}`
  }
}

export class DuplicateOrder extends S.TaggedError<DuplicateOrder>()('DuplicateOrder', {
  orderId: S.String,
  reason: S.String,
}) {
  readonly [FulfillmentErrorTypeId] = FulfillmentErrorTypeId

  override get message(): string {
    return `Order "${this.orderId}" was already fulfilled: ${this.reason}`
  }
}

export class CreditAccountNotFound extends S.TaggedError<CreditAccountNotFound>()('CreditAccountNotFound', {
  customerId: S.String,
  reason: S.String,
}) {
  readonly [FulfillmentErrorTypeId] = FulfillmentErrorTypeId

  override get message(): string {
    return `No credit account for customer "${this.customerId}": ${this.reason}`
  }
}

const firstLine = (text: string): string => text.split('\n')[0] ?? ''

export class AuthServiceUnavailable extends S.TaggedError<AuthServiceUnavailable>()('AuthServiceUnavailable', {
  cause: S.Defect(),
}) {
  readonly [FulfillmentErrorTypeId] = FulfillmentErrorTypeId

  override get message(): string {
    return `The auth service is unavailable: ${firstLine(Cause.pretty(Cause.die(this.cause)))}`
  }
}
export class StoreUnavailable extends S.TaggedError<StoreUnavailable>()('StoreUnavailable', {
  cause: S.Defect(),
}) {
  readonly [FulfillmentErrorTypeId] = FulfillmentErrorTypeId

  override get message(): string {
    return `The inventory store is unavailable: ${firstLine(Cause.pretty(Cause.die(this.cause)))}`
  }
}

export const FulfillmentError = S.Union([InsufficientStock, CreditLimitExceeded, Unauthorized, Forbidden])
export type FulfillmentError = S.Schema.Type<typeof FulfillmentError>

export const FulfillmentRefusal = S.Union([InsufficientStock, CreditLimitExceeded])
export type FulfillmentRefusal = S.Schema.Type<typeof FulfillmentRefusal>
