import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

const DecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/transition-diagram-fixture/Decision')
type DecisionTypeId = typeof DecisionTypeId

export class PlaceOrderCommand extends Schema.Class<PlaceOrderCommand>('PlaceOrderCommand')({
  orderId: Schema.String,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export class OrderApproved extends Schema.TaggedClass<OrderApproved>()('OrderApproved', {
  orderId: Schema.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class OrderRejected extends Schema.TaggedClass<OrderRejected>()('OrderRejected', {
  reason: Schema.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class OutOfStock extends Schema.TaggedError<OutOfStock>()('OutOfStock', {
  sku: Schema.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId

  override get message(): string {
    return `out of stock: ${this.sku}`
  }
}

export class PaymentFailed extends Schema.TaggedError<PaymentFailed>()('PaymentFailed', {
  orderId: Schema.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId

  override get message(): string {
    return `payment failed: ${this.orderId}`
  }
}

export const OrderDecision = Schema.Union([OrderApproved, OrderRejected])
export const OrderError = Schema.Union([OutOfStock, PaymentFailed])

export const placeOrder = Workflow.make({
  command: PlaceOrderCommand,
  decision: OrderDecision,
  error: OrderError,
  decide: (command): Result.Result<OrderApproved | OrderRejected, OutOfStock | PaymentFailed> =>
    Match.value(command.orderId.length > 0).pipe(
      Match.when(true, () => Result.succeed(OrderApproved.make({ orderId: command.orderId }))),
      Match.when(false, () => Result.succeed(OrderRejected.make({ reason: 'empty order id' }))),
      Match.exhaustive,
    ),
})
