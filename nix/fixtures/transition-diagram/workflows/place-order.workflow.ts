import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

const DecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/transition-diagram-fixture/Decision')

class PlaceOrder extends Schema.TaggedClass<PlaceOrder>()('PlaceOrder', { orderId: Schema.String }) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

class OrderPlaced extends Schema.TaggedClass<OrderPlaced>()('OrderPlaced', { orderId: Schema.String }) {
  readonly [DecisionTypeId] = DecisionTypeId
}

class OrderRejected extends Schema.TaggedClass<OrderRejected>()('OrderRejected', { reason: Schema.String }) {
  readonly [DecisionTypeId] = DecisionTypeId
}

class OutOfStock extends Schema.TaggedError<OutOfStock>()('OutOfStock', { sku: Schema.String }) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export const placeOrder = Workflow.make({
  command: PlaceOrder,
  decision: Schema.Union([OrderPlaced, OrderRejected]),
  error: OutOfStock,
  decide: (command): Result.Result<OrderPlaced | OrderRejected, OutOfStock> =>
    Match.value(command.orderId.length === 0).pipe(
      Match.when(true, () => Result.succeed(OrderRejected.make({ reason: 'empty order id' }))),
      Match.when(false, () => Result.succeed(OrderPlaced.make({ orderId: command.orderId }))),
      Match.exhaustive,
    ),
})
