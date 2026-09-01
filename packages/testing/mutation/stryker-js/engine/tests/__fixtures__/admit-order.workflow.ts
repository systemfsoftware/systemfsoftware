import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class OrderRequest extends S.TaggedClass<OrderRequest>()('OrderRequest', {
  id: S.String,
}) {}

export class OrderAdmitted extends S.TaggedClass<OrderAdmitted>()('OrderAdmitted', {
  id: S.String,
}) {}

export class OrderRefused extends S.TaggedError<OrderRefused>()('OrderRefused', {
  id: S.String,
  why: S.String,
}) {}

export const admitOrder = Workflow.make(
  OrderRequest,
  (request: OrderRequest): Result.Result<OrderAdmitted, OrderRefused> =>
    Match.value(request.id.length >= 3).pipe(
      Match.when(true, () => Result.succeed(new OrderAdmitted({ id: request.id }))),
      Match.when(false, () => Result.fail(new OrderRefused({ id: request.id, why: 'too short' }))),
      Match.exhaustive,
    ),
)
