import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

const DecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/transition-diagram-fixture/RefundDecision')
type DecisionTypeId = typeof DecisionTypeId

export class RefundOrderCommand extends Schema.Class<RefundOrderCommand>('RefundOrderCommand')({
  orderId: Schema.String,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export class RefundApproved extends Schema.TaggedClass<RefundApproved>()('RefundApproved', {
  orderId: Schema.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class RefundQueued extends Schema.TaggedClass<RefundQueued>()('RefundQueued', {
  orderId: Schema.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class RefundRejected extends Schema.TaggedError<RefundRejected>()('RefundRejected', {
  reason: Schema.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId

  override get message(): string {
    return `refund rejected: ${this.reason}`
  }
}

export const RefundDecision = Schema.Union([RefundApproved, RefundQueued])
export const RefundError = Schema.Union([RefundRejected])

export const refundOrder = Workflow.make({
  command: RefundOrderCommand,
  decision: RefundDecision,
  error: RefundError,
  decide: (command): Result.Result<RefundApproved | RefundQueued, RefundRejected> =>
    Match.value(command.orderId.length > 3).pipe(
      Match.when(true, () => Result.succeed(RefundApproved.make({ orderId: command.orderId }))),
      Match.when(false, () => Result.succeed(RefundQueued.make({ orderId: command.orderId }))),
      Match.exhaustive,
    ),
})
