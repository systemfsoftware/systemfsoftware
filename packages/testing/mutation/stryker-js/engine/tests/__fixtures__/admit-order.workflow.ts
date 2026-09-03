import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class OrderRequest extends S.TaggedClass<OrderRequest>()('OrderRequest', {
  id: S.String,
}) {}

const OrderDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-engine/tests/OrderDecision')
type OrderDecisionTypeId = typeof OrderDecisionTypeId

export class OrderAdmitted extends S.TaggedClass<OrderAdmitted>()('OrderAdmitted', {
  id: S.String,
}) {
  readonly [OrderDecisionTypeId] = OrderDecisionTypeId
}

export class OrderRejected extends S.TaggedClass<OrderRejected>()('OrderRejected', {
  id: S.String,
  why: S.String,
}) {
  readonly [OrderDecisionTypeId] = OrderDecisionTypeId
}

export type OrderDecision = OrderAdmitted | OrderRejected

export class OrderRefused extends S.TaggedError<OrderRefused>()('OrderRefused', {
  id: S.String,
  why: S.String,
}) {}

export const admitOrder = Workflow.make(
  OrderRequest,
  (request: OrderRequest): Result.Result<OrderDecision, OrderRefused> =>
    Match.value(request.id.length === 0).pipe(
      Match.when(true, () => Result.fail(new OrderRefused({ id: request.id, why: 'empty' }))),
      Match.when(false, () =>
        Match.value(request.id.length >= 3).pipe(
          Match.when(true, () => Result.succeed(new OrderAdmitted({ id: request.id }))),
          Match.when(false, () => Result.succeed(new OrderRejected({ id: request.id, why: 'too short' }))),
          Match.exhaustive,
        )),
      Match.exhaustive,
    ),
)
