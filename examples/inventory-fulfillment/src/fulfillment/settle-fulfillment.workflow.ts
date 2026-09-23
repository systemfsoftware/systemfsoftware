import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import {
  InsufficientStock,
  LotReservation,
  StockAllocated,
  StockBackordered,
  UnfulfilledDemand,
} from '../inventory/allocate-stock.workflow.js'
import { CreditGranted, CreditHold, CreditLimitExceeded } from './check-credit.workflow.js'

const FulfillmentDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/SettleFulfillmentDecision',
)
type FulfillmentDecisionTypeId = typeof FulfillmentDecisionTypeId

const FulfillmentAmount = S.Finite.pipe(S.check(S.isGreaterThanOrEqualTo(0)))

export class OrderAllocated extends S.TaggedClass<OrderAllocated>()('OrderAllocated', {
  orderId: S.String,
  reservations: S.Array(LotReservation),
}) {
  readonly [FulfillmentDecisionTypeId] = FulfillmentDecisionTypeId
}

export class OrderAllocatedWithOverdraft extends S.TaggedClass<OrderAllocatedWithOverdraft>()(
  'OrderAllocatedWithOverdraft',
  {
    orderId: S.String,
    reservations: S.Array(LotReservation),
    overdraftAmount: FulfillmentAmount,
  },
) {
  readonly [FulfillmentDecisionTypeId] = FulfillmentDecisionTypeId
}

export class OrderBackordered extends S.TaggedClass<OrderBackordered>()('OrderBackordered', {
  orderId: S.String,
  reservations: S.Array(LotReservation),
  backordered: S.Array(UnfulfilledDemand),
}) {
  readonly [FulfillmentDecisionTypeId] = FulfillmentDecisionTypeId
}

export class OrderHeld extends S.TaggedClass<OrderHeld>()('OrderHeld', {
  orderId: S.String,
  shortfall: FulfillmentAmount,
  requiredDownpayment: FulfillmentAmount,
}) {
  readonly [FulfillmentDecisionTypeId] = FulfillmentDecisionTypeId
}

export class SettleFulfillmentCommand extends S.Class<SettleFulfillmentCommand>('SettleFulfillmentCommand')({
  orderId: S.String,
  credit: S.Union([CreditGranted, CreditHold, CreditLimitExceeded]),
  allocation: S.Union([StockAllocated, StockBackordered, InsufficientStock]),
}) {
  static readonly [Workflow.InstrumentationBrand] = { orderId: 'app.order.id' } as const
}

const allocatedDecision = (
  orderId: string,
  granted: CreditGranted,
  allocated: StockAllocated,
): OrderAllocated | OrderAllocatedWithOverdraft =>
  Match.value(granted.overdraftAmount === 0).pipe(
    Match.when(true, () => new OrderAllocated({ orderId, reservations: allocated.reservations })),
    Match.when(false, () =>
      new OrderAllocatedWithOverdraft({
        orderId,
        reservations: allocated.reservations,
        overdraftAmount: granted.overdraftAmount,
      })),
    Match.exhaustive,
  )

export const settleFulfillment = Workflow.make(
  SettleFulfillmentCommand,
  (
    command,
  ): Result.Result<
    OrderAllocated | OrderAllocatedWithOverdraft | OrderBackordered | OrderHeld,
    InsufficientStock | CreditLimitExceeded
  > =>
    Match.value(command.credit).pipe(
      Match.tag('CreditLimitExceeded', (refusal) => Result.fail(refusal)),
      Match.tag('CreditHold', (held) =>
        Result.succeed(
          new OrderHeld({
            orderId: command.orderId,
            shortfall: held.shortfall,
            requiredDownpayment: held.requiredDownpayment,
          }),
        )),
      Match.tag('CreditGranted', (granted) =>
        Match.value(command.allocation).pipe(
          Match.tag('InsufficientStock', (refusal) => Result.fail(refusal)),
          Match.tag('StockBackordered', (backordered) =>
            Result.succeed(
              new OrderBackordered({
                orderId: command.orderId,
                reservations: backordered.reservations,
                backordered: backordered.backordered,
              }),
            )),
          Match.tag(
            'StockAllocated',
            (allocated) => Result.succeed(allocatedDecision(command.orderId, granted, allocated)),
          ),
          Match.exhaustive,
        )),
      Match.exhaustive,
    ),
)
